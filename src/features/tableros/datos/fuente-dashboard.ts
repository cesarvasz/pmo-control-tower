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
import { compararDashboard, personasAHrItems, type ResultadoParidadDashboard } from "../dominio/dashboard";
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

export async function leerFuenteTableros(): Promise<FuenteTableros> {
  const db = getSupabaseAdmin();
  const [filas, personasCorto, personas, rh] = await Promise.all([
    unwrap(await db.from("tableros").select("id, categoria, monday_board_id").is("archivado_at", null)
      .in("categoria", ["estrategia", "iniciativas", "pml", "proyecto"])) ?? [],
    listarPersonasCorto(),
    selectAll<Tables<"personas">>((d, h) => db.from("personas").select("*").order("id").range(d, h)),
    unwrap(await db.from("monday_boards").select("columnas").eq("tipo", "rh").eq("activo", true).limit(1).maybeSingle()),
  ]);
  const mapaPersonas = new Map<string, PersonaMetricas>(personasCorto.map((p) => [p.id, p]));

  // Cada tablero completo, con lo que necesitan sus fórmulas y espejos (tableros ligados y archivos).
  const completos = (await Promise.all(filas.map(async (f) => {
    const t = await leerTablero(f.id, ACCESO_SISTEMA);
    if (!t) return null;
    const extras = await leerExtras(t, ACCESO_SISTEMA);
    return { t, items: tableroAMondayItems(t, mapaPersonas, { ligados: extras.ligados, archivos: extras.archivos.map((a) => ({ ...a })) }) };
  }))).filter((x): x is { t: TableroCompleto; items: MondayItem[] } => !!x);

  const de = (categoria: string) => completos.filter((c) => c.t.tablero.categoria === categoria);
  const proyectos = de("proyecto").sort((x, y) => nombreBoard(x.t.tablero).localeCompare(nombreBoard(y.t.tablero), "es"));
  const projRaw: ProjBoardRaw[] = proyectos.map(({ t, items }) => ({
    id: t.tablero.mondayBoardId ?? t.tablero.id, name: nombreBoard(t.tablero), items_page: { items },
  }));

  return {
    iniItems: de("iniciativas").flatMap((c) => c.items),
    reqItems: de("pml").flatMap((c) => c.items),
    estrategiaItems: de("estrategia").flatMap((c) => c.items),
    hrItems: personasAHrItems(personas.map((p) => ({
      id: p.id, nombre: p.nombre, email: p.email, grupo: p.grupo, rol: p.rol, tld: p.tld,
      hrsMes: p.hrs_mes === null ? null : Number(p.hrs_mes), activo: p.activo, mondayItemId: p.monday_item_id,
    })), (rh?.columnas ?? {}) as Record<string, { title: string }>),
    projRaw,
    projBoards: projRaw.map((b) => ({ id: b.id, name: b.name })),
    soloEnLaApp: new Set(proyectos.filter(({ t }) => !t.tablero.mondayBoardId).map(({ t }) => t.tablero.id)),
  };
}

/** Fase 6: el DashboardRaw completo leído de Supabase (tableros + lo propio de la app). */
export async function dashboardRawDesdeTableros(): Promise<DashboardRaw> {
  const [fuente, comunes] = await Promise.all([leerFuenteTableros(), leerComunes()]);
  const { soloEnLaApp: _ignorado, ...resto } = fuente;
  void _ignorado;
  return { ...resto, ...comunes };
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
    leerFuenteCopiaMonday(), leerFuenteTableros(), leerComunes(), listarPersonasCorto(),
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
