// SOLO SERVIDOR. REGISTRO de operaciones sobre un tablero. Todo cambio entra por aquí: la ruta
// POST /api/tableros/tableros/[id] recibe { op, ...datos } y ejecuta la operación registrada.
// Cada operación revisa su propio permiso con el motor (dominio/permisos.ts) antes de escribir.
// Agregar una funcionalidad = agregar una entrada a OPERACIONES.

import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import type { AppUser } from "@/lib/permissions";
import type { Json, Tables } from "@/types/supabase";
import { randomUUID } from "node:crypto";
import { esCalculado, esEditable, tipoColumna } from "../dominio/tipos-columna";
import { siguienteAutonumero, type ConfigAutonumero } from "../dominio/tipos-columna/autonumero";
import { marcaCreacion } from "../dominio/tipos-columna/creacion";
import { errorFormula } from "../dominio/calculos";
import { MAX_ADJUNTOS_COMENTARIO, normalizarTextoComentario } from "../dominio/bitacora";
import { evaluar, reglaQueAplica, type ColumnaRef, type ElementoRef, type Operacion } from "../dominio/permisos";
import {
  COLORES_GRUPO, errorColumna, FASES_VALOR, limpiarTexto, MAX_NOMBRE, MAX_TITULO, normalizarColumnaNueva, siguienteOrden,
  validarValor, valoresIniciales, vecino, categoriaValida, esDatoDeMonday, MENSAJE_DATO_DE_MONDAY, type Columna, type Elemento, type Tablero,
} from "../dominio/tablero";
import { tieneAccionTableros } from "../dominio/acciones";
import { buscarEtiqueta, esAccionCompletable, planCompletar } from "../dominio/acciones-iniciativa";
import { columnasNuevaIni } from "../dominio/nueva-iniciativa";
import { etiquetaStatus, type ConfigStatus } from "../dominio/tipos-columna/status";
import { aColumna, aElemento, aGrupo, leerTablero, type Acceso } from "./tableros";
import { ErrorTablero } from "./errores";
import { guardarComoPlantilla } from "./plantillas";

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

/** Convivencia con Monday: lo que viene de Monday no se cambia aquí (llega con la sincronización). */
function noDeMonday(ctx: Ctx, e: Pick<Elemento, "mondayItemId">, c?: Pick<Columna, "mondayColumnId">): void {
  if (esDatoDeMonday(ctx.tablero, e, c)) throw new ErrorTablero(409, MENSAJE_DATO_DE_MONDAY);
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

/** Cambia el valor de UNA celda con todas las reglas (nivel, permiso, convivencia con Monday, tipo) y deja su historial. Devuelve el valor guardado. */
async function escribirValor(ctx: Ctx, e: Elemento, c: Columna, crudo: unknown): Promise<unknown> {
  if (c.nivel !== (e.parentId ? "sub" : "item")) throw new ErrorTablero(400, "La columna no es de ese nivel");
  exigir(ctx, "editar_valor", { elemento: e, columna: c });
  noDeMonday(ctx, e, c);
  if (!esEditable(c.tipo)) throw new ErrorTablero(400, esCalculado(c.tipo) ? "Esa columna se calcula sola" : "Esa columna la llena la app");
  const valor = validarValor(c, crudo);
  if (valor === undefined) throw new ErrorTablero(400, "Tipo de columna desconocido");
  unwrap(await db().rpc("tablero_cambiar_valor", {
    p_elemento: e.id, p_columna: c.id, p_valor: valor as Json, p_usuario: ctx.me.uid, p_email: ctx.me.email,
  }));
  return valor;
}

/** Eliminar (archivar) una iniciativa es cosa de un Admin; en los demás tableros rigen los permisos de siempre. */
function soloAdminElimina(ctx: Ctx, e: Pick<Elemento, "parentId">): void {
  if (ctx.tablero.categoria === "iniciativas" && !e.parentId && !ctx.acceso.usuario.esAdmin) {
    throw new ErrorTablero(403, "Solo un Admin puede eliminar una iniciativa");
  }
}

/** Archiva el elemento y sus subelementos (dejan de verse; nada se borra) y lo anota en el historial. */
async function archivarElemento(ctx: Ctx, e: Elemento): Promise<void> {
  const t = ahora();
  unwrap(await db().from("elementos").update({ archivado_at: t }).eq("parent_id", e.id).is("archivado_at", null));
  unwrap(await db().from("elementos").update({ archivado_at: t }).eq("id", e.id));
  await historial(ctx, e.id, "archivado", null, { nombre: e.nombre });
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

/** Lo que la config de fórmulas, espejos y relaciones necesita para tener sentido. */
async function errorConfigEspecial(tipo: string, nivel: "item" | "sub", config: unknown, existentes: Columna[], columnaId?: string): Promise<string | null> {
  const cfg = (config ?? {}) as Record<string, unknown>;
  if (tipo === "formula") {
    const expr = typeof cfg.expresion === "string" ? cfg.expresion : "";
    if (!expr.trim()) return "Escribe la fórmula";
    return errorFormula(expr, nivel, existentes, columnaId);
  }
  if (tipo === "espejo") {
    const origen = existentes.find((c) => c.id === cfg.columna && c.nivel === nivel && (c.tipo === "persona" || c.tipo === "relacion"));
    if (!origen) return "Elige la columna Persona o Relación de la que se lee";
    if (!cfg.campo) return "Elige qué dato mostrar";
  }
  if (tipo === "relacion") {
    const destino = typeof cfg.tableroId === "string" ? cfg.tableroId : "";
    if (!destino) return "Elige el tablero que se liga";
    const t = unwrap(await db().from("tableros").select("id").eq("id", destino).is("archivado_at", null).maybeSingle());
    if (!t) return "Ese tablero ya no existe";
  }
  return null;
}

/** Nombre seguro para la ruta en Storage (el nombre original se guarda aparte). */
const nombreSeguro = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "_").slice(-120) || "archivo";
const MAX_ARCHIVO = 50 * 1024 * 1024;

async function comentario(ctx: Ctx, comentarioId: string) {
  const r = unwrap(await db().from("elemento_comentarios").select("*").eq("id", comentarioId).eq("tablero_id", ctx.tablero.id).is("borrado_at", null).maybeSingle());
  if (!r) throw new ErrorTablero(404, "El comentario ya no existe");
  return r;
}

/** Marca como borrados los archivos adjuntos de unos comentarios y los quita de Storage. */
async function borrarArchivosDeComentarios(comentarioIds: string[]) {
  if (!comentarioIds.length) return;
  const filas = unwrap(await db().from("elemento_archivos").select("id, ruta").in("comentario_id", comentarioIds).is("borrado_at", null)) ?? [];
  if (!filas.length) return;
  unwrap(await db().from("elemento_archivos").update({ borrado_at: ahora() }).in("id", filas.map((x) => x.id)));
  await db().storage.from("tableros").remove(filas.map((x) => x.ruta));
}

async function archivoFila(ctx: Ctx, archivoId: string) {
  const r = unwrap(await db().from("elemento_archivos").select("*").eq("id", archivoId).eq("tablero_id", ctx.tablero.id).is("borrado_at", null).maybeSingle());
  if (!r) throw new ErrorTablero(404, "El archivo ya no existe");
  return r;
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
      if (ctx.tablero.sincronizaMonday && ("nombre" in d || "codigo" in d)) {
        throw new ErrorTablero(409, "El nombre y el código vienen de Monday: se cambian en Monday y llegan con la sincronización.");
      }
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

  {
    clave: "tablero.guardar_plantilla",
    async ejecutar(ctx, d) {
      exigir(ctx, "administrar");
      if (!tieneAccionTableros(ctx.me.permissions, "plantillas_administrar")) throw new ErrorTablero(403, "No puedes administrar plantillas");
      const completo = await leerTablero(ctx.tablero.id, ctx.acceso);
      if (!completo) throw new ErrorTablero(404, "Tablero no encontrado");
      return { id: await guardarComoPlantilla(completo, d, ctx.me) };
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
      const filas = unwrap(await db().from("elementos").select("id, monday_item_id").eq("grupo_id", grupoId).is("archivado_at", null)) ?? [];
      if (ctx.tablero.sincronizaMonday && filas.some((x) => x.monday_item_id)) {
        throw new ErrorTablero(409, "Este grupo tiene elementos que vienen de Monday: se archivan en Monday y llegan aquí con la sincronización.");
      }
      const items = filas.map((x) => x.id);
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
      const error = errorColumna(nueva, existentes) ?? await errorConfigEspecial(nueva.tipo, nueva.nivel, nueva.config, existentes);
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
      const config = "config" in d && tipo ? tipo.config.validar(d.config) : c.config;
      if ("config" in d) {
        const error = await errorConfigEspecial(c.tipo, c.nivel, config, existentes, c.id);
        if (error) throw new ErrorTablero(400, error);
        cambios.config = config as Json;
      }
      const rol = "rol" in d ? (typeof d.rol === "string" && d.rol ? d.rol : null) : c.rol;
      const errorRol = errorColumna({ ...c, rol, config }, existentes);
      if (errorRol) throw new ErrorTablero(400, errorRol);
      if ("rol" in d) cambios.rol = rol;
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
      const cols = await columnas(ctx);
      const soloLoMio = !!regla?.soloLoMio && !ctx.acceso.usuario.esAdmin;
      const valores: Record<string, unknown> = soloLoMio ? valoresIniciales(cols, nivel, ctx.acceso.usuario.personaId) : {};
      const colResp = cols.find((x) => x.nivel === nivel && x.rol === "responsable");
      // Los valores que trae el formulario de alta: cada uno validado y con el permiso de SU columna.
      const delFormulario = nivel === "item" && d.valores && typeof d.valores === "object" && !Array.isArray(d.valores) ? (d.valores as Record<string, unknown>) : {};
      for (const [columnaId, bruto] of Object.entries(delFormulario)) {
        const c = cols.find((x) => x.id === columnaId && x.nivel === nivel);
        if (!c) throw new ErrorTablero(400, "Una de las columnas ya no existe");
        if (!esEditable(c.tipo)) throw new ErrorTablero(400, esCalculado(c.tipo) ? "Esa columna se calcula sola" : "Esa columna la llena la app");
        exigir(ctx, "editar_valor", { columna: c });
        const v = validarValor(c, bruto);
        if (v === undefined) throw new ErrorTablero(400, "Tipo de columna desconocido");
        if (v !== null) valores[c.id] = v;
      }
      // Con «solo lo mío», quien lo crea sigue de responsable aunque el formulario ponga a otra persona (si no, dejaría de verlo).
      const personaId = ctx.acceso.usuario.personaId;
      if (soloLoMio && personaId && colResp) {
        const elegidos = Array.isArray(valores[colResp.id]) ? (valores[colResp.id] as string[]) : [];
        valores[colResp.id] = validarValor(colResp, [personaId, ...elegidos.filter((x) => x !== personaId)]) ?? [personaId];
      }
      // Columnas que llena la app: ID automático (siguiente número) y fecha de creación.
      for (const c of cols.filter((x) => x.nivel === nivel)) {
        if (c.tipo === "creacion") valores[c.id] = marcaCreacion();
        if (c.tipo === "autonumero") {
          const usados = unwrap(await db().from("elementos").select("valores").eq("tablero_id", ctx.tablero.id)) ?? [];
          valores[c.id] = siguienteAutonumero(tipoColumna("autonumero")!.config.validar(c.config) as ConfigAutonumero,
            usados.map((u) => (u.valores as Record<string, unknown> | null)?.[c.id]));
        }
      }
      // Responsables = lo que dice la columna con rol «responsable» (la columna es uuid[]: no cualquier valor sirve).
      const resp = colResp ? valores[colResp.id] : undefined;
      const responsables = Array.isArray(resp) ? (resp as unknown[]).filter((x): x is string => typeof x === "string") : [];
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
      noDeMonday(ctx, e);
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
      noDeMonday(ctx, e);
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
      soloAdminElimina(ctx, e);
      noDeMonday(ctx, e);
      await archivarElemento(ctx, e);
    },
  },
  // Iniciativas: «Eliminar» (solo un Admin). Es el archivado de siempre: la iniciativa y sus subelementos dejan de verse en toda la app, pero
  // sus datos, su bitácora y su historial se conservan (se puede recuperar). Las que vienen de Monday se eliminan en Monday.
  {
    clave: "iniciativa.eliminar",
    async ejecutar(ctx, d) {
      if (ctx.tablero.categoria !== "iniciativas") throw new ErrorTablero(400, "Esta acción es de las iniciativas");
      const e = await elemento(ctx, id(d, "elementoId"));
      if (e.parentId) throw new ErrorTablero(400, "Solo se eliminan iniciativas");
      soloAdminElimina(ctx, e);
      noDeMonday(ctx, e);
      await archivarElemento(ctx, e);
    },
  },
  {
    clave: "valor.cambiar",
    async ejecutar(ctx, d) {
      const e = await elemento(ctx, id(d, "elementoId"));
      const c = await columna(ctx, id(d, "columnaId"));
      return { valor: await escribirValor(ctx, e, c, d.valor) };
    },
  },

  // Iniciativas: «✓ Completar» la acción amarilla del timeline (la Meeting 1, la Meeting 2 o el Plan Futuro): anota su fecha (columna Meet 1 / Meet 2),
  // mueve la etapa (Status) a la de la siguiente acción elegida y deja en el historial QUÉ se completó y CUÁNDO (fecha y hora exactas).
  {
    clave: "iniciativa.completar",
    async ejecutar(ctx, d) {
      if (ctx.tablero.categoria !== "iniciativas") throw new ErrorTablero(400, "Esta acción es de las iniciativas");
      const e = await elemento(ctx, id(d, "elementoId"));
      if (e.parentId) throw new ErrorTablero(400, "Solo las iniciativas se completan");
      const k = columnasNuevaIni(await columnas(ctx));
      const accion = d.accion;
      if (!esAccionCompletable(accion)) throw new ErrorTablero(400, "Esa acción no se completa con el botón");
      // Las reuniones anotan su fecha (Meet 1 / Meet 2); el Plan Futuro no (su columna es la fecha en que se iba a retomar y se conserva) ni Sin Beneficio Definido.
      const esReunion = accion === "Meeting 1" || accion === "Meeting 2";
      const colFecha = accion === "Meeting 1" ? k.meet1 : accion === "Meeting 2" ? k.meet2 : null;
      if (!k.status || (esReunion && !colFecha)) throw new ErrorTablero(400, `Al tablero le faltan las columnas Status${esReunion ? ` y ${accion === "Meeting 2" ? "Meet 2" : "Meet 1"}` : ""}`);
      const config = tipoColumna("status")!.config.validar(k.status.config) as ConfigStatus;
      const actual = e.valores[k.status.id];
      const ahoraIso = ahora();
      const hoyGT = new Date(Date.parse(ahoraIso) - 6 * 3600_000).toISOString().slice(0, 10); // el día en Guatemala (UTC-6)
      const plan = planCompletar({
        accion, statusActual: typeof actual === "string" ? etiquetaStatus(config, actual)?.texto ?? null : null, siguiente: d.siguiente, clase: d.clase,
        fecha: d.fecha, hoy: hoyGT,
      });
      if (!plan.ok) throw new ErrorTablero(409, plan.error);
      // Una Sin Beneficio Definido ya cerrada a mano con «Completar» no se completa ni se aprueba después: no se espera ninguna acción más.
      // (El cierre automático, 5 días hábiles después del 4.º recordatorio, lo oculta la pantalla: depende del registro de envíos.)
      if (accion === "Sin Beneficio Definido") {
        const cierres = unwrap(await db().from("tablero_historial").select("creado_at")
          .eq("tablero_id", ctx.tablero.id).eq("elemento_id", e.id).eq("campo", "accion")
          .filter("despues->>accion", "eq", "Sin Beneficio Definido").filter("despues->>resultado", "eq", "sin-aprobar")
          .order("creado_at", { ascending: false }).limit(1)) ?? [];
        const enEspera = k.espera ? e.valores[k.espera.id] : null;
        const diaCierre = cierres[0] ? new Date(Date.parse(cierres[0].creado_at) - 6 * 3600_000).toISOString().slice(0, 10) : null;
        if (diaCierre && (typeof enEspera !== "string" || diaCierre >= enEspera)) throw new ErrorTablero(409, "Sin Beneficio Definido ya se cerró sin aprobar: no hay más acciones");
      }
      // Sin Beneficio Definido + «Completar» (statusTexto null): se cierra sin aprobar y el Status se queda como está
      const etiqueta = plan.statusTexto ? buscarEtiqueta(config.etiquetas, plan.statusTexto) : undefined;
      if (plan.statusTexto && !etiqueta) throw new ErrorTablero(400, `El Status no tiene la etiqueta «${plan.statusTexto}»`);
      // Además de Meet 1/2 y el Status: Plan Futuro guarda la fecha en que se retoma (de ahí sale el recordatorio de 5 días hábiles) y
      // Sin Beneficio Definido guarda «En Espera» = hoy (de ahí corren los recordatorios de Sin Valor Def: 10 días hábiles, máx. 4).
      // Cerrar Sin Beneficio Definido con «Completar» marca PKU: es la casilla con la que el sistema de recordatorios deja de mandar correos.
      const extra = plan.siguiente === "Plan Futuro" ? { col: k.planFuturo, nombre: "Plan Futuro", valor: plan.fecha as unknown, obligatoria: true }
        : plan.siguiente === "Sin Beneficio Definido" ? { col: k.espera, nombre: "En Espera", valor: hoyGT as unknown, obligatoria: true }
        : plan.siguiente === null ? { col: k.pku, nombre: "PKU", valor: true as unknown, obligatoria: false } : null;
      if (extra?.obligatoria && !extra.col) throw new ErrorTablero(400, `Al tablero le falta la columna ${extra.nombre}`);
      // Primero se revisan los permisos de todas las columnas (nada se escribe a medias por un permiso).
      for (const c of [k.status, ...(colFecha ? [colFecha] : []), ...(extra?.col ? [extra.col] : [])]) {
        exigir(ctx, "editar_valor", { elemento: e, columna: c });
        noDeMonday(ctx, e, c);
      }
      if (colFecha) await escribirValor(ctx, e, colFecha, hoyGT);
      if (etiqueta) await escribirValor(ctx, e, k.status, etiqueta.id);
      if (extra?.col) await escribirValor(ctx, e, extra.col, extra.valor);
      await historial(ctx, e.id, "accion", null, plan.siguiente === null
        ? { accion: plan.accion, resultado: "sin-aprobar" }
        : { accion: plan.accion, siguiente: plan.siguiente, ...(plan.clase ? { clase: plan.clase } : {}), ...(plan.fecha ? { fecha: plan.fecha } : {}) });
      return { completadaAt: ahoraIso };
    },
  },

  // Bitácora (comentarios). Comenta quien puede editar el elemento; edita o borra el autor (o el Admin).
  {
    clave: "comentario.crear",
    async ejecutar(ctx, d) {
      const e = await elemento(ctx, id(d, "elementoId"));
      exigir(ctx, "editar_valor", { elemento: e });
      // Un comentario puede ir sin texto si trae archivos (los sube el navegador enseguida).
      const texto = normalizarTextoComentario(d.texto) ?? (d.conArchivos === true ? "" : null);
      if (texto === null) throw new ErrorTablero(400, "Escribe el comentario");
      let respuestaA: string | null = null;
      if (d.respuestaA !== undefined && d.respuestaA !== null) {
        const padre = await comentario(ctx, id(d, "respuestaA"));
        if (padre.elemento_id !== e.id) throw new ErrorTablero(400, "Esa actualización es de otro elemento");
        if (padre.respuesta_a) throw new ErrorTablero(400, "Se responde a la actualización, no a otra respuesta");
        respuestaA = padre.id;
      }
      const r = unwrap(await db().from("elemento_comentarios").insert({
        tablero_id: ctx.tablero.id, elemento_id: e.id, autor_id: ctx.me.uid, autor_email: ctx.me.email,
        autor_nombre: ctx.me.displayName || ctx.me.email, texto, respuesta_a: respuestaA,
      }).select("id").single())!;
      return { id: r.id };
    },
  },
  {
    clave: "comentario.editar",
    async ejecutar(ctx, d) {
      const c = await comentario(ctx, id(d, "comentarioId"));
      if (c.autor_id !== ctx.me.uid) throw new ErrorTablero(403, "Solo quien lo escribió puede editarlo");
      const texto = normalizarTextoComentario(d.texto);
      if (!texto) throw new ErrorTablero(400, "Escribe el comentario");
      unwrap(await db().from("elemento_comentarios").update({ texto, editado_at: ahora() }).eq("id", c.id));
    },
  },
  {
    clave: "comentario.borrar",
    async ejecutar(ctx, d) {
      const c = await comentario(ctx, id(d, "comentarioId"));
      if (ctx.tablero.sincronizaMonday && c.monday_update_id) throw new ErrorTablero(409, MENSAJE_DATO_DE_MONDAY);
      if (c.autor_id !== ctx.me.uid && !ctx.acceso.usuario.esAdmin) throw new ErrorTablero(403, "Solo quien lo escribió (o un Admin) puede borrarlo");
      // Sus respuestas y los archivos de todos se van con él.
      const respuestas = (unwrap(await db().from("elemento_comentarios").select("id").eq("respuesta_a", c.id).is("borrado_at", null)) ?? []).map((x) => x.id);
      const ids = [c.id, ...respuestas];
      unwrap(await db().from("elemento_comentarios").update({ borrado_at: ahora() }).in("id", ids));
      await borrarArchivosDeComentarios(ids);
    },
  },

  // Archivos: el navegador sube directo a Storage con una URL firmada (sin pasar por el servidor de
  // la app, que en Vercel limita el tamaño); luego se confirma.
  {
    clave: "archivo.preparar",
    async ejecutar(ctx, d) {
      const e = await elemento(ctx, id(d, "elementoId"));
      let columnaId: string | null = null;
      let comentarioId: string | null = null;
      if (d.comentarioId !== undefined && d.comentarioId !== null) {
        // Adjunto de la bitácora: lo adjunta quien escribió el comentario.
        const cm = await comentario(ctx, id(d, "comentarioId"));
        if (cm.elemento_id !== e.id) throw new ErrorTablero(400, "Ese comentario es de otro elemento");
        exigir(ctx, "editar_valor", { elemento: e });
        if (ctx.tablero.sincronizaMonday && cm.monday_update_id) throw new ErrorTablero(409, MENSAJE_DATO_DE_MONDAY);
        if (cm.autor_id !== ctx.me.uid) throw new ErrorTablero(403, "Solo quien escribió el comentario puede adjuntarle archivos");
        const ya = unwrap(await db().from("elemento_archivos").select("id").eq("comentario_id", cm.id).is("borrado_at", null)) ?? [];
        if (ya.length >= MAX_ADJUNTOS_COMENTARIO) throw new ErrorTablero(400, `Máximo ${MAX_ADJUNTOS_COMENTARIO} archivos por comentario`);
        comentarioId = cm.id;
      } else {
        const c = await columna(ctx, id(d, "columnaId"));
        if (c.tipo !== "archivo" || c.nivel !== (e.parentId ? "sub" : "item")) throw new ErrorTablero(400, "Esa columna no es de archivos");
        exigir(ctx, "editar_valor", { elemento: e, columna: c });
        noDeMonday(ctx, e, c);
        columnaId = c.id;
      }
      const nombre = limpiarTexto(d.nombre, 255);
      const tamano = typeof d.tamano === "number" ? d.tamano : 0;
      if (!nombre) throw new ErrorTablero(400, "Falta el nombre del archivo");
      if (tamano > MAX_ARCHIVO) throw new ErrorTablero(400, "El archivo pasa de 50 MB");
      const ruta = `${ctx.tablero.id}/${e.id}/${randomUUID()}/${nombreSeguro(nombre)}`;
      const firmada = await db().storage.from("tableros").createSignedUploadUrl(ruta);
      if (firmada.error) throw new Error(firmada.error.message);
      const r = unwrap(await db().from("elemento_archivos").insert({
        tablero_id: ctx.tablero.id, elemento_id: e.id, columna_id: columnaId, comentario_id: comentarioId, ruta, nombre, tamano,
        tipo_mime: typeof d.tipoMime === "string" ? d.tipoMime.slice(0, 120) : null, subido_por: ctx.me.uid, subido_email: ctx.me.email,
      }).select("id").single())!;
      return { archivoId: r.id, ruta, token: firmada.data.token };
    },
  },
  {
    clave: "archivo.confirmar",
    async ejecutar(ctx, d) {
      const a = await archivoFila(ctx, id(d, "archivoId"));
      if (a.subido_por !== ctx.me.uid) throw new ErrorTablero(403, "Ese archivo lo está subiendo otra persona");
      const carpeta = a.ruta.slice(0, a.ruta.lastIndexOf("/"));
      const lista = await db().storage.from("tableros").list(carpeta);
      if (lista.error || !lista.data?.length) throw new ErrorTablero(400, "El archivo no llegó a guardarse; vuelve a intentarlo");
      unwrap(await db().from("elemento_archivos").update({ estado: "listo" }).eq("id", a.id));
      await historial(ctx, a.elemento_id, "archivo", null, { nombre: a.nombre });
    },
  },
  {
    clave: "archivo.borrar",
    async ejecutar(ctx, d) {
      const a = await archivoFila(ctx, id(d, "archivoId"));
      if (ctx.tablero.sincronizaMonday && a.monday_asset_id) throw new ErrorTablero(409, MENSAJE_DATO_DE_MONDAY);
      const e = await elemento(ctx, a.elemento_id);
      exigir(ctx, "editar_valor", { elemento: e, columna: a.columna_id ? await columna(ctx, a.columna_id) : undefined });
      if (a.comentario_id && a.subido_por !== ctx.me.uid && !ctx.acceso.usuario.esAdmin) {
        throw new ErrorTablero(403, "Solo quien lo subió (o un Admin) puede borrarlo");
      }
      unwrap(await db().from("elemento_archivos").update({ borrado_at: ahora() }).eq("id", a.id));
      await db().storage.from("tableros").remove([a.ruta]);
      await historial(ctx, e.id, "archivo_borrado", { nombre: a.nombre }, null);
    },
  },
  {
    clave: "archivo.descargar",
    async ejecutar(ctx, d) {
      const a = await archivoFila(ctx, id(d, "archivoId"));
      exigir(ctx, "ver", { elemento: await elemento(ctx, a.elemento_id) });
      const firmada = await db().storage.from("tableros").createSignedUrl(a.ruta, 120, { download: a.nombre });
      if (firmada.error) throw new Error(firmada.error.message);
      return { url: firmada.data.signedUrl };
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
