// SOLO SERVIDOR. Crea un tablero real a partir de una DEFINICIÓN (plantilla o importación de
// Monday): asigna ids nuevos y traduce las claves de columna en los valores. Si algo falla a medio
// camino, borra el tablero (en cascada) para no dejarlo a medias.

import { randomUUID } from "node:crypto";
import { enTrozos, getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import type { AppUser } from "@/lib/permissions";
import type { Json, TablesInsert } from "@/types/supabase";
import { tipoColumna } from "../dominio/tipos-columna";
import { categoriaValida, limpiarTexto, MAX_NOMBRE } from "../dominio/tablero";
import type { DefinicionTablero } from "../dominio/definicion";

export interface DatosTableroNuevo {
  nombre: unknown;
  codigo?: unknown;
  categoria?: unknown;
  plantillaId?: string | null;
  mondayBoardId?: string | null;
  /** Al volver a importar: los mismos ids de antes (por clave), para que lo que apunta a este
   *  tablero desde otros (relaciones, espejos, permisos) siga funcionando. */
  idsFijos?: { tableroId: string; columnas: Map<string, string>; elementos: Map<string, string> };
}

export async function crearDesdeDefinicion(def: DefinicionTablero, datos: DatosTableroNuevo, me: AppUser): Promise<string> {
  const nombre = limpiarTexto(datos.nombre, MAX_NOMBRE);
  if (!nombre) throw new Error("tablero-sin-nombre");
  const db = getSupabaseAdmin();
  const tableroId = datos.idsFijos?.tableroId ?? randomUUID();
  const ahora = new Date().toISOString();

  const grupoId = new Map(def.grupos.map((g) => [g.clave, randomUUID()]));
  const columnaId = new Map(def.columnas.map((c) => [c.clave, datos.idsFijos?.columnas.get(c.clave) ?? randomUUID()]));
  const elementoId = new Map(def.elementos.map((e) => [e.clave, datos.idsFijos?.elementos.get(e.clave) ?? randomUUID()]));
  const nivelDe = new Map(def.columnas.map((c) => [c.clave, c.nivel]));

  unwrap(await db.from("tableros").insert({
    id: tableroId, nombre, codigo: limpiarTexto(datos.codigo, 30), categoria: categoriaValida(datos.categoria),
    plantilla_id: datos.plantillaId ?? null, monday_board_id: datos.mondayBoardId ?? null, creado_por: me.uid,
    // Lo importado de Monday se sincroniza con Monday hasta el corte (Fase 7).
    sincroniza_monday: !!datos.mondayBoardId,
  }));

  try {
    unwrap(await db.from("tablero_grupos").insert(def.grupos.map((g, i) => ({
      id: grupoId.get(g.clave)!, tablero_id: tableroId, titulo: g.titulo, color: g.color, fase: g.fase, orden: i,
      monday_group_id: g.mondayGrupo ?? null,
    }))));

    // Fórmulas y espejos apuntan a otras columnas por su clave: pasan a los ids nuevos.
    const conIds = (tipo: string, config: unknown): unknown => {
      const cfg = { ...(tipoColumna(tipo)?.config.validar(config) as Record<string, unknown> ?? {}) };
      if (tipo === "formula" && typeof cfg.expresion === "string") {
        cfg.expresion = cfg.expresion.replace(/\{([^}#]+)(#[^}]*)?\}/g, (m: string, ref: string, parte = "") =>
          (columnaId.has(ref) ? `{${columnaId.get(ref)}${parte}}` : m));
      }
      if (tipo === "espejo" && typeof cfg.columna === "string") cfg.columna = columnaId.get(cfg.columna) ?? "";
      return cfg;
    };

    const ordenPorNivel = { item: 0, sub: 0 };
    if (def.columnas.length) {
      unwrap(await db.from("tablero_columnas").insert(def.columnas.map((c) => ({
        id: columnaId.get(c.clave)!, tablero_id: tableroId, nivel: c.nivel, titulo: c.titulo, tipo: c.tipo, rol: c.rol,
        config: conIds(c.tipo, c.config) as Json, orden: ordenPorNivel[c.nivel]++,
        oculta: c.oculta, ancho: c.ancho, monday_column_id: c.mondayColumnId ?? null,
      }))));
    }

    // Valores: clave de columna → id nuevo, y validados otra vez con el registro de tipos.
    const columnasPorClave = new Map(def.columnas.map((c) => [c.clave, c]));
    const ordenHermanos = new Map<string, number>();
    const filas: TablesInsert<"elementos">[] = def.elementos.map((e) => {
      const nivel = e.padre ? "sub" : "item";
      const valores: Record<string, unknown> = {};
      for (const [clave, v] of Object.entries(e.valores)) {
        const c = columnasPorClave.get(clave);
        if (!c || nivelDe.get(clave) !== nivel) continue;
        const tipo = tipoColumna(c.tipo);
        const ok = tipo?.valor.validar(v, tipo.config.validar(c.config));
        if (ok !== null && ok !== undefined) valores[columnaId.get(clave)!] = ok;
      }
      const hermanos = e.padre ?? `g:${e.grupo}`;
      const orden = ordenHermanos.get(hermanos) ?? 0;
      ordenHermanos.set(hermanos, orden + 1);
      return {
        id: elementoId.get(e.clave)!, tablero_id: tableroId,
        grupo_id: e.padre ? null : grupoId.get(e.grupo ?? "") ?? null,
        parent_id: e.padre ? elementoId.get(e.padre) ?? null : null,
        nombre: e.nombre, orden, valores: valores as Json, creado_por: me.uid, creado_at: ahora, actualizado_at: ahora,
        monday_item_id: e.mondayItemId ?? null,
      };
    });
    // Items primero (los subelementos apuntan a ellos).
    for (const lote of enTrozos(filas.filter((f) => !f.parent_id), 500)) unwrap(await db.from("elementos").insert(lote));
    for (const lote of enTrozos(filas.filter((f) => f.parent_id), 500)) unwrap(await db.from("elementos").insert(lote));
    unwrap(await db.rpc("tablero_recalcular_responsables", { p_tablero: tableroId }));
  } catch (e) {
    await db.from("tableros").delete().eq("id", tableroId);
    throw e;
  }
  return tableroId;
}
