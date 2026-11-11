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
import { normalizarTextoComentario } from "../dominio/bitacora";
import { evaluar, reglaQueAplica, type ColumnaRef, type ElementoRef, type Operacion } from "../dominio/permisos";
import {
  COLORES_GRUPO, errorColumna, FASES_VALOR, limpiarTexto, MAX_NOMBRE, MAX_TITULO, normalizarColumnaNueva, siguienteOrden,
  validarValor, valoresIniciales, vecino, categoriaValida, esDatoDeMonday, MENSAJE_DATO_DE_MONDAY, type Columna, type Elemento, type Tablero,
} from "../dominio/tablero";
import { tieneAccionTableros } from "../dominio/acciones";
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
      const valores: Record<string, unknown> = regla?.soloLoMio && !ctx.acceso.usuario.esAdmin
        ? valoresIniciales(cols, nivel, ctx.acceso.usuario.personaId) : {};
      // Columnas que llena la app: ID automático (siguiente número) y fecha de creación.
      for (const c of cols.filter((x) => x.nivel === nivel)) {
        if (c.tipo === "creacion") valores[c.id] = marcaCreacion();
        if (c.tipo === "autonumero") {
          const usados = unwrap(await db().from("elementos").select("valores").eq("tablero_id", ctx.tablero.id)) ?? [];
          valores[c.id] = siguienteAutonumero(tipoColumna("autonumero")!.config.validar(c.config) as ConfigAutonumero,
            usados.map((u) => (u.valores as Record<string, unknown> | null)?.[c.id]));
        }
      }
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
      noDeMonday(ctx, e);
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
      noDeMonday(ctx, e, c);
      if (!esEditable(c.tipo)) throw new ErrorTablero(400, esCalculado(c.tipo) ? "Esa columna se calcula sola" : "Esa columna la llena la app");
      const valor = validarValor(c, d.valor);
      if (valor === undefined) throw new ErrorTablero(400, "Tipo de columna desconocido");
      unwrap(await db().rpc("tablero_cambiar_valor", {
        p_elemento: e.id, p_columna: c.id, p_valor: valor as Json, p_usuario: ctx.me.uid, p_email: ctx.me.email,
      }));
      return { valor };
    },
  },

  // Bitácora (comentarios). Comenta quien puede editar el elemento; edita o borra el autor (o el Admin).
  {
    clave: "comentario.crear",
    async ejecutar(ctx, d) {
      const e = await elemento(ctx, id(d, "elementoId"));
      exigir(ctx, "editar_valor", { elemento: e });
      const texto = normalizarTextoComentario(d.texto);
      if (!texto) throw new ErrorTablero(400, "Escribe el comentario");
      const r = unwrap(await db().from("elemento_comentarios").insert({
        tablero_id: ctx.tablero.id, elemento_id: e.id, autor_id: ctx.me.uid, autor_email: ctx.me.email,
        autor_nombre: ctx.me.displayName || ctx.me.email, texto,
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
      unwrap(await db().from("elemento_comentarios").update({ borrado_at: ahora() }).eq("id", c.id));
    },
  },

  // Archivos: el navegador sube directo a Storage con una URL firmada (sin pasar por el servidor de
  // la app, que en Vercel limita el tamaño); luego se confirma.
  {
    clave: "archivo.preparar",
    async ejecutar(ctx, d) {
      const e = await elemento(ctx, id(d, "elementoId"));
      const c = await columna(ctx, id(d, "columnaId"));
      if (c.tipo !== "archivo" || c.nivel !== (e.parentId ? "sub" : "item")) throw new ErrorTablero(400, "Esa columna no es de archivos");
      exigir(ctx, "editar_valor", { elemento: e, columna: c });
      noDeMonday(ctx, e, c);
      const nombre = limpiarTexto(d.nombre, 255);
      const tamano = typeof d.tamano === "number" ? d.tamano : 0;
      if (!nombre) throw new ErrorTablero(400, "Falta el nombre del archivo");
      if (tamano > MAX_ARCHIVO) throw new ErrorTablero(400, "El archivo pasa de 50 MB");
      const ruta = `${ctx.tablero.id}/${e.id}/${randomUUID()}/${nombreSeguro(nombre)}`;
      const firmada = await db().storage.from("tableros").createSignedUploadUrl(ruta);
      if (firmada.error) throw new Error(firmada.error.message);
      const r = unwrap(await db().from("elemento_archivos").insert({
        tablero_id: ctx.tablero.id, elemento_id: e.id, columna_id: c.id, ruta, nombre, tamano,
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
