// SOLO SERVIDOR. Sincronización con Monday (Fase 5, convivencia): aplica a la base el plan de
// dominio/sincronizar.ts para un tablero, y corre la sincronización COMPLETA (copia de Monday →
// directorio → cada tablero en orden → bitácora y archivos → comparación), dejando registro en
// tablero_sincronizaciones. Solo puede haber una corrida a la vez.

import { randomUUID } from "node:crypto";
import { enTrozos, getSupabaseAdmin, PG, selectAll, unwrap } from "@/lib/supabase-admin";
import type { AppUser } from "@/lib/permissions";
import type { Json, Tables } from "@/types/supabase";
import { sincronizarTodo } from "@/lib/mondayMirrorSync";
import { mismoValor, planSincronizacion, planVacio, type ColumnaActual, type ElementoActual, type GrupoActual } from "../dominio/sincronizar";
import { aColumna, leerTablero, type Acceso } from "./tableros";
import { compararConMonday, definicionDesdeLaCopia, importarBoard, listarBoardsImportables, nombreYCodigo } from "./importar";
import { traerBitacoraYArchivos } from "./importar-extras";
import { importarPersonasDesdeMonday } from "./personas";
import { ErrorTablero } from "./errores";

/** Quién firma lo que entra de Monday (historial) y lo que la sincronización crea. */
export const AUTOR_SINCRONIZACION = "Monday (sincronización)";
const SISTEMA: AppUser = {
  uid: "00000000-0000-4000-8000-0000000005c0", email: AUTOR_SINCRONIZACION, displayName: AUTOR_SINCRONIZACION,
  roleId: "admin", roleName: "Admin", permissions: { pages: {}, actions: { manage_roles: true }, groups: {} }, defaultPage: null,
};
const ACCESO_SISTEMA: Acceso = { usuario: { rolId: "admin", esAdmin: true, personaId: null }, reglas: [] };

// ── Un tablero ───────────────────────────────────────────────────────────────

export interface ResultadoTablero {
  creados: number;
  actualizados: number;
  valores: number;
  archivados: number;
  restaurados: number;
  /** El board se renombró en Monday: el nombre nuevo. */
  renombrado?: string;
  gruposNuevos: string[];
  columnasNuevas: string[];
  etiquetasNuevas: string[];
  columnasFueraDeMonday: string[];
  personasNoEncontradas: string[];
}

/** En paralelo de a `n` (para muchas actualizaciones sueltas). */
async function deA<T>(lista: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => { while (i < lista.length) await fn(lista[i++]); }));
}

/** Trae lo que hay hoy en la copia de Monday a un tablero ya importado, sin rehacerlo.
 *  Con `simular`, solo dice qué cambiaría (no escribe nada). */
export async function sincronizarTablero(tableroId: string, opciones: { simular?: boolean } = {}): Promise<ResultadoTablero & { muestra?: string[] }> {
  const db = getSupabaseAdmin();
  const t = unwrap(await db.from("tableros").select("id, nombre, codigo, monday_board_id, sincroniza_monday").eq("id", tableroId).is("archivado_at", null).maybeSingle());
  if (!t?.monday_board_id) throw new ErrorTablero(400, "Este tablero no viene de Monday");
  if (!t.sincroniza_monday) throw new ErrorTablero(409, "Este tablero ya no se sincroniza con Monday");

  const [copia, grupos, columnas, elementos] = await Promise.all([
    definicionDesdeLaCopia(t.monday_board_id),
    unwrap(await db.from("tablero_grupos").select("*").eq("tablero_id", tableroId)) ?? [],
    unwrap(await db.from("tablero_columnas").select("*").eq("tablero_id", tableroId)) ?? [],
    selectAll<Tables<"elementos">>((d, h) => db.from("elementos").select("*").eq("tablero_id", tableroId).order("id").range(d, h)),
  ]);

  const textos = new Map(copia.filas.map((f) => [f.id, f.column_values]));
  const plan = planSincronizacion({
    actual: {
      grupos: grupos.map((g): GrupoActual => ({ id: g.id, titulo: g.titulo, orden: g.orden, mondayGrupo: g.monday_group_id, archivado: !!g.archivado_at })),
      columnas: columnas.map((c): ColumnaActual => ({ ...aColumna(c), archivada: !!c.archivada_at })),
      elementos: elementos.map((e): ElementoActual => ({
        id: e.id, grupoId: e.grupo_id, parentId: e.parent_id, nombre: e.nombre, orden: e.orden, mondayItemId: e.monday_item_id, archivado: !!e.archivado_at,
        valores: (e.valores && typeof e.valores === "object" && !Array.isArray(e.valores) ? e.valores : {}) as Record<string, unknown>,
      })),
    },
    monday: copia.definicion,
    textoMonday: (item, col) => { const v = textos.get(item)?.find((x) => x.id === col); return v ? (v.display_value ?? "") || (v.text ?? "") || null : null; },
    ctx: { personaPorNombre: copia.personaPorNombre },
    nuevoId: randomUUID,
  });

  const res: ResultadoTablero = {
    creados: plan.elementosNuevos.length, actualizados: plan.elementosCambiados.length,
    valores: plan.elementosCambiados.reduce((n, c) => n + c.cambios.length, 0),
    archivados: plan.archivar.length, restaurados: plan.restaurar.length,
    gruposNuevos: plan.gruposNuevos.map((g) => g.titulo), columnasNuevas: plan.columnasNuevas.map((c) => c.titulo),
    etiquetasNuevas: plan.configs.flatMap((c) => c.agregadas.map((a) => `${c.titulo}: ${a}`)),
    columnasFueraDeMonday: plan.columnasFueraDeMonday, personasNoEncontradas: copia.personasNoEncontradas,
  };
  // El nombre y el código del tablero también vienen de Monday (identifican al proyecto en las métricas).
  const nc = nombreYCodigo(copia.board.nombre, copia.board.tipo);
  const renombrar = nc.nombre !== t.nombre || nc.codigo !== t.codigo;
  if (renombrar) res.renombrado = copia.board.nombre;
  if (opciones.simular) {
    const nombreCol = new Map(columnas.map((c) => [c.id, c.titulo]));
    const nombreEl = new Map(elementos.map((e) => [e.id, e.nombre]));
    const muestra = [
      ...plan.elementosNuevos.map((e) => `nuevo: ${e.nombre}`),
      ...plan.elementosCambiados.flatMap((c) => [
        ...(c.nombre !== undefined ? [`nombre: ${c.antes.nombre} → ${c.nombre}`] : []),
        ...(c.grupoId !== undefined ? [`movido: ${nombreEl.get(c.id)}`] : []),
        ...c.cambios.map((v) => `${nombreEl.get(c.id)} · ${nombreCol.get(v.columnaId) ?? v.columnaId}: ${JSON.stringify(v.antes)} → ${JSON.stringify(v.despues)}`),
      ]),
      ...plan.archivar.map((id) => `archivar: ${nombreEl.get(id)}`),
      ...plan.restaurar.map((id) => `restaurar: ${nombreEl.get(id)}`),
    ];
    return { ...res, muestra };
  }
  if (renombrar) {
    unwrap(await db.from("tableros").update({ nombre: nc.nombre, codigo: nc.codigo, actualizado_at: new Date().toISOString() }).eq("id", tableroId));
    unwrap(await db.from("tablero_historial").insert({
      tablero_id: tableroId, elemento_id: null, campo: "tablero", antes: { nombre: t.nombre, codigo: t.codigo }, despues: nc, usuario_email: AUTOR_SINCRONIZACION,
    }));
  }
  if (planVacio(plan)) return res;

  const ahora = new Date().toISOString();
  const historial: { tablero_id: string; elemento_id: string | null; columna_id?: string | null; campo: string; antes: Json; despues: Json; usuario_email: string }[] = [];
  const anotar = (elementoId: string, campo: string, antes: unknown, despues: unknown, columnaId: string | null = null) =>
    historial.push({ tablero_id: tableroId, elemento_id: elementoId, columna_id: columnaId, campo, antes: (antes ?? null) as Json, despues: (despues ?? null) as Json, usuario_email: AUTOR_SINCRONIZACION });

  // 1) Estructura que Monday agregó: grupos, columnas y etiquetas.
  if (plan.gruposNuevos.length) {
    unwrap(await db.from("tablero_grupos").insert(plan.gruposNuevos.map((g) => ({
      id: g.id, tablero_id: tableroId, titulo: g.titulo, color: g.color, fase: g.fase, orden: g.orden, monday_group_id: g.mondayGrupo,
    }))));
  }
  if (plan.columnasNuevas.length) {
    unwrap(await db.from("tablero_columnas").insert(plan.columnasNuevas.map((c) => ({
      id: c.id, tablero_id: tableroId, nivel: c.nivel, titulo: c.titulo, tipo: c.tipo, rol: null, config: c.config as Json,
      orden: c.orden, oculta: false, ancho: null, monday_column_id: c.mondayColumnId,
    }))));
  }
  for (const c of plan.configs) unwrap(await db.from("tablero_columnas").update({ config: c.config as Json }).eq("id", c.columnaId));

  // 2) Elementos nuevos (items antes que subelementos).
  const filasNuevas = plan.elementosNuevos.map((e) => ({
    id: e.id, tablero_id: tableroId, grupo_id: e.grupoId, parent_id: e.parentId, nombre: e.nombre, orden: e.orden,
    valores: e.valores as Json, monday_item_id: e.mondayItemId, creado_at: ahora, actualizado_at: ahora,
  }));
  for (const lote of enTrozos(filasNuevas.filter((f) => !f.parent_id), 500)) unwrap(await db.from("elementos").insert(lote));
  for (const lote of enTrozos(filasNuevas.filter((f) => f.parent_id), 500)) unwrap(await db.from("elementos").insert(lote));
  for (const e of plan.elementosNuevos) anotar(e.id, "creado", null, { nombre: e.nombre, origen: "Monday" });

  // 3) Elementos que cambiaron en Monday.
  await deA(plan.elementosCambiados, 8, async (c) => {
    const cambios: Record<string, unknown> = { actualizado_at: ahora };
    if (c.nombre !== undefined) { cambios.nombre = c.nombre; anotar(c.id, "nombre", c.antes.nombre, c.nombre); }
    if (c.grupoId !== undefined) {
      Object.assign(cambios, { grupo_id: c.grupoId, parent_id: c.parentId, orden: c.orden });
      if (c.grupoId !== c.antes.grupoId) {
        const titulo = (id: string | null) => grupos.find((g) => g.id === id)?.titulo ?? plan.gruposNuevos.find((g) => g.id === id)?.titulo ?? null;
        anotar(c.id, "movido", titulo(c.antes.grupoId), titulo(c.grupoId));
      }
    }
    if (c.valores) {
      cambios.valores = c.valores;
      for (const v of c.cambios) if (!mismoValor(v.antes, v.despues)) anotar(c.id, "valor", v.antes, v.despues, v.columnaId);
    }
    unwrap(await db.from("elementos").update(cambios as never).eq("id", c.id));
  });

  // 4) Lo que ya no está en Monday se archiva (no se borra); lo que volvió, se restaura.
  for (const lote of enTrozos(plan.archivar, 200)) unwrap(await db.from("elementos").update({ archivado_at: ahora }).in("id", lote));
  for (const lote of enTrozos(plan.restaurar, 200)) unwrap(await db.from("elementos").update({ archivado_at: null }).in("id", lote));
  const nombreDe = new Map(elementos.map((e) => [e.id, e.nombre]));
  for (const id of plan.archivar) anotar(id, "archivado", null, { nombre: nombreDe.get(id), origen: "Monday" });
  for (const id of plan.restaurar) anotar(id, "restaurado", null, { nombre: nombreDe.get(id), origen: "Monday" });

  for (const lote of enTrozos(historial, 500)) unwrap(await db.from("tablero_historial").insert(lote));
  unwrap(await db.rpc("tablero_recalcular_responsables", { p_tablero: tableroId }));
  unwrap(await db.from("tableros").update({ actualizado_at: ahora }).eq("id", tableroId));
  return res;
}

// ── La corrida completa ──────────────────────────────────────────────────────

export interface ResultadoBoardCorrida {
  board: string;
  tipo: string;
  tableroId: string | null;
  importado?: boolean;
  omitido?: string;
  cambios?: ResultadoTablero;
  comentariosNuevos?: number;
  archivosNuevos?: number;
  diferencias?: number;
  avisos?: number;
  error?: string;
}

export interface ResumenCorrida {
  copia?: { ok: boolean; boards: number; errores: string[] };
  directorio?: { nuevas: number; actualizadas: number; desactivadas: number };
  boards: ResultadoBoardCorrida[];
  /** Board en el que va (mientras corre). */
  enCurso?: string | null;
}

export type Origen = "manual" | "programada";

/** Abre una corrida (el candado: si ya hay una en curso, 409). Devuelve su id. */
export async function iniciarCorrida(origen: Origen): Promise<number> {
  const db = getSupabaseAdmin();
  // Una corrida que se cortó (se cerró la PC, se reinició el servidor…) no bloquea para siempre.
  const hace2h = new Date(Date.now() - 2 * 3600_000).toISOString();
  unwrap(await db.from("tablero_sincronizaciones").update({ estado: "fallo", fin: new Date().toISOString(), error: "Se cortó a medias (el proceso se detuvo)" })
    .eq("estado", "en_curso").lt("inicio", hace2h));
  const r = await db.from("tablero_sincronizaciones").insert({ origen }).select("id").single();
  if (r.error?.code === PG.uniqueViolation) throw new ErrorTablero(409, "Ya hay una sincronización en curso");
  return unwrap(r)!.id;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Corre la sincronización completa sobre una corrida ya abierta. No lanza: el resultado queda en la corrida. */
export async function correrSincronizacion(corridaId: number, opciones: { bitacora?: boolean; comparar?: boolean } = {}): Promise<ResumenCorrida> {
  const { bitacora = true, comparar = true } = opciones;
  const db = getSupabaseAdmin();
  const resumen: ResumenCorrida = { boards: [] };
  const guardar = async (extra: Partial<Pick<Tables<"tablero_sincronizaciones">, "fin" | "estado" | "error">> = {}) => {
    await db.from("tablero_sincronizaciones").update({ resumen: resumen as unknown as Json, ...extra }).eq("id", corridaId);
  };
  let fallo: string | null = null;

  try {
    // 1) Copia de Monday (monday_boards / monday_items), con los boards nuevos de la carpeta.
    resumen.enCurso = "Copia de Monday";
    await guardar();
    const copia = await sincronizarTodo("tableros");
    resumen.copia = { ok: copia.ok, boards: copia.boards.length, errores: copia.errores.map((e) => `${e.tipo} ${e.board_id}: ${e.error}`) };

    // 2) Directorio RH → personas (sin deshacer los ligados a mano).
    resumen.enCurso = "Directorio";
    await guardar();
    const dir = await importarPersonasDesdeMonday(false);
    resumen.directorio = { nuevas: dir.nuevas, actualizadas: dir.actualizadas, desactivadas: dir.desactivadas };

    // 3) Cada board, en el orden de importación (las relaciones necesitan su destino al día).
    const boards = await listarBoardsImportables();
    const tableros = unwrap(await db.from("tableros").select("id, monday_board_id, sincroniza_monday, archivado_at").not("monday_board_id", "is", null)) ?? [];
    for (const b of boards) {
      resumen.enCurso = b.nombre;
      await guardar();
      const t = tableros.find((x) => x.monday_board_id === b.id && !x.archivado_at) ?? tableros.find((x) => x.monday_board_id === b.id);
      const r: ResultadoBoardCorrida = { board: b.nombre, tipo: b.tipo, tableroId: t?.id ?? null };
      try {
        if (!t) {
          const imp = await importarBoard(b.id, { refrescar: false, reemplazar: false }, SISTEMA);
          r.tableroId = imp.tableroId;
          r.importado = true;
        } else if (t.archivado_at) { r.omitido = "Tablero archivado en la app"; }
        else if (!t.sincroniza_monday) { r.omitido = "Ya no se sincroniza con Monday"; }
        else r.cambios = await sincronizarTablero(t.id);

        if (r.tableroId && !r.omitido) {
          if (bitacora) {
            const ex = await traerBitacoraYArchivos(r.tableroId);
            r.comentariosNuevos = ex.comentariosNuevos;
            r.archivosNuevos = ex.archivosNuevos;
            if (ex.errores.length) r.error = `Archivos: ${ex.errores.slice(0, 3).join("; ")}`;
          }
          if (comparar) {
            const completo = await leerTablero(r.tableroId, ACCESO_SISTEMA);
            if (completo) {
              const c = await compararConMonday(completo, ACCESO_SISTEMA);
              r.diferencias = c.diferencias.length + c.filas.filter((f) => JSON.stringify(f.monday) !== JSON.stringify(f.app)).length;
              r.avisos = c.avisos.length;
            }
          }
        }
      } catch (e) {
        r.error = mensaje(e);
      }
      resumen.boards.push(r);
    }
  } catch (e) {
    fallo = mensaje(e);
  }

  resumen.enCurso = null;
  const conErrores = !!resumen.copia?.errores.length || resumen.boards.some((b) => b.error);
  await guardar({ fin: new Date().toISOString(), estado: fallo ? "fallo" : conErrores ? "con_errores" : "ok", error: fallo });
  return resumen;
}

export interface Corrida {
  id: number;
  origen: string;
  inicio: string;
  fin: string | null;
  estado: string;
  error: string | null;
  resumen: ResumenCorrida;
}

/** Las últimas corridas (la primera es la más reciente). */
export async function listarCorridas(limite = 10): Promise<Corrida[]> {
  const filas = unwrap(await getSupabaseAdmin().from("tablero_sincronizaciones").select("*").order("inicio", { ascending: false }).limit(limite)) ?? [];
  return filas.map((f) => ({ id: f.id, origen: f.origen, inicio: f.inicio, fin: f.fin, estado: f.estado, error: f.error, resumen: f.resumen as unknown as ResumenCorrida }));
}
