// SOLO SERVIDOR. REGISTRO de operaciones sobre un tablero. Todo cambio entra por aquí: la ruta
// POST /api/tableros/tableros/[id] recibe { op, ...datos } y ejecuta la operación registrada.
// Cada operación revisa su propio permiso con el motor (dominio/permisos.ts) antes de escribir.
// Agregar una funcionalidad = agregar una entrada a OPERACIONES.

import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import type { AppUser } from "@/lib/permissions";
import type { Json, Tables } from "@/types/supabase";
import { tipoColumna } from "../dominio/tipos-columna";
import { evaluar, reglaQueAplica, type ColumnaRef, type ElementoRef, type Operacion } from "../dominio/permisos";
import {
  COLORES_GRUPO, errorColumna, FASES_VALOR, limpiarTexto, MAX_NOMBRE, MAX_TITULO, normalizarColumnaNueva, siguienteOrden,
  validarValor, valoresIniciales, vecino, categoriaValida, type Tablero,
} from "../dominio/tablero";
import { aColumna, aElemento, aGrupo, type Acceso } from "./tableros";
import { ErrorTablero } from "./errores";

interface Ctx {
  me: AppUser;
  acceso: Acceso;
  tablero: Tablero;
}

type Datos = Record<string, unknown>;

interface OperacionDef {
  clave: string;
  ejecutar(ctx: Ctx, datos: Datos): Promise<unknown>;
}

// ── Ayudas ───────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const db = () => getSupabaseAdmin();
const ahora = () => new Date().toISOString();

function id(datos: Datos, campo: string): string {
  const v = datos[campo];
  if (typeof v !== "string" || !UUID_RE.test(v)) throw new ErrorTablero(400, `Falta ${campo}`);
  return v;
}

function direccion(datos: Datos): -1 | 1 {
  if (datos.direccion === -1 || datos.direccion === 1) return datos.direccion;
  throw new ErrorTablero(400, "Dirección inválida");
}

function exigir(ctx: Ctx, op: Operacion, donde: { columna?: ColumnaRef; elemento?: ElementoRef } = {}): void {
  const r = evaluar(ctx.acceso.usuario, op, ctx.tablero, ctx.acceso.reglas, donde);
  if (!r.permitido) throw new ErrorTablero(403, r.motivo);
}

async function grupos(ctx: Ctx) {
  return (unwrap(await db().from("tablero_grupos").select("*").eq("tablero_id", ctx.tablero.id).is("archivado_at", null)) ?? []).map(aGrupo);
}

async function columnas(ctx: Ctx) {
  return (unwrap(await db().from("tablero_columnas").select("*").eq("tablero_id", ctx.tablero.id).is("archivada_at", null)) ?? []).map(aColumna);
}

async function columna(ctx: Ctx, columnaId: string) {
  const c = (await columnas(ctx)).find((x) => x.id === columnaId);
  if (!c) throw new ErrorTablero(404, "La columna ya no existe");
  return c;
}

async function elemento(ctx: Ctx, elementoId: string) {
  const r = unwrap(await db().from("elementos").select("*").eq("id", elementoId).eq("tablero_id", ctx.tablero.id).is("archivado_at", null).maybeSingle());
  if (!r) throw new ErrorTablero(404, "El elemento ya no existe");
  return aElemento(r);
}

async function historial(ctx: Ctx, elementoId: string | null, campo: string, antes: unknown, despues: unknown) {
  unwrap(await db().from("tablero_historial").insert({
    tablero_id: ctx.tablero.id, elemento_id: elementoId, campo,
    antes: (antes ?? null) as Json, despues: (despues ?? null) as Json, usuario_id: ctx.me.uid, usuario_email: ctx.me.email,
  }));
}

async function tocarTablero(ctx: Ctx) {
  unwrap(await db().from("tableros").update({ actualizado_at: ahora() }).eq("id", ctx.tablero.id));
}

async function recalcularResponsables(ctx: Ctx) {
  unwrap(await db().rpc("tablero_recalcular_responsables", { p_tablero: ctx.tablero.id }));
}

/** Intercambia el orden de dos filas de la misma tabla. */
async function intercambiar(tabla: "tablero_grupos" | "tablero_columnas", a: { id: string; orden: number }, b: { id: string; orden: number }) {
  unwrap(await db().from(tabla).update({ orden: b.orden }).eq("id", a.id));
  unwrap(await db().from(tabla).update({ orden: a.orden }).eq("id", b.id));
}

// ── Operaciones ──────────────────────────────────────────────────────────────

const OPERACIONES: OperacionDef[] = [
  // Tablero
  {
    clave: "tablero.editar",
    async ejecutar(ctx, d) {
      const cambios: Partial<Tables<"tableros">> = {};
      if ("categoria" in d) { exigir(ctx, "administrar"); cambios.categoria = categoriaValida(d.categoria); }
      else exigir(ctx, "editar_estructura");
      if ("nombre" in d) {
        const n = limpiarTexto(d.nombre, MAX_NOMBRE);
        if (!n) throw new ErrorTablero(400, "El tablero necesita un nombre");
        cambios.nombre = n;
      }
      if ("codigo" in d) cambios.codigo = limpiarTexto(d.codigo, 30);
      if ("descripcion" in d) cambios.descripcion = limpiarTexto(d.descripcion, 1000);
      unwrap(await db().from("tableros").update({ ...cambios, actualizado_at: ahora() }).eq("id", ctx.tablero.id));
    },
  },
  {
    clave: "tablero.archivar",
    async ejecutar(ctx) {
      exigir(ctx, "administrar");
      unwrap(await db().from("tableros").update({ archivado_at: ahora() }).eq("id", ctx.tablero.id));
      await historial(ctx, null, "archivado", null, { tablero: ctx.tablero.nombre });
    },
  },

  // Grupos
  {
    clave: "grupo.crear",
    async ejecutar(ctx, d) {
      exigir(ctx, "editar_estructura");
      const lista = await grupos(ctx);
      unwrap(await db().from("tablero_grupos").insert({
        tablero_id: ctx.tablero.id,
        titulo: limpiarTexto(d.titulo, MAX_TITULO) ?? "Nuevo grupo",
        color: COLORES_GRUPO[lista.length % COLORES_GRUPO.length],
        orden: siguienteOrden(lista),
      }));
      await tocarTablero(ctx);
    },
  },
  {
    clave: "grupo.editar",
    async ejecutar(ctx, d) {
      exigir(ctx, "editar_estructura");
      const grupoId = id(d, "grupoId");
      const cambios: Partial<Tables<"tablero_grupos">> = {};
      if ("titulo" in d) {
        const t = limpiarTexto(d.titulo, MAX_TITULO);
        if (!t) throw new ErrorTablero(400, "El grupo necesita un título");
        cambios.titulo = t;
      }
      if ("color" in d) cambios.color = typeof d.color === "string" && /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : null;
      if ("fase" in d) cambios.fase = (FASES_VALOR as readonly unknown[]).includes(d.fase) ? (d.fase as string) : null;
      const r = unwrap(await db().from("tablero_grupos").update(cambios).eq("id", grupoId).eq("tablero_id", ctx.tablero.id).select("id"));
      if (!r?.length) throw new ErrorTablero(404, "El grupo ya no existe");
      await tocarTablero(ctx);
    },
  },
  {
    clave: "grupo.mover",
    async ejecutar(ctx, d) {
      exigir(ctx, "editar_estructura");
      const lista = await grupos(ctx);
      const g = lista.find((x) => x.id === id(d, "grupoId"));
      const otro = g && vecino(lista, g.id, direccion(d));
      if (g && otro) await intercambiar("tablero_grupos", g, otro);
    },
  },
  {
    clave: "grupo.archivar",
    async ejecutar(ctx, d) {
      exigir(ctx, "editar_estructura");
      const grupoId = id(d, "grupoId");
      const lista = await grupos(ctx);
      if (!lista.some((g) => g.id === grupoId)) throw new ErrorTablero(404, "El grupo ya no existe");
      if (lista.length === 1) throw new ErrorTablero(400, "El tablero necesita al menos un grupo");
      const t = ahora();
      // Sus items y los subitems de esos items se archivan con él.
      const items = (unwrap(await db().from("elementos").select("id").eq("grupo_id", grupoId).is("archivado_at", null)) ?? []).map((x) => x.id);
      if (items.length) {
        unwrap(await db().from("elementos").update({ archivado_at: t }).in("parent_id", items).is("archivado_at", null));
        unwrap(await db().from("elementos").update({ archivado_at: t }).in("id", items));
      }
      unwrap(await db().from("tablero_grupos").update({ archivado_at: t }).eq("id", grupoId));
      await tocarTablero(ctx);
    },
  },

  // Columnas
  {
    clave: "columna.crear",
    async ejecutar(ctx, d) {
      exigir(ctx, "editar_estructura");
      const nueva = normalizarColumnaNueva(d);
      if (!nueva) throw new ErrorTablero(400, "La columna necesita título y tipo");
      const existentes = await columnas(ctx);
      const error = errorColumna(nueva, existentes);
      if (error) throw new ErrorTablero(400, error);
      unwrap(await db().from("tablero_columnas").insert({
        tablero_id: ctx.tablero.id, nivel: nueva.nivel, titulo: nueva.titulo, tipo: nueva.tipo, rol: nueva.rol,
        config: nueva.config as Json, orden: siguienteOrden(existentes.filter((c) => c.nivel === nueva.nivel)),
      }));
      if (nueva.rol === "responsable") await recalcularResponsables(ctx);
      await tocarTablero(ctx);
    },
  },
  {
    clave: "columna.editar",
    async ejecutar(ctx, d) {
      exigir(ctx, "editar_estructura");
      const existentes = await columnas(ctx);
      const c = existentes.find((x) => x.id === id(d, "columnaId"));
      if (!c) throw new ErrorTablero(404, "La columna ya no existe");
      const tipo = tipoColumna(c.tipo);
      const cambios: Partial<Tables<"tablero_columnas">> = {};
      if ("titulo" in d) {
        const t = limpiarTexto(d.titulo, MAX_TITULO);
        if (!t) throw new ErrorTablero(400, "La columna necesita un título");
        cambios.titulo = t;
      }
      if ("rol" in d) {
        const rol = typeof d.rol === "string" && d.rol ? d.rol : null;
        const error = errorColumna({ ...c, rol }, existentes);
        if (error) throw new ErrorTablero(400, error);
        cambios.rol = rol;
      }
      if ("config" in d && tipo) cambios.config = tipo.config.validar(d.config) as Json;
      if ("oculta" in d) cambios.oculta = d.oculta === true;
      if ("ancho" in d) cambios.ancho = typeof d.ancho === "number" ? Math.min(600, Math.max(60, Math.round(d.ancho))) : null;
      unwrap(await db().from("tablero_columnas").update(cambios).eq("id", c.id));
      if ("rol" in cambios && (c.rol === "responsable" || cambios.rol === "responsable")) await recalcularResponsables(ctx);
      await tocarTablero(ctx);
    },
  },
  {
    clave: "columna.mover",
    async ejecutar(ctx, d) {
      exigir(ctx, "editar_estructura");
      const c = await columna(ctx, id(d, "columnaId"));
      const mismas = (await columnas(ctx)).filter((x) => x.nivel === c.nivel);
      const otra = vecino(mismas, c.id, direccion(d));
      if (otra) await intercambiar("tablero_columnas", c, otra);
    },
  },
  {
    clave: "columna.archivar",
    async ejecutar(ctx, d) {
      exigir(ctx, "editar_estructura");
      const c = await columna(ctx, id(d, "columnaId"));
      unwrap(await db().from("tablero_columnas").update({ archivada_at: ahora() }).eq("id", c.id));
      if (c.rol === "responsable") await recalcularResponsables(ctx);
      await tocarTablero(ctx);
    },
  },

  // Elementos
  {
    clave: "elemento.crear",
    async ejecutar(ctx, d) {
      exigir(ctx, "editar_valor");
      const nombre = limpiarTexto(d.nombre, MAX_NOMBRE) ?? "";
      let grupoId: string | null = null;
      let parentId: string | null = null;
      if (typeof d.parentId === "string") {
        const padre = await elemento(ctx, id(d, "parentId"));
        if (padre.parentId) throw new ErrorTablero(400, "Un subelemento no puede tener subelementos");
        exigir(ctx, "editar_valor", { elemento: padre });
        parentId = padre.id;
      } else {
        grupoId = id(d, "grupoId");
        if (!(await grupos(ctx)).some((g) => g.id === grupoId)) throw new ErrorTablero(404, "El grupo ya no existe");
      }
      const nivel = parentId ? "sub" : "item";
      const hermanos = unwrap(await (parentId
        ? db().from("elementos").select("orden").eq("parent_id", parentId)
        : db().from("elementos").select("orden").eq("grupo_id", grupoId!).is("parent_id", null))) ?? [];
      // Con "solo lo mío", quien lo crea queda de responsable (si no, dejaría de verlo).
      const regla = reglaQueAplica(ctx.acceso.usuario, ctx.tablero, ctx.acceso.reglas);
      const valores = regla?.soloLoMio && !ctx.acceso.usuario.esAdmin
        ? valoresIniciales(await columnas(ctx), nivel, ctx.acceso.usuario.personaId) : {};
      const responsables = Object.values(valores).flat() as string[];
      const nuevo = unwrap(await db().from("elementos").insert({
        tablero_id: ctx.tablero.id, grupo_id: grupoId, parent_id: parentId, nombre, orden: siguienteOrden(hermanos),
        valores: valores as Json, responsables, creado_por: ctx.me.uid,
      }).select("id").single())!;
      await historial(ctx, nuevo.id, "creado", null, { nombre });
      return { id: nuevo.id };
    },
  },
  {
    clave: "elemento.renombrar",
    async ejecutar(ctx, d) {
      const e = await elemento(ctx, id(d, "elementoId"));
      exigir(ctx, "editar_valor", { elemento: e, columna: { id: "nombre", rol: "nombre" } });
      const nombre = limpiarTexto(d.nombre, MAX_NOMBRE) ?? "";
      if (nombre === e.nombre) return;
      unwrap(await db().from("elementos").update({ nombre, actualizado_at: ahora() }).eq("id", e.id));
      await historial(ctx, e.id, "nombre", e.nombre, nombre);
    },
  },
  {
    clave: "elemento.mover",
    async ejecutar(ctx, d) {
      const e = await elemento(ctx, id(d, "elementoId"));
      exigir(ctx, "editar_valor", { elemento: e });
      if (e.parentId) throw new ErrorTablero(400, "Los subelementos se mueven con su elemento");
      const grupoId = id(d, "grupoId");
      const lista = await grupos(ctx);
      const destino = lista.find((g) => g.id === grupoId);
      if (!destino) throw new ErrorTablero(404, "El grupo ya no existe");
      if (grupoId === e.grupoId) return;
      const hermanos = unwrap(await db().from("elementos").select("orden").eq("grupo_id", grupoId).is("parent_id", null)) ?? [];
      unwrap(await db().from("elementos").update({ grupo_id: grupoId, orden: siguienteOrden(hermanos), actualizado_at: ahora() }).eq("id", e.id));
      await historial(ctx, e.id, "movido", lista.find((g) => g.id === e.grupoId)?.titulo ?? null, destino.titulo);
    },
  },
  {
    clave: "elemento.archivar",
    async ejecutar(ctx, d) {
      const e = await elemento(ctx, id(d, "elementoId"));
      exigir(ctx, "editar_valor", { elemento: e });
      const t = ahora();
      unwrap(await db().from("elementos").update({ archivado_at: t }).eq("parent_id", e.id).is("archivado_at", null));
      unwrap(await db().from("elementos").update({ archivado_at: t }).eq("id", e.id));
      await historial(ctx, e.id, "archivado", null, { nombre: e.nombre });
    },
  },
  {
    clave: "valor.cambiar",
    async ejecutar(ctx, d) {
      const e = await elemento(ctx, id(d, "elementoId"));
      const c = await columna(ctx, id(d, "columnaId"));
      if (c.nivel !== (e.parentId ? "sub" : "item")) throw new ErrorTablero(400, "La columna no es de ese nivel");
      exigir(ctx, "editar_valor", { elemento: e, columna: c });
      const valor = validarValor(c, d.valor);
      if (valor === undefined) throw new ErrorTablero(400, "Tipo de columna desconocido");
      unwrap(await db().rpc("tablero_cambiar_valor", {
        p_elemento: e.id, p_columna: c.id, p_valor: valor as Json, p_usuario: ctx.me.uid, p_email: ctx.me.email,
      }));
      return { valor };
    },
  },
];

export function operacion(clave: unknown): OperacionDef | undefined {
  return OPERACIONES.find((o) => o.clave === clave);
}

export async function ejecutarOperacion(me: AppUser, acceso: Acceso, tablero: Tablero, datos: Datos): Promise<unknown> {
  const op = operacion(datos.op);
  if (!op) throw new ErrorTablero(400, "Operación desconocida");
  return op.ejecutar({ me, acceso, tablero }, datos);
}

export const CLAVES_OPERACIONES = OPERACIONES.map((o) => o.clave);
