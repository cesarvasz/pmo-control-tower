// SOLO SERVIDOR. Importar boards de Monday como tableros de la app (tal cual, con roles asignados)
// desde la copia monday_boards / monday_items, y compararlos con Monday.
//
// Qué se importa y en qué orden (las relaciones necesitan que su destino ya esté importado):
//   Estrategia → Iniciativas → PML / VALOR Lite → Proyectos.
// El Directorio RH no se importa como tablero: ya es la tabla `personas`.

import { enTrozos, getSupabaseAdmin, selectAll, unwrap } from "@/lib/supabase-admin";
import type { AppUser } from "@/lib/permissions";
import { leerBoardsEspejo } from "@/lib/mondayMirrorRead";
import { sincronizarBoard } from "@/lib/mondayMirrorSync";
import { buildEstrategiaMap, buildNameResolver, projProcess, splitBoardName } from "@/lib/proj";
import { iniProcess } from "@/lib/ini";
import { reqProcess } from "@/lib/req";
import type { MondayItem, ProjItemBaseline } from "@/types";
import type { TipoBoard } from "@/lib/mondayMirror";
import { claveNombre } from "../dominio/personas";
import { mondayADefinicion, type ColumnaMonday, type FilaMonday, type RelacionImportada } from "../dominio/importar-monday";
import { tableroAMondayItems, tableroAProjItems, type PersonaMetricas } from "../dominio/metricas";
import { diferenciasPorId, diferenciasProfundas, diferenciasProjItems, filaIgual, resumenMetricas, separarExplicadas, separarPersonasFuera, type FilaMetrica } from "../dominio/paridad";
import { limpiarTexto, MAX_NOMBRE, type TableroCompleto } from "../dominio/tablero";
import { crearDesdeDefinicion } from "./materializar";
import { leerExtras, listarPersonasCorto, type Acceso } from "./tableros";
import { ErrorTablero } from "./errores";

/** Tipo de board de Monday → categoría de tablero, en el orden en que se importan. */
export const CATEGORIA_POR_TIPO: [TipoBoard, string, string][] = [
  ["est", "estrategia", "Estrategia"],
  ["ini", "iniciativas", "Iniciativas"],
  ["req", "pml", "PML / VALOR Lite"],
  ["proj", "proyecto", "Proyectos"],
];
const TIPOS_IMPORTABLES = CATEGORIA_POR_TIPO.map(([t]) => t);

export interface BoardImportable {
  id: string;
  nombre: string;
  tipo: TipoBoard;
  /** Tablero de la app que ya lo importó (vigente). */
  tableroId: string | null;
}

/** Boards importables en el orden en que conviene importarlos. */
export async function listarBoardsImportables(): Promise<BoardImportable[]> {
  const db = getSupabaseAdmin();
  const [boards, tableros] = await Promise.all([
    unwrap(await db.from("monday_boards").select("id, nombre, tipo").in("tipo", TIPOS_IMPORTABLES).eq("activo", true).order("nombre")) ?? [],
    unwrap(await db.from("tableros").select("id, monday_board_id").not("monday_board_id", "is", null).is("archivado_at", null)) ?? [],
  ]);
  const importado = new Map(tableros.map((t) => [t.monday_board_id!, t.id]));
  const orden = (t: string) => TIPOS_IMPORTABLES.indexOf(t as TipoBoard);
  return boards
    .map((b) => ({ id: b.id, nombre: b.nombre, tipo: b.tipo as TipoBoard, tableroId: importado.get(b.id) ?? null }))
    .sort((a, b) => orden(a.tipo) - orden(b.tipo) || a.nombre.localeCompare(b.nombre, "es"));
}

/** Personas del directorio, para ligar nombres o correos (sin acentos ni mayúsculas) y para las métricas. */
async function directorio() {
  const filas = await listarPersonasCorto();
  const porNombre = new Map<string, string>();
  // Las activas ganan si hay dos con el mismo nombre.
  for (const p of [...filas].sort((a, b) => Number(a.activo) - Number(b.activo))) {
    porNombre.set(claveNombre(p.nombre), p.id);
    if (p.email) porNombre.set(p.email.trim().toLowerCase(), p.id); // Monday a veces muestra el correo (invitados)
  }
  const metricas = new Map<string, PersonaMetricas>(filas.map((p) => [p.id, p]));
  return { porNombre, metricas };
}

/** Boards a los que apuntan las relaciones de unas columnas de Monday (settings_str.boardIds). */
function destinosDeRelaciones(...mapas: Record<string, ColumnaMonday>[]): string[] {
  const out = new Set<string>();
  for (const mapa of mapas) {
    for (const [id, c] of Object.entries(mapa)) {
      if (!/^(board_relation|connect_boards)/.test(id)) continue;
      try { for (const b of (JSON.parse(c.settings_str ?? "{}") as { boardIds?: (string | number)[] }).boardIds ?? []) out.add(String(b)); } catch { /* sin settings */ }
    }
  }
  return [...out];
}

/** Los boards ya importados a los que apunta el que se importa (solo esos: cargar todos es lento). */
async function relacionesImportadas(excepto: string, destinos: string[]): Promise<Record<string, RelacionImportada>> {
  const db = getSupabaseAdmin();
  const buscados = destinos.filter((d) => d !== excepto && d !== process.env.MONDAY_RH_BOARD_ID);
  if (!buscados.length) return {};
  const tableros = unwrap(await db.from("tableros").select("id, monday_board_id").in("monday_board_id", buscados).is("archivado_at", null)) ?? [];
  const out: Record<string, RelacionImportada> = {};
  for (const t of tableros) {
    const [elementos, columnas] = await Promise.all([
      selectAll<{ id: string; nombre: string }>((d, h) => db.from("elementos").select("id, nombre")
        .eq("tablero_id", t.id).is("parent_id", null).is("archivado_at", null).order("id").range(d, h)),
      unwrap(await db.from("tablero_columnas").select("id, monday_column_id").eq("tablero_id", t.id).eq("nivel", "item").is("archivada_at", null)) ?? [],
    ]);
    const porNombre = new Map<string, string>();
    for (const e of elementos) if (!porNombre.has(claveNombre(e.nombre))) porNombre.set(claveNombre(e.nombre), e.id);
    const porColumna = new Map(columnas.filter((c) => c.monday_column_id).map((c) => [c.monday_column_id!, c.id]));
    out[t.monday_board_id!] = {
      tableroId: t.id,
      elementoPorNombre: (n) => porNombre.get(claveNombre(n)),
      columnaPorMondayId: (id) => porColumna.get(id),
    };
  }
  return out;
}

/** Nombre y código del tablero según el nombre del board en Monday ("PM-013 | TDP ADU" → código PM-013),
 *  limpios como los guarda la app (sin espacios dobles), para que comparar con lo guardado no dé falsos cambios. */
export function nombreYCodigo(nombreBoard: string, tipo: TipoBoard): { nombre: string; codigo: string | null } {
  const limpio = (x: string) => limpiarTexto(x, MAX_NOMBRE) ?? x;
  if (tipo !== "proj") return { nombre: limpio(nombreBoard), codigo: null };
  const { code, name } = splitBoardName(nombreBoard);
  return { nombre: limpio(name || nombreBoard), codigo: limpiarTexto(code, 30) };
}

/** Lo que hay HOY en la copia de Monday de un board, pasado a definición de tablero (sin escribir nada).
 *  Lo usan importar (crear el tablero) y sincronizar (fusionarlo con el que ya existe). */
export async function definicionDesdeLaCopia(mondayBoardId: string) {
  const db = getSupabaseAdmin();
  const board = unwrap(await db.from("monday_boards").select("id, nombre, tipo, columnas").eq("id", mondayBoardId).in("tipo", TIPOS_IMPORTABLES).maybeSingle());
  if (!board) throw new ErrorTablero(404, "Ese board no está en la copia de Monday (o no se importa)");
  const subBoard = unwrap(await db.from("monday_boards").select("columnas").eq("padre_board_id", mondayBoardId).limit(1).maybeSingle());
  const destinos = destinosDeRelaciones(board.columnas as unknown as Record<string, ColumnaMonday>, (subBoard?.columnas ?? {}) as unknown as Record<string, ColumnaMonday>);
  const [rhBoard, filas, dir, relaciones] = await Promise.all([
    unwrap(await db.from("monday_boards").select("columnas").eq("tipo", "rh").eq("activo", true).limit(1).maybeSingle()),
    selectAll<FilaMonday>((d, h) => db.from("monday_items")
      .select("id, parent_id, orden, nombre, grupo, column_values").eq("board_id", mondayBoardId).is("deleted_at", null)
      .order("id").range(d, h) as unknown as PromiseLike<{ data: FilaMonday[] | null; error: null }>),
    directorio(),
    relacionesImportadas(mondayBoardId, destinos),
  ]);
  const personaPorNombre = (n: string) => dir.porNombre.get(n.includes("@") ? n.trim().toLowerCase() : claveNombre(n));
  const resultado = mondayADefinicion({
    columnas: board.columnas as unknown as Record<string, ColumnaMonday>,
    columnasSub: (subBoard?.columnas ?? {}) as unknown as Record<string, ColumnaMonday>,
    filas,
    rhBoardId: process.env.MONDAY_RH_BOARD_ID ?? null,
    rhColumnas: (rhBoard?.columnas ?? {}) as unknown as Record<string, ColumnaMonday>,
    personaPorNombre,
    relaciones,
  });
  return { board: { id: board.id, nombre: board.nombre, tipo: board.tipo as TipoBoard }, filas, personaPorNombre, ...resultado };
}

export interface ResultadoImportarBoard {
  tableroId: string;
  elementos: number;
  subelementos: number;
  omitidas: { nivel: string; titulo: string; tipo: string }[];
  personasNoEncontradas: string[];
  ligadosNoEncontrados: string[];
  aviso: string | null;
}

export async function importarBoard(
  mondayBoardId: string, opciones: { refrescar: boolean; reemplazar: boolean }, me: AppUser,
): Promise<ResultadoImportarBoard> {
  const db = getSupabaseAdmin();
  const fila = unwrap(await db.from("monday_boards").select("id, tipo").eq("id", mondayBoardId).in("tipo", TIPOS_IMPORTABLES).maybeSingle());
  if (!fila) throw new ErrorTablero(404, "Ese board no está en la copia de Monday (o no se importa)");
  const tipo = fila.tipo as TipoBoard;
  const categoria = CATEGORIA_POR_TIPO.find(([t]) => t === tipo)![1];

  const previo = unwrap(await db.from("tableros").select("id").eq("monday_board_id", mondayBoardId).maybeSingle());
  if (previo && !opciones.reemplazar) throw new ErrorTablero(409, "Ese board ya está importado. Usa «Volver a importar» para reemplazarlo.");

  let aviso: string | null = null;
  if (opciones.refrescar) {
    try { await sincronizarBoard(mondayBoardId, tipo); } catch (e) {
      aviso = `No se pudo refrescar desde Monday (${e instanceof Error ? e.message : "error"}); se usó la última copia.`;
    }
  }

  const { board, definicion, omitidas, personasNoEncontradas, ligadosNoEncontrados } = await definicionDesdeLaCopia(mondayBoardId);

  // Reemplazar: se borra el anterior y se crea con LOS MISMOS ids (tablero, columnas, elementos),
  // para no romper lo que apunta a él desde otros tableros; sus reglas de permisos se conservan.
  let idsFijos: { tableroId: string; columnas: Map<string, string>; elementos: Map<string, string> } | undefined;
  let permisos: Record<string, unknown>[] = [];
  if (previo) {
    const [cols, els, perms, rutas] = await Promise.all([
      unwrap(await db.from("tablero_columnas").select("id, nivel, monday_column_id").eq("tablero_id", previo.id)) ?? [],
      selectAll<{ id: string; monday_item_id: string | null }>((d, h) => db.from("elementos").select("id, monday_item_id")
        .eq("tablero_id", previo.id).order("id").range(d, h)),
      unwrap(await db.from("tablero_permisos").select("*").eq("tablero_id", previo.id)) ?? [],
      unwrap(await db.from("elemento_archivos").select("ruta").eq("tablero_id", previo.id)) ?? [],
    ]);
    idsFijos = {
      tableroId: previo.id,
      columnas: new Map(cols.filter((c) => c.monday_column_id).map((c) => [`${c.nivel}:${c.monday_column_id}`, c.id])),
      elementos: new Map(els.filter((e) => e.monday_item_id).map((e) => [e.monday_item_id!, e.id])),
    };
    permisos = perms;
    // Sus archivos en Storage no se borran en cascada: se quitan antes.
    for (const lote of enTrozos(rutas.map((a) => a.ruta), 100)) await db.storage.from("tableros").remove(lote);
    unwrap(await db.from("tableros").delete().eq("id", previo.id));
  }
  const tableroId = await crearDesdeDefinicion(definicion, {
    ...nombreYCodigo(board.nombre, tipo),
    categoria, mondayBoardId, idsFijos,
  }, me);
  if (permisos.length) unwrap(await db.from("tablero_permisos").insert(permisos as never));

  return {
    tableroId,
    elementos: definicion.elementos.filter((e) => !e.padre).length,
    subelementos: definicion.elementos.filter((e) => e.padre).length,
    omitidas, personasNoEncontradas, ligadosNoEncontrados, aviso,
  };
}

// ── Comparar con Monday ──────────────────────────────────────────────────────

export type FilaComparacion = FilaMetrica;

export interface Comparacion {
  tipo: TipoBoard;
  diferencias: string[];
  /** Personas que Monday tenía y no están en el directorio (no cuentan como diferencia). */
  avisos: string[];
  filas: FilaComparacion[];
  copiaDel: string | null;
  /** Diferencias que ya se decidieron (no cuentan): su motivo y cuántas son. */
  explicadas: { motivo: string; cantidad: number }[];
}

const FILAS_PROYECTO: { clave: keyof ReturnType<typeof resumenMetricas>; etiqueta: string; formato?: FilaComparacion["formato"] }[] = [
  { clave: "elementos", etiqueta: "Elementos" }, { clave: "subelementos", etiqueta: "Subelementos" },
  { clave: "hechos", etiqueta: "Hechos (Done)" }, { clave: "atrasados", etiqueta: "Atrasados" },
  { clave: "entregasATiempo", etiqueta: "Entregas a tiempo" }, { clave: "entregasTarde", etiqueta: "Entregas tarde" },
  { clave: "costo", etiqueta: "Costo", formato: "dinero" }, { clave: "beneficio", etiqueta: "Beneficio", formato: "dinero" },
  { clave: "ev", etiqueta: "EV (valor ganado)", formato: "dinero" }, { clave: "pv", etiqueta: "PV (valor planeado)", formato: "dinero" },
  { clave: "ac", etiqueta: "AC (costo real)", formato: "dinero" }, { clave: "spi", etiqueta: "SPI", formato: "indice" },
  { clave: "cpi", etiqueta: "CPI", formato: "indice" }, { clave: "scope", etiqueta: "Alcance", formato: "pct" },
  { clave: "healthIndex", etiqueta: "Índice de salud (EVM)", formato: "indice" }, { clave: "healthStatus", etiqueta: "Salud" },
];

/** Cuántos por cada valor de un campo (p. ej. status), para mostrar lado a lado. */
function conteoPor<T>(lista: T[], campo: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of lista) { const k = campo(x) || "(vacío)"; out[k] = (out[k] ?? 0) + 1; }
  return out;
}

function filasConteo(etiqueta: string, a: Record<string, number>, b: Record<string, number>): FilaComparacion[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().map((k) => ({ etiqueta: `${etiqueta}: ${k}`, monday: a[k] ?? 0, app: b[k] ?? 0 }));
}

/** Mide el tablero importado y su board de Monday con la MISMA lógica de la app y lista las diferencias. */
export async function compararConMonday(t: TableroCompleto, acceso: Acceso): Promise<Comparacion> {
  const c = await compararCrudo(t, acceso);
  const dir = await directorio();
  const enDirectorio = (n: string) => dir.porNombre.has(n.includes("@") ? n.toLowerCase() : claveNombre(n));
  const personas = separarPersonasFuera(c.diferencias, enDirectorio);
  const e = separarExplicadas(t.tablero.codigo, personas.diferencias, c.filas);
  return { ...c, avisos: personas.avisos, diferencias: e.diferencias, filas: e.filas, explicadas: e.explicadas };
}

async function compararCrudo(t: TableroCompleto, acceso: Acceso): Promise<Omit<Comparacion, "avisos" | "explicadas">> {
  const mondayId = t.tablero.mondayBoardId;
  if (!mondayId) throw new ErrorTablero(400, "Este tablero no viene de Monday");
  const db = getSupabaseAdmin();
  const rhId = process.env.MONDAY_RH_BOARD_ID;
  const [espejo, dir, extras, info] = await Promise.all([
    leerBoardsEspejo(rhId ? [mondayId, rhId] : [mondayId]),
    directorio(),
    leerExtras(t, acceso),
    db.from("monday_boards").select("synced_at, tipo").eq("id", mondayId).maybeSingle(),
  ]);
  const board = espejo.find((b) => b.id === mondayId);
  if (!board) throw new ErrorTablero(404, "El board ya no está en la copia de Monday");
  const hrItems: MondayItem[] = espejo.find((b) => b.id === rhId)?.items ?? [];
  const tipo = board.tipo;
  const copiaDel = info.data?.synced_at ?? null;
  const ctx = { ligados: extras.ligados, archivos: extras.archivos.map((a) => ({ ...a })) };

  if (tipo === "proj") {
    const baselinesFilas = await selectAll<{ item_id: string; board_id: string; cost: number; saved_at: string }>((d, h) =>
      db.from("proj_item_baselines").select("item_id, board_id, cost, saved_at").eq("board_id", mondayId).order("item_id").range(d, h));
    const baselines: Record<string, ProjItemBaseline> = Object.fromEntries(
      baselinesFilas.map((b) => [b.item_id, { boardId: b.board_id, cost: Number(b.cost), savedAt: b.saved_at }]));
    const deMonday = projProcess(board.nombre, board.id, board.items);
    const deApp = tableroAProjItems(t, dir.metricas, ctx);
    const m = resumenMetricas(deMonday, baselines);
    const a = resumenMetricas(deApp, baselines);
    return { tipo, diferencias: diferenciasProjItems(deMonday, deApp), filas: FILAS_PROYECTO.map((f) => ({ etiqueta: f.etiqueta, monday: m[f.clave], app: a[f.clave], formato: f.formato })), copiaDel };
  }

  const items = tableroAMondayItems(t, dir.metricas, ctx);
  const resolveName = buildNameResolver(hrItems);
  if (tipo === "ini") {
    const m = iniProcess(board.items, resolveName);
    const a = iniProcess(items, resolveName);
    return { tipo, diferencias: diferenciasPorId(m, a), filas: [{ etiqueta: "Iniciativas", monday: m.length, app: a.length }, ...filasConteo("Status", conteoPor(m, (x) => x.status), conteoPor(a, (x) => x.status))], copiaDel };
  }
  if (tipo === "req") {
    const m = reqProcess(board.items);
    const a = reqProcess(items);
    return { tipo, diferencias: diferenciasPorId(m, a), filas: [{ etiqueta: "Requerimientos", monday: m.length, app: a.length }, ...filasConteo("Grupo", conteoPor(m, (x) => x.grupo), conteoPor(a, (x) => x.grupo))], copiaDel };
  }
  if (tipo === "est") {
    const m = [...buildEstrategiaMap(board.items, hrItems)].sort(([x], [y]) => x.localeCompare(y));
    const a = [...buildEstrategiaMap(items, hrItems)].sort(([x], [y]) => x.localeCompare(y));
    return { tipo, diferencias: diferenciasProfundas("Estrategia", m, a), filas: [{ etiqueta: "Objetivos", monday: m.length, app: a.length }], copiaDel };
  }
  throw new ErrorTablero(400, "Ese tipo de board no se compara");
}

/** Guarda en el historial la última comparación de cada tablero (para el resumen del portafolio). */
export type ResumenComparacion = { tableroId: string; diferencias: number; filasDistintas: number; muestra: string[] } & Pick<Comparacion, "tipo">;

export function resumirComparacion(tableroId: string, c: Comparacion): ResumenComparacion {
  return {
    tableroId, tipo: c.tipo, diferencias: c.diferencias.length,
    filasDistintas: c.filas.filter((f) => !filaIgual(f)).length,
    muestra: c.diferencias.slice(0, 5),
  };
}

