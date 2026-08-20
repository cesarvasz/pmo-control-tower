// src/lib/proj.ts
// Proyectos (multi-board), salud de board (EV/PV/AC + VEM), estrategia y
// lookups Iniciativa ↔ Proyecto. Funciones puras sobre items de Monday.

import { parseYMD, today } from "@/lib/business";
import { colText, colDisplay, colByTitle, colByTitleAny } from "@/lib/monday-cols";
import { calcVem, healthStatusFromIndex, type HealthStatus } from "@/lib/health";
import type {
  EstrategiaInfo,
  MondayColumnValue,
  MondayItem,
  ProjBoard,
  ProjItem,
  ProjItemBaseline,
} from "@/types";

// ─────────────────────────────────────────────────────────────────────
// PROYECTOS (multi-board)
// ─────────────────────────────────────────────────────────────────────
export const PROJ_ACTIVE_STS = new Set(["Working on it", "Future Steps", "Done"]);

export const PROJ_COL = {
  pm: "PM", resp: "Resp", responsible: "Responsible", status: "Status",
  deadline: "Limit Date", cost: "Cost $", benefit: "Benefit $",
  pmsId: "PMS ID", // ID del hito/subitem (ej. PMO-002-1)
  developer: "Developer", tld: "TLD", // columnas de subelemento (hito)
  endDate: "End Date",   // fecha real de cierre del item
  actualEnd: "Actual End", // fecha real de cierre del subitem (hito)
};

// Plantilla "NEW" de boards de Proyectos (PM-010/011/012): "Cost $" y "Limit Date"
// son columnas fórmula (Cost $ = Effort Spent × 9 · Limit Date = fin de un rango
// Timeline). Monday no expone el texto calculado de una fórmula vía la API, y su
// display_value para fechas no trae año — así que se recalculan desde las columnas
// fuente (no-fórmula) cuando la lectura directa viene vacía.
const FORMULA_FALLBACK_COL = { effort: "Effort Spent", itemTimeline: "CPM", subTimeline: "Timeline" };
const EFFORT_COST_RATE = 9;

export function resolveCost(cv: MondayColumnValue[]): number {
  const direct = parseFloat(colByTitle(cv, PROJ_COL.cost));
  if (Number.isFinite(direct)) return direct;
  const effort = parseFloat(colByTitle(cv, FORMULA_FALLBACK_COL.effort));
  return Number.isFinite(effort) ? effort * EFFORT_COST_RATE : 0;
}

function resolveDeadline(cv: MondayColumnValue[], timelineTitle: string): Date | null {
  const direct = parseYMD(colByTitle(cv, PROJ_COL.deadline));
  if (direct) return direct;
  const end = colByTitle(cv, timelineTitle).split(" - ")[1]?.trim();
  return end ? parseYMD(end) : null;
}

export function calcProjEstado(dl: Date | null): string {
  const t = today();
  if (!dl) return "ATRASADO";
  return dl < t ? "ATRASADO" : dl.getTime() === t.getTime() ? "PARA HOY" : "EN TIEMPO";
}

/**
 * Veredicto de entrega de un item/subitem de proyecto: solo aplica si está Done.
 * A tiempo si la fecha real de cierre (End Date / Actual End) es ≤ Limit Date; si no, atraso.
 * null si no está Done o falta alguna fecha.
 */
export function calcProjEntrega(status: string, actual: Date | null, limit: Date | null): "on-time" | "late" | null {
  if (status !== "Done" || !actual || !limit) return null;
  return actual.getTime() <= limit.getTime() ? "on-time" : "late";
}

export function projProcess(boardName: string, boardId: string, items: MondayItem[]): ProjItem[] {
  return items.map((item): ProjItem => {
    const cv = item.column_values || [];
    const pm = colByTitle(cv, PROJ_COL.pm);
    const resp = colByTitle(cv, PROJ_COL.resp);
    const responsible = colByTitleAny(cv, PROJ_COL.responsible).trim();
    const status = colByTitle(cv, PROJ_COL.status);
    const deadline = resolveDeadline(cv, FORMULA_FALLBACK_COL.itemTimeline);
    const endDate = parseYMD(colByTitle(cv, PROJ_COL.endDate));
    const cost = resolveCost(cv);
    const benefit = parseFloat(colByTitle(cv, PROJ_COL.benefit)) || 0;
    const estado = calcProjEstado(deadline);

    const subitems = (item.subitems || []).map((sub) => {
      const scv = sub.column_values || [];
      const sdl = resolveDeadline(scv, FORMULA_FALLBACK_COL.subTimeline);
      const sActualEnd = parseYMD(colByTitle(scv, PROJ_COL.actualEnd));
      const sStatus = colByTitle(scv, PROJ_COL.status);
      return {
        id: sub.id, name: sub.name,
        pmsId: colByTitle(scv, PROJ_COL.pmsId),
        status: sStatus,
        person: "",
        developer: colByTitleAny(scv, PROJ_COL.developer).trim(),
        tld: colByTitleAny(scv, PROJ_COL.tld).trim(),
        deadline: sdl, estado: calcProjEstado(sdl),
        actualEnd: sActualEnd,
        entrega: calcProjEntrega(sStatus, sActualEnd, sdl),
        cost: parseFloat(colByTitle(scv, PROJ_COL.cost)) || 0,
        benefit: parseFloat(colByTitle(scv, PROJ_COL.benefit)) || 0,
      };
    });

    return {
      boardId, boardName, id: item.id, name: item.name,
      grupo: item.group?.title || "",
      pm, resp, responsible, status, deadline, endDate, cost, benefit,
      entrega: calcProjEntrega(status, endDate, deadline),
      valueNet: benefit - cost, estado, subitems,
    };
  });
}

export interface BoardHealthData {
  ev: number; pv: number; ac: number; scope: number | null;
  spi: number | null; cpi: number | null;
  healthIndex: number | null;
  healthStatus: HealthStatus | null;
}

// Off Track = está atrasado y no se completó (un Done cuenta como On Track).
const isOffTrack = (status: string, estado: string) =>
  status !== "Done" && estado === "ATRASADO";

export function calcBoardMetrics(
  allBoardItems: ProjItem[],
  projItemBaselines: Record<string, ProjItemBaseline> = {},
): { ev: number; pv: number; ac: number; scope: number | null; spi: number | null; cpi: number | null } {
  let ev = 0, pv = 0, ac = 0;
  let hasItems = false, anyOffTrack = false;

  for (const item of allBoardItems) {
    const isDone    = item.status === "Done";
    const isWipLate = item.status === "Working on it" && item.estado === "ATRASADO";
    // EV y PV usan el costo planificado (baseline de Firestore); si aún no hay baseline
    // se usa el costo actual de Monday como fallback.
    const baseCost = projItemBaselines[item.id]?.cost ?? item.cost;

    // Scope binario: 0 si algún item o subitem está atrasado (off track), 100 si todo on track.
    hasItems = true;
    if (isOffTrack(item.status, item.estado)) anyOffTrack = true;
    for (const sub of item.subitems) {
      if (isOffTrack(sub.status, sub.estado)) anyOffTrack = true;
    }

    if (isDone) {
      ev += baseCost;   // valor planificado del trabajo completado
      pv += baseCost;   // también cuenta en PV
      ac += item.cost;  // costo actual de Monday
    } else if (isWipLate) {
      pv += baseCost;   // debería estar hecho → cuenta en PV
      ac += item.cost;  // costo actual de Monday
    }
  }

  const spi = pv > 0 ? ev / pv : null;
  const cpi = ac > 0 ? Math.min(1, ev / ac) : null;
  const scope = hasItems ? (anyOffTrack ? 0 : 100) : null;

  return { ev, pv, ac, scope, spi, cpi };
}

export function deriveBoardHealth(metrics: { ev: number; pv: number; ac: number; scope: number | null; spi: number | null; cpi: number | null }): BoardHealthData {
  // scope viene en 0–100 → se normaliza a fracción 0–1 para el VEM.
  const healthIndex = calcVem(metrics.spi, metrics.cpi, metrics.scope !== null ? metrics.scope / 100 : null);
  const healthStatus = healthStatusFromIndex(healthIndex);
  return { ...metrics, healthIndex, healthStatus };
}

// Columnas mirror/board_relation de Iniciativas para el lookup hacia Proyectos.
const INI_LOOKUP_COL = { estrategia: "board_relation_mm3by83p", sponsor: "lookup_mm3bdj38", benefitType: "dropdown_mm51s7pm" };

// Columna Email del board Directorio RH (el nombre del item es el nombre del recurso).
const RH_EMAIL_COL = "email_mkz5qg4v";
/** Construye el mapa email → nombre del recurso desde los items del Directorio RH. */
function buildEmailNameMap(hrItems: MondayItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const it of hrItems) {
    const email = colText(it.column_values, RH_EMAIL_COL).trim().toLowerCase();
    if (email && it.name) map.set(email, it.name);
  }
  return map;
}

/** Normaliza un nombre para el match Iniciativa ↔ Proyecto (sin acentos, minúsculas). */
const normName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
/** Separa el nombre de un board de proyecto en su código y su nombre:
 *  "PM-003 | DUCAfast 2.0 GT" → { code: "PM-003", name: "DUCAfast 2.0 GT" }.
 *  Sin "|" (boards que no siguen la convención) devuelve code vacío. */
export function splitBoardName(boardName: string): { code: string; name: string } {
  const i = boardName.indexOf("|");
  if (i < 0) return { code: "", name: boardName.trim() };
  return { code: boardName.slice(0, i).trim(), name: boardName.slice(i + 1).trim() };
}

/** Quita el prefijo "PM-XXX | " del nombre de un board de proyecto. */
const stripPmPrefix = (boardName: string) => splitBoardName(boardName).name;

/** Datos que se traen de la Iniciativa para enriquecer el Proyecto del mismo nombre. */
type IniLookupVal = { estrategia: string; sponsor: string; cku: string; benefitType: string };

/** Quita solo el código "PMO-XXX" (y un "|" separador) al inicio del nombre de una Iniciativa.
 *  Conserva marcadores como "IMP |"/"EXPO |" porque el REQ del mismo nombre también los trae. */
const stripIniCode = (name: string) => name.replace(/^\s*PMO-?\d+\s*\|?\s*/i, "").trim();

/** Mapa nombre-normalizado de Iniciativa → Benefit Type. Registra el nombre completo y el nombre
 *  sin el código PMO, para que los REQ (que no traen el código) también hagan match. Solo valores no vacíos. */
export function buildBenefitTypeMap(iniItems: MondayItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const it of iniItems) {
    const bt = colText(it.column_values, INI_LOOKUP_COL.benefitType).trim();
    if (!bt) continue;
    const full = normName(it.name);
    if (!map.has(full)) map.set(full, bt);
    const stripped = normName(stripIniCode(it.name));
    if (stripped && !map.has(stripped)) map.set(stripped, bt);
  }
  return map;
}

/** Resuelve el Benefit Type por nombre: exacto (incluye nombre sin código PMO) o el nombre de la
 *  Iniciativa seguido de un sufijo tipo " - DTT" / " (FOCO)". "" si no hay match. */
export function lookupBenefitType(name: string, map: Map<string, string>): string {
  if (!name) return "";
  const key = normName(name);
  if (map.has(key)) return map.get(key)!;
  for (const [k, v] of map) {
    if (k.length > 6 && key.startsWith(k) && /^\s*[-(|]/.test(key.slice(k.length))) return v;
  }
  return "";
}

/** Lookup de Estrategia, Sponsor y CKU desde el board de Iniciativas, indexado por nombre normalizado.
 *  El Sponsor/CKU (email) se resuelve a nombre con el Directorio RH; si no hay match se deja el valor.
 *  El CKU se lee por TÍTULO de columna ("CKU"). */
export function buildIniLookup(
  iniItems: MondayItem[],
  hrItems: MondayItem[] = [],
): Map<string, IniLookupVal> {
  const emailToName = buildEmailNameMap(hrItems);
  const resolveName = (v: string) => emailToName.get(v.trim().toLowerCase()) ?? v;
  const map = new Map<string, IniLookupVal>();
  for (const it of iniItems) {
    map.set(normName(it.name), {
      estrategia: colDisplay(it.column_values, INI_LOOKUP_COL.estrategia),
      sponsor:    resolveName(colDisplay(it.column_values, INI_LOOKUP_COL.sponsor)),
      cku:        resolveName(colByTitleAny(it.column_values, "CKU")),
      benefitType: colText(it.column_values, INI_LOOKUP_COL.benefitType).trim(),
    });
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────
// ESTRATEGIA 🔝 (Unidad de Negocio / País por estrategia)
// ─────────────────────────────────────────────────────────────────────
export const EST_COLS = { uNeg: "text_mkx5ehzc", pais: "text_mkx5fa5a", sponsor: "multiple_person_mkz54zk0" };

/** Mapa nombre-normalizado de Estrategia → { U Neg, País, Sponsor } desde "Estrategia 🔝".
 *  El Sponsor viene como email → se resuelve a nombre con el Directorio RH (fallback al valor). */
export function buildEstrategiaMap(estItems: MondayItem[], hrItems: MondayItem[] = []): Map<string, EstrategiaInfo> {
  const emailToName = buildEmailNameMap(hrItems);
  const resolveName = (v: string) => emailToName.get(v.trim().toLowerCase()) ?? v;
  const map = new Map<string, EstrategiaInfo>();
  for (const it of estItems) {
    map.set(normName(it.name), {
      uNeg: colText(it.column_values, EST_COLS.uNeg).trim(),
      pais: colText(it.column_values, EST_COLS.pais).trim(),
      sponsor: resolveName(colText(it.column_values, EST_COLS.sponsor).trim()),
    });
  }
  return map;
}

/** Resuelve U Neg/País a partir del nombre de una estrategia (match por nombre normalizado). */
export function lookupEstrategia(
  map: Map<string, EstrategiaInfo>,
  estrategiaName: string,
): EstrategiaInfo | undefined {
  return estrategiaName ? map.get(normName(estrategiaName)) : undefined;
}

/** Asigna a cada board su PM = Resp (o PM, o Responsible) del primer item, y la Estrategia/
 *  Sponsor/CKU de su Iniciativa. El primer item ("Kick Off Project Meeting") es intencional:
 *  es el step que lidera el PM asignado al proyecto; los checkpoints de Aprobación/Revisión
 *  (VPA Validado/Aprobado, Cierre VMO, etc.) los aprueba PMO y NO identifican al PM. "Responsible"
 *  (board_relation) es el último fallback: en algunos boards el Kick Off trae el PM ahí en vez
 *  de en "Resp"/"PM". Si ninguna de las tres viene cargada, el board queda sin PM (vacío en
 *  Monday, no un bug del código). */
// Alias explícito board.id → nombre de Iniciativa, para boards cuyo nombre no matchea ni
// por igualdad ni por prefijo (renombrados sin actualizar la Iniciativa, código "PM-XXX"
// pegado sin "|", o abreviado — ej. "A&O NEW" vs "Air & Ocean"). Confirmado manualmente:
// son la misma iniciativa que la Iniciativa referenciada, solo que el nombre del board o
// de la Iniciativa se desvió de la convención "PM-XXX | Nombre" ↔ "Nombre".
const BOARD_INI_ALIAS_BY_ID: Record<string, string> = {
  "18416191689": "PM-011 | ROAD 🚛",  // PM-011 | ROAD 🚛 (viejo) — la Iniciativa quedó con el código pegado al nombre
  "18427419145": "PM-011 | ROAD 🚛",  // PM-011 | ROAD NEW🚛
  "18427447179": "Air & Ocean",        // PM-010 | A&O NEW ✈️🚢
  "18427168172": "DUCAfast Regional",  // PM-012 DUCAfast Reg⚡
};

export function projEnrichBoards(
  boards: { id: string; name: string }[],
  projData: ProjItem[],
  iniLookup: Map<string, IniLookupVal> = new Map(),
): ProjBoard[] {
  const boardResp: Record<string, string> = {};
  projData.forEach((item) => {
    if (!(item.boardId in boardResp)) boardResp[item.boardId] = item.resp || item.pm || item.responsible || "";
  });
  return boards.map((b) => {
    const key = normName(stripPmPrefix(b.name));
    // Match exacto; si no, fallback por prefijo (ej. "Producto Terrestre MX" → "Producto Terrestre").
    let ini = iniLookup.get(key);
    if (!ini) {
      for (const [iniKey, val] of iniLookup) {
        if (iniKey.length > 4 && key.startsWith(iniKey)) { ini = val; break; }
      }
    }
    if (!ini && BOARD_INI_ALIAS_BY_ID[b.id]) {
      ini = iniLookup.get(normName(BOARD_INI_ALIAS_BY_ID[b.id]));
    }
    // Excepción única: el Sponsor de "DUCAfast SV" siempre es Javier Claros.
    const sponsor = key.includes("ducafast sv") ? "Javier Claros" : (ini?.sponsor || "");
    return { ...b, pm: boardResp[b.id] || "", estrategia: ini?.estrategia || "", sponsor, cku: ini?.cku || "", benefitType: ini?.benefitType || "" };
  });
}
