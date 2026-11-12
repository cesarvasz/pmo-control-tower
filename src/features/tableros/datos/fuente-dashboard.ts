// SOLO SERVIDOR. El dashboard de la app leído DIRECTO de Supabase (preparación de la Fase 6).
//
//   dashboardRawDesdeTableros() → el mismo DashboardRaw que hoy arma fetchDashboardRaw() con
//   Monday, pero con los tableros de la app (Estrategia, Iniciativas, PML y los de Proyecto) y el
//   directorio (`personas`). Es la pieza que, en la Fase 6, reemplaza la lectura de Monday.
//
//   compararDashboardCompleto() → arma el DashboardData con la copia de Monday (monday_*) y con
//   los tableros, y los compara (dominio/dashboard.ts). Las dos fuentes se llenan en la misma
//   corrida de sincronización, así que se comparan en el mismo momento.
//
// Lo que no viene de Monday (bases del EVM, atribuciones, On Hold, Clase, NPS…) es igual para los
// dos lados y se lee una sola vez. Lo de Apps Script y Sheets (calendario, hoja, recordatorios,
// ROI) no entra: no depende de la fuente y se deja vacío en los dos.

import { getSupabaseAdmin, selectAll, unwrap } from "@/lib/supabase-admin";
import { leerBoardsEspejo, leerProjBoardsEspejo, aProjBoardRaw } from "@/lib/mondayMirrorRead";
import { buildDashboardData } from "@/lib/dashboardData";
import { listNpsRecords } from "@/lib/surveys";
import {
  getAtrasoDetalles, getAttributions, getBoardAlcances, getClases, getMetodologiaCalifs, getOnHold, getProjItemBaselines, getReqBaselines,
} from "@/lib/store";
import type { DashboardRaw, MondayItem, ProjBoardRaw } from "@/types";
import type { Tables } from "@/types/supabase";
import { nombreBoard, tableroAMondayItems, type PersonaMetricas } from "../dominio/metricas";
import {
  compararDashboard, completarDatosDeEscritura, personasAHrItems, type DatosDeEscritura, type ResultadoParidadDashboard,
} from "../dominio/dashboard";
import type { TableroCompleto } from "../dominio/tablero";
import { claveNombre } from "../dominio/personas";
import { leerExtras, leerTablero, listarPersonasCorto, type Acceso } from "./tableros";

const ACCESO_SISTEMA: Acceso = { usuario: { rolId: "admin", esAdmin: true, personaId: null }, reglas: [] };

/** La parte de DashboardRaw que hoy sale de Monday. */
export type FuenteMonday = Pick<DashboardRaw, "iniItems" | "reqItems" | "hrItems" | "estrategiaItems" | "projBoards" | "projRaw">;

/** Lo que no depende de la fuente (Supabase de la app): igual para Monday y para los tableros. */
export type Comunes = Omit<DashboardRaw, keyof FuenteMonday>;

export async function leerComunes(): Promise<Comunes> {
  const [baselines, projItemBaselines, npsRecords, delayAttributions, reprocesoAttributions, metodologiaCalifs, atrasoDetalles, boardAlcance, onHold, clases] = await Promise.all([
    getReqBaselines(), getProjItemBaselines(), listNpsRecords(), getAttributions("delay"), getAttributions("reproceso"),
    getMetodologiaCalifs(), getAtrasoDetalles(), getBoardAlcances(), getOnHold(), getClases(),
  ]);
  return {
    calData: [], sheetRows: [], reminderLog: [],
    baselines, projItemBaselines, npsRecords, delayAttributions, reprocesoAttributions, metodologiaCalifs, atrasoDetalles, boardAlcance, onHold, clases,
    fetchedAt: new Date().toISOString(),
  };
}

// ── Desde los tableros de la app ─────────────────────────────────────────────

export interface FuenteTableros extends FuenteMonday {
  /** Ids de board de los tableros de proyecto que nacieron en la app (sin board en Monday). */
  soloEnLaApp: Set<string>;
}

export interface OpcionesFuente {
  /** Solo ese proyecto (id de Monday o del tablero), más Iniciativas y el directorio: lo que
   *  necesita el refresh de un board. Estrategia y PML quedan vacíos; `projBoards` lista todos. */
  soloProyecto?: string;
  /** Para la app (Fase 6): sin los tableros de proyecto nacidos en la app (mientras dure la
   *  convivencia, la app muestra lo mismo que Monday) y con los datos para escribir en Monday. */
  paraLaApp?: boolean;
}

/** El directorio (`personas`) con la forma del board Directorio RH. */
async function leerHrItems(): Promise<MondayItem[]> {
  const db = getSupabaseAdmin();
  const [personas, rh] = await Promise.all([
    selectAll<Tables<"personas">>((d, h) => db.from("personas").select("*").order("id").range(d, h)),
    unwrap(await db.from("monday_boards").select("columnas").eq("tipo", "rh").eq("activo", true).limit(1).maybeSingle()),
  ]);
  return personasAHrItems(personas.map((p) => ({
    id: p.id, nombre: p.nombre, email: p.email, grupo: p.grupo, rol: p.rol, tld: p.tld,
    hrsMes: p.hrs_mes === null ? null : Number(p.hrs_mes), activo: p.activo, mondayItemId: p.monday_item_id,
  })), (rh?.columnas ?? {}) as Record<string, { title: string }>);
}

/** Fase 6: el Directorio RH leído del directorio de la app (p. ej. para las encuestas). */
export const hrItemsDesdeTableros = leerHrItems;

/** Correo y board oculto de cada item de esos boards, de la copia de Monday (para escribirles). */
async function datosDeEscritura(mondayBoardIds: string[]): Promise<Map<string, DatosDeEscritura>> {
  if (!mondayBoardIds.length) return new Map();
  const db = getSupabaseAdmin();
  const filas = await selectAll<Pick<Tables<"monday_items">, "id" | "email" | "sub_board_id">>((d, h) =>
    db.from("monday_items").select("id, email, sub_board_id").in("board_id", mondayBoardIds).is("deleted_at", null).order("id").range(d, h));
  return new Map(filas.map((f) => [f.id, { email: f.email, subBoard: f.sub_board_id }]));
}

export async function leerFuenteTableros(opciones: OpcionesFuente = {}): Promise<FuenteTableros> {
  const { soloProyecto, paraLaApp = false } = opciones;
  const db = getSupabaseAdmin();
  const [todas, personasCorto, hrItems, ordenCarpeta] = await Promise.all([
    unwrap(await db.from("tableros").select("id, categoria, monday_board_id, nombre, codigo").is("archivado_at", null)
      .in("categoria", ["estrategia", "iniciativas", "pml", "proyecto"])) ?? [],
    listarPersonasCorto(),
    leerHrItems(),
    unwrap(await db.from("monday_boards").select("id, orden").eq("tipo", "proj")) ?? [],
  ]);
  const mapaPersonas = new Map<string, PersonaMetricas>(personasCorto.map((p) => [p.id, p]));
  const idBoard = (f: { id: string; monday_board_id: string | null }) => f.monday_board_id ?? f.id;
  const soloEnLaApp = new Set(todas.filter((f) => f.categoria === "proyecto" && !f.monday_board_id).map((f) => f.id));
  // Mientras dure la convivencia, a las páginas solo llega lo que viene de Monday: un tablero nacido en
  // la app (de cualquier categoría: un segundo de Iniciativas o de PML también) es modelado en curso.
  const filas = paraLaApp ? todas.filter((f) => !!f.monday_board_id) : todas;
  // Los proyectos en el orden de la carpeta de Monday (como la app de hoy); lo demás, por nombre al final.
  const posicion = new Map(ordenCarpeta.map((b) => [b.id, b.orden ?? Number.MAX_SAFE_INTEGER]));
  const porCarpeta = (a: { id: string; name: string }, b: { id: string; name: string }) =>
    (posicion.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (posicion.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, "es");
  const proyectosMeta = filas.filter((f) => f.categoria === "proyecto")
    .map((f) => ({ id: idBoard(f), name: nombreBoard(f) }))
    .sort(porCarpeta);
  const aLeer = soloProyecto
    ? filas.filter((f) => f.categoria === "iniciativas" || (f.categoria === "proyecto" && idBoard(f) === soloProyecto))
    : filas;

  // Cada tablero completo, con lo que necesitan sus fórmulas y espejos (tableros ligados y archivos).
  const completos = (await Promise.all(aLeer.map(async (f) => {
    const t = await leerTablero(f.id, ACCESO_SISTEMA);
    if (!t) return null;
    const extras = await leerExtras(t, ACCESO_SISTEMA);
    return { t, items: tableroAMondayItems(t, mapaPersonas, { ligados: extras.ligados, archivos: extras.archivos.map((a) => ({ ...a })) }) };
  }))).filter((x): x is { t: TableroCompleto; items: MondayItem[] } => !!x);

  const de = (categoria: string) => completos.filter((c) => c.t.tablero.categoria === categoria);
  const proyectos = de("proyecto");
  let projRaw: ProjBoardRaw[] = proyectos.map(({ t, items }) => ({
    id: t.tablero.mondayBoardId ?? t.tablero.id, name: nombreBoard(t.tablero), items_page: { items },
  })).sort(porCarpeta);
  if (paraLaApp) {
    const copia = await datosDeEscritura(proyectos.flatMap(({ t }) => (t.tablero.mondayBoardId ? [t.tablero.mondayBoardId] : [])));
    projRaw = projRaw.map((b) => ({ ...b, items_page: { items: completarDatosDeEscritura(b.items_page.items, copia) } }));
  }

  return {
    iniItems: de("iniciativas").flatMap((c) => c.items),
    reqItems: de("pml").flatMap((c) => c.items),
    estrategiaItems: de("estrategia").flatMap((c) => c.items),
    hrItems,
    projRaw,
    projBoards: proyectosMeta,
    soloEnLaApp,
  };
}

/** El DashboardRaw completo leído de Supabase (tableros + lo propio de la app), sin lo de Apps Script. */
export async function dashboardRawDesdeTableros(): Promise<DashboardRaw> {
  const [fuente, comunes] = await Promise.all([leerFuenteTableros({ paraLaApp: true }), leerComunes()]);
  const { soloEnLaApp: _ignorado, ...resto } = fuente;
  void _ignorado;
  return { ...resto, ...comunes };
}

// ── Fase 6: lo que usa la app con FUENTE_DATOS=tableros ──────────────────────

/** Cuándo empezó la última sincronización que terminó (los datos de Monday son de ese momento). */
export async function ultimaSincronizacion(): Promise<string | null> {
  const r = unwrap(await getSupabaseAdmin().from("tablero_sincronizaciones").select("inicio")
    .in("estado", ["ok", "con_errores"]).order("inicio", { ascending: false }).limit(1).maybeSingle());
  return r?.inicio ?? null;
}

/** La parte de Monday del dashboard, leída de los tableros. `actualizadoAl`: la última sincronización. */
export async function fuenteMondayDesdeTableros(): Promise<{ fuente: FuenteMonday; actualizadoAl: string | null }> {
  const [{ soloEnLaApp: _ignorado, ...fuente }, actualizadoAl] = await Promise.all([leerFuenteTableros({ paraLaApp: true }), ultimaSincronizacion()]);
  void _ignorado;
  return { fuente, actualizadoAl };
}

/** Un solo proyecto (el refresh de un board): sus items, la lista de todos los boards, Iniciativas
 *  y el directorio — lo mismo que /api/dashboard/board/[boardId] pide a Monday. */
export async function proyectoDesdeTableros(boardId: string): Promise<{
  allBoardsMeta: { id: string; name: string }[]; projRaw: ProjBoardRaw | null; iniItems: MondayItem[]; hrItems: MondayItem[];
}> {
  const f = await leerFuenteTableros({ soloProyecto: boardId, paraLaApp: true });
  return { allBoardsMeta: f.projBoards, projRaw: f.projRaw[0] ?? null, iniItems: f.iniItems, hrItems: f.hrItems };
}

// ── Desde la copia de Monday (monday_*) ──────────────────────────────────────

export async function leerFuenteCopiaMonday(): Promise<FuenteMonday> {
  const ini = process.env.MONDAY_INI_BOARD_ID ?? "";
  const req = process.env.MONDAY_REQ_BOARD_ID ?? "";
  const rh = process.env.MONDAY_RH_BOARD_ID ?? "";
  const est = process.env.MONDAY_EST_BOARD_ID || "18291587533";
  const projBoards = await leerProjBoardsEspejo();
  const boards = await leerBoardsEspejo([ini, req, rh, est, ...projBoards.map((b) => b.id)].filter(Boolean));
  const items = (id: string) => boards.find((b) => b.id === id)?.items ?? [];
  return {
    iniItems: items(ini), reqItems: items(req), hrItems: items(rh), estrategiaItems: items(est),
    projBoards,
    projRaw: projBoards.flatMap((p) => { const b = boards.find((x) => x.id === p.id); return b ? [aProjBoardRaw(b)] : []; }),
  };
}

// ── La comparación ───────────────────────────────────────────────────────────

export interface ComparacionDashboard extends ResultadoParidadDashboard {
  /** Cuándo se copió Monday por última vez (las dos fuentes se llenan en la misma corrida). */
  copiaDel: string | null;
  duracionMs: number;
}

export async function compararDashboardCompleto(): Promise<ComparacionDashboard> {
  const inicio = Date.now();
  const [monday, tableros, comunes, personas, copia] = await Promise.all([
    // Los tableros, tal como los lee la app con FUENTE_DATOS=tableros.
    leerFuenteCopiaMonday(), leerFuenteTableros({ paraLaApp: true }), leerComunes(), listarPersonasCorto(),
    getSupabaseAdmin().from("monday_boards").select("synced_at").eq("activo", true).order("synced_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { soloEnLaApp, ...deTableros } = tableros;
  const a = buildDashboardData({ ...monday, ...comunes });
  const b = buildDashboardData({ ...deTableros, ...comunes });
  // Igual que «Comparar con Monday» por tablero: por nombre (sin acentos) o por correo.
  const conocidos = new Set(personas.flatMap((p) => [claveNombre(p.nombre), ...(p.email ? [p.email.trim().toLowerCase()] : [])]));
  const enDirectorio = (n: string) => conocidos.has(n.includes("@") ? n.trim().toLowerCase() : claveNombre(n));
  return { ...compararDashboard(a, b, soloEnLaApp, enDirectorio), copiaDel: copia.data?.synced_at ?? null, duracionMs: Date.now() - inicio };
}
