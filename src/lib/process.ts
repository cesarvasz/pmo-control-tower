// src/lib/process.ts
// Lógica de negocio extraída del PMO Dashboard original.
// Funciones PURAS: reciben items crudos de Monday y devuelven datos procesados.
// Se ejecutan en el cliente (DataContext) para usar la zona horaria del usuario.

import {
  addBusinessDays,
  businessDays,
  isToday,
  parseCreation,
  parseYMD,
  today,
} from "@/lib/business";
import type {
  CalMap,
  CalMeetingRaw,
  IniItem,
  MondayColumnValue,
  MondayItem,
  NpsData,
  NpsResponse,
  ProjItem,
  ProjItemBaseline,
  ReqBaseline,
  ReqItem,
  ReqPhaseInfo,
  SheetRow,
} from "@/types";

// helper: lee el texto de una columna por id
const colText = (cvs: MondayColumnValue[], id: string): string =>
  cvs.find((c) => c.id === id)?.text ?? "";
// helper: lee el texto de una columna por TÍTULO (boards de Proyectos)
const colByTitle = (cvs: MondayColumnValue[], title: string): string =>
  cvs.find((c) => (c.column?.title ?? "") === title)?.text ?? "";

// ─────────────────────────────────────────────────────────────────────
// INICIATIVAS
// ─────────────────────────────────────────────────────────────────────
export const INI_LIMITS: Record<string, number> = { New: 5, "Meeting 1": 10 };
export const INI_APPROVED = new Set(["PM Aprobado", "REQ Aprobado"]);
export const INI_SKIP = new Set(["Meeting 2"]);
export const INI_SEC_ORDER = ["New", "Meeting 1", "PM Aprobado", "REQ Aprobado", "Sin Valor Def"];
export const INI_SEC_LABEL: Record<string, string> = {
  New: "Meeting 1",
  "Meeting 1": "Meeting 2",
  "PM Aprobado": "PM Aprobado",
  "REQ Aprobado": "REQ Aprobado",
  "Sin Valor Def": "En Espera +Info CKU",
};
export const INI_ACTIVE_STS = new Set(["New", "Meeting 1"]);

const INI_COL = {
  status: "color_mm3a94fr",
  id: "pulse_id_mm3atas7",
  pm: "multiple_person_mm3akwgd",
  benefit: "numeric_mm3ajaxp",
  creRaw: "pulse_log_mm3a84me",
  meet1: "date_mm3aas3p",
  meet2: "date_mm3at176",
  espera: "date_mm3gw8yy",
  planFuturo: "date_mm40dvyn",
};

export function iniProcess(items: MondayItem[]): IniItem[] {
  const t = today();
  return items
    .map((item): IniItem | null => {
      const col = (id: string) => colText(item.column_values, id);
      const status = col(INI_COL.status);
      const id_ini = col(INI_COL.id);
      const pm = col(INI_COL.pm);
      const benefit = col(INI_COL.benefit);
      const creRaw = col(INI_COL.creRaw);
      const grupo = item.group.title;
      const meet1 = col(INI_COL.meet1);
      const meet2 = col(INI_COL.meet2);

      if (INI_APPROVED.has(status)) {
        return {
          id: id_ini, name: item.name, grupo, pm, status, benefit,
          estado: "APROBADA", dias: null, limite: null, deadline: null,
          creacion: parseCreation(creRaw), meet1, meet2,
        };
      }
      if (status === "Sin Valor Def") {
        return {
          id: id_ini, name: item.name, grupo, pm, status, benefit,
          estado: "EN_ESPERA", dias: null, limite: null, deadline: null,
          creacion: parseCreation(creRaw), espera: col(INI_COL.espera), meet1, meet2,
        };
      }
      if (INI_SKIP.has(status) || !status) {
        return {
          id: id_ini, name: item.name, grupo, pm, status, benefit,
          estado: "SKIP", dias: null, limite: null, deadline: null, creacion: null,
        };
      }
      if (status === "Plan Futuro") {
        const planFuturo = parseYMD(col(INI_COL.planFuturo));
        const recordatorio = planFuturo ? addBusinessDays(planFuturo, -5) : null;
        return {
          id: id_ini, name: item.name, grupo, pm, status, benefit,
          estado: "PLAN_FUTURO", dias: null, limite: null, deadline: null,
          creacion: parseCreation(creRaw), planFuturo, recordatorio, meet1, meet2,
        };
      }
      if (INI_LIMITS[status] !== undefined) {
        const limite = INI_LIMITS[status];
        let dias: number | null = null, estado = "Sin fecha";
        let deadline: Date | null = null, creacion: Date | null = null;
        const cre = parseCreation(creRaw);
        if (cre) {
          creacion = cre;
          dias = businessDays(cre, t);
          estado = dias > limite ? "ATRASADO" : dias === limite ? "PARA HOY" : "EN TIEMPO";
          deadline = addBusinessDays(cre, limite);
        }
        return {
          id: id_ini, name: item.name, grupo, pm, status, benefit,
          estado, dias, limite, deadline, creacion, meet1, meet2,
        };
      }
      return null;
    })
    .filter((x): x is IniItem => x !== null);
}

// ─────────────────────────────────────────────────────────────────────
// REQ (Requerimientos VALOR Lite)
// ─────────────────────────────────────────────────────────────────────
export const REQ_COLS = {
  id: "pulse_id_mm3fs4r8",
  pm: "multiple_person_mm3gq5vr",
  resp: "multiple_person_mkvdkw7j",
  status: "status",
  cpmStart: "timeline9",
  estDev: "date_mm3gqxw0",
  costRH: "labor_budget_spent",
  costSoft: "numeric_mm3gbavc",
  benefit: "numeric_mkvcd6nf",
  creation: "pulse_log_mkvyjb6s",
  tld: "dropdown_mm3gpacy",
  type: "dropdown_mm3sms28",
  cpmEndEst: "date_mkwcqzvf",
  vDone: "date_mm3ggd8v",
  aDone: "date_mm3gfn1r",
  lDone: "date_mm3g8mqz",
  oDone: "date_mm3g5j38",
};

export const REQ_GROUP_LABEL: Record<string, string> = {
  "Valuación | Req Terminado": "Valuación",
  "Aprobación | Value Gate": "Aprobación",
  "Launch | Desarrollo": "Desarrollo",
  "Operación | Implementación": "Operación",
  "Revisión | Cierre ROI": "Cierre ROI",
  "REQ Cerrados": "Cerrados",
  "En espera +Info CKU": "En Espera",
};

export const REQ_GROUP_COLOR: Record<string, string> = {
  "Valuación": "#6c63ff",
  "Aprobación": "#3b82f6",
  "Desarrollo": "#f59e0b",
  "Operación": "#10b981",
  "Cierre ROI": "#14b8a6",
  "Cerrados": "#9ca3af",
  "En Espera": "#ef4444",
};

export const REQ_PIPELINE = ["Valuación", "Aprobación", "Desarrollo", "Operación", "Cierre ROI", "Cerrados", "En Espera"];
export const REQ_ACTIVE_GRUPOS = new Set(["Valuación", "Aprobación", "Desarrollo", "Operación", "Cierre ROI"]);

export function reqProcess(items: MondayItem[], baselines: Record<string, ReqBaseline> = {}): ReqItem[] {
  const t = today();

  return items.map((item): ReqItem => {
    const col = (id: string) => colText(item.column_values, id);
    const grpFull = item.group.title;
    const grp = REQ_GROUP_LABEL[grpFull] || grpFull;
    const costRH = parseFloat(col(REQ_COLS.costRH)) || 0;
    const costSft = parseFloat(col(REQ_COLS.costSoft)) || 0;
    const benefit = parseFloat(col(REQ_COLS.benefit)) || 0;
    const tld = col(REQ_COLS.tld);

    const cpmStart = parseYMD(col(REQ_COLS.cpmStart).split(" - ")[0]);
    const vDone = parseYMD(col(REQ_COLS.vDone));
    const aDone = parseYMD(col(REQ_COLS.aDone));
    const lDone = parseYMD(col(REQ_COLS.lDone));
    const oDone = parseYMD(col(REQ_COLS.oDone));
    const estDev = parseYMD(col(REQ_COLS.estDev));
    const type = col(REQ_COLS.type);
    const cpmEndEst = parseYMD(col(REQ_COLS.cpmEndEst));
    const isSaas = type === "SaaS";

    // ── Deadline por grupo ──
    let startDate: Date | null = null;
    let deadline: Date | null = null;

    if (grp === "Valuación") {
      startDate = cpmStart;
      if (startDate) deadline = addBusinessDays(startDate, 1);
    } else if (grp === "Aprobación") {
      startDate = vDone;
      if (startDate) deadline = addBusinessDays(startDate, 2);
    } else if (grp === "Desarrollo") {
      startDate = aDone;
      if (startDate) {
        if (estDev) deadline = estDev;
        else if (tld === "JA") deadline = addBusinessDays(startDate, 7);
        else if (tld === "LM") deadline = addBusinessDays(startDate, 32);
        else if (tld === "S/dev") deadline = new Date(startDate);
      }
    } else if (grp === "Operación") {
      startDate = lDone;
      if (isSaas && cpmEndEst) deadline = addBusinessDays(cpmEndEst, -20);
      else if (startDate) deadline = addBusinessDays(startDate, 3);
    } else if (grp === "Cierre ROI") {
      startDate = oDone;
      if (isSaas && cpmEndEst) deadline = cpmEndEst;
      else if (startDate) deadline = addBusinessDays(startDate, 20);
    }

    // ── Estado ──
    let estado = grp === "Cerrados" ? "CERRADO" : grp === "En Espera" ? "EN_ESPERA" : "EN PROCESO";
    let dias: number | null = null, limite: number | null = null;

    if (deadline && REQ_ACTIVE_GRUPOS.has(grp)) {
      const dl = new Date(deadline); dl.setHours(0, 0, 0, 0);
      estado = dl < t ? "ATRASADO" : dl.getTime() === t.getTime() ? "PARA HOY" : "EN TIEMPO";
      if (startDate) {
        dias = businessDays(startDate, t);
        limite = businessDays(startDate, deadline);
      }
    }

    const status = col(REQ_COLS.status);

    // ── Costo por fase ──
    // Costo planificado (baseline) → EV.  Costo actual (Monday) → AC.
    // Si no hay baseline aún (costSft no resuelto), EV = AC.
    const REQ_PHASES = ["Valuación", "Aprobación", "Desarrollo", "Operación", "Cierre ROI"];
    const KNOWN_HOURS = 23;
    const costTotal = costRH + costSft;

    const baseline = baselines[col(REQ_COLS.id)];
    const baseCostRH  = baseline?.costRH  ?? costRH;
    const baseCostSft = baseline?.costSft ?? costSft;
    const baseCostTotal = baseCostRH + baseCostSft;

    // Costo planificado por fase (para EV)
    const baseRate = baseCostRH / KNOWN_HOURS;
    const basePhaseCost: Record<string, number> = {
      "Valuación":  baseRate * 3,
      "Aprobación": baseRate * 4,
      "Desarrollo": baseCostTotal - baseRate * KNOWN_HOURS,
      "Operación":  baseRate * 4,
      "Cierre ROI": baseRate * 12,
    };

    // Costo actual por fase (para AC y PV)
    const rate = costRH / KNOWN_HOURS;
    const phaseCost: Record<string, number> = {
      "Valuación":  rate * 3,
      "Aprobación": rate * 4,
      "Desarrollo": costTotal - rate * KNOWN_HOURS,
      "Operación":  rate * 4,
      "Cierre ROI": rate * 12,
    };

    // ── Fases completadas (por fechas Done; F5 por status "ROI 30D") ──
    const phaseDone: Record<string, boolean> = {
      "Valuación":  !!vDone,
      "Aprobación": !!aDone,
      "Desarrollo": !!lDone,
      "Operación":  !!oDone,
      "Cierre ROI": status === "ROI 30D",
    };
    const doneCount = REQ_PHASES.filter((p) => phaseDone[p]).length;

    // ── Cronograma en días (para PV y timeline) ──
    const devDays0 = tld === "LM" ? 32 : tld === "S/dev" ? 0 : 7;
    const phaseDurs0 = [1, 2, devDays0, 3, 20];
    const PHASE_IDX: Record<string, number> = {
      "Valuación": 0, "Aprobación": 1, "Desarrollo": 2, "Operación": 3, "Cierre ROI": 4,
    };
    const phaseIdx = PHASE_IDX[grp] ?? -1;
    const expectedDays = phaseIdx >= 0
      ? phaseDurs0.slice(0, phaseIdx + 1).reduce((a, b) => a + b, 0)
      : null;
    const elapsed = cpmStart ? businessDays(cpmStart, t) : 0;

    // ── EV / PV / AC + desglose por fase ──
    // EV = Σ basePhaseCost de fases completadas (costo planificado).
    // PV = EV + phaseCost[fase actual] si está atrasada (costo actual).
    // AC = Σ phaseCost de fases completadas (costo actual de Monday).
    const phases: ReqPhaseInfo[] = REQ_PHASES.map((p, i) => ({
      name: p, cost: phaseCost[p], durDays: phaseDurs0[i], done: phaseDone[p], inPv: false,
    }));
    const ev = REQ_PHASES.reduce((s, p) => s + (phaseDone[p] ? basePhaseCost[p] : 0), 0);
    const ac = REQ_PHASES.reduce((s, p) => s + (phaseDone[p] ? phaseCost[p] : 0), 0);
    const pv = ev + (estado === "ATRASADO" && !phaseDone[grp] ? phaseCost[grp] ?? 0 : 0);

    // ── SPI / CPI / Scope / VEM ──
    let spi: number | null = null, cpi: number | null = null, scope: number | null = null;
    if (REQ_ACTIVE_GRUPOS.has(grp)) {
      spi = pv > 0 ? Math.round((ev / pv) * 100) / 100 : 1;
      cpi = ac > 0 ? Math.round((ev / ac) * 100) / 100 : 1;
      scope = doneCount / 5;
    }
    const vemRaw = calcVem(spi, cpi, scope);
    const vem = vemRaw !== null ? Math.round(vemRaw * 100) / 100 : null;

    return {
      id: col(REQ_COLS.id),
      name: item.name,
      grupo: grp,
      pm: col(REQ_COLS.pm),
      resp: col(REQ_COLS.resp),
      status,
      costRH, costSft, benefit,
      valueNet: benefit - costRH - costSft,
      tld, type, cpmEndEst,
      creation: col(REQ_COLS.creation),
      estado, deadline, inicioReq: cpmStart, inicio: startDate, dias, limite,
      elapsed: cpmStart ? elapsed : null,
      expectedDays: REQ_ACTIVE_GRUPOS.has(grp) ? expectedDays : null,
      estDev,
      phases,
      ev, pv, ac,
      spi, cpi, scope, vem,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────
// PROYECTOS (multi-board)
// ─────────────────────────────────────────────────────────────────────
export const PROJ_ACTIVE_STS = new Set(["Working on it", "Future Steps", "Done"]);

export const PROJ_COL = {
  pm: "PM", resp: "Resp", status: "Status",
  deadline: "Limit Date", cost: "Cost $", benefit: "Benefit $",
};

function calcProjEstado(dl: Date | null): string {
  const t = today();
  if (!dl) return "ATRASADO";
  return dl < t ? "ATRASADO" : dl.getTime() === t.getTime() ? "PARA HOY" : "EN TIEMPO";
}

export function projProcess(boardName: string, boardId: string, items: MondayItem[]): ProjItem[] {
  return items.map((item): ProjItem => {
    const cv = item.column_values || [];
    const pm = colByTitle(cv, PROJ_COL.pm);
    const resp = colByTitle(cv, PROJ_COL.resp);
    const status = colByTitle(cv, PROJ_COL.status);
    const deadline = parseYMD(colByTitle(cv, PROJ_COL.deadline));
    const cost = parseFloat(colByTitle(cv, PROJ_COL.cost)) || 0;
    const benefit = parseFloat(colByTitle(cv, PROJ_COL.benefit)) || 0;
    const estado = calcProjEstado(deadline);

    const subitems = (item.subitems || []).map((sub) => {
      const scv = sub.column_values || [];
      const sdl = parseYMD(colByTitle(scv, PROJ_COL.deadline));
      return {
        id: sub.id, name: sub.name,
        status: colByTitle(scv, PROJ_COL.status),
        person: "",
        deadline: sdl, estado: calcProjEstado(sdl),
        cost: parseFloat(colByTitle(scv, PROJ_COL.cost)) || 0,
        benefit: parseFloat(colByTitle(scv, PROJ_COL.benefit)) || 0,
      };
    });

    return {
      boardId, boardName, id: item.id, name: item.name,
      grupo: item.group?.title || "",
      pm, resp, status, deadline, cost, benefit,
      valueNet: benefit - cost, estado, subitems,
    };
  });
}

export type HealthStatus = "on-track" | "in-risk" | "off-track";

export interface BoardHealthData {
  ev: number; pv: number; ac: number; scope: number | null;
  spi: number | null; cpi: number | null;
  healthIndex: number | null;
  healthStatus: HealthStatus | null;
}

// ─────────────────────────────────────────────────────────────────────
// VEM — FUENTE ÚNICA DE VERDAD (fórmula + umbrales + config visual)
// Todo cálculo de VEM/salud DEBE pasar por aquí para que los cambios
// se propaguen en cascada a todas las páginas y tarjetas.
// ─────────────────────────────────────────────────────────────────────

/** Umbrales de salud sobre el índice VEM (0–1). */
export const VEM_THRESHOLDS = { onTrack: 0.95, inRisk: 0.85 } as const;

/** VEM = promedio de SPI, CPI y Scope (todos en fracción 0–1). null si falta alguno. */
export function calcVem(spi: number | null, cpi: number | null, scope01: number | null): number | null {
  if (spi === null || cpi === null || scope01 === null) return null;
  return (spi + cpi + scope01) / 3;
}

/** Deriva el estado de salud a partir de un índice VEM (0–1). */
export function healthStatusFromIndex(index: number | null): HealthStatus | null {
  if (index === null) return null;
  return index >= VEM_THRESHOLDS.onTrack ? "on-track"
       : index >= VEM_THRESHOLDS.inRisk  ? "in-risk"
       : "off-track";
}

/** Config visual por estado de salud (color, fondo, wording, icono). */
export const HEALTH_CFG: Record<HealthStatus, { color: string; bg: string; label: string; icon: string }> = {
  "on-track":  { color: "#10b981", bg: "var(--health-on-track-bg)",  label: "On Track",  icon: "✓" },
  "in-risk":   { color: "#f59e0b", bg: "var(--health-in-risk-bg)",   label: "In Risk",   icon: "⚠" },
  "off-track": { color: "#ef4444", bg: "var(--health-off-track-bg)", label: "Off Track", icon: "✕" },
};

/** Config visual a partir de un índice VEM numérico (atajo para tarjetas/pills). */
export function vemCfg(v: number) {
  return HEALTH_CFG[healthStatusFromIndex(v) ?? "off-track"];
}

const isOnTrack = (status: string, estado: string) =>
  status === "Done" || estado === "EN TIEMPO";

export function calcBoardMetrics(
  allBoardItems: ProjItem[],
  projItemBaselines: Record<string, ProjItemBaseline> = {},
): { ev: number; pv: number; ac: number; scope: number | null; spi: number | null; cpi: number | null } {
  let ev = 0, pv = 0, ac = 0;
  let onTrackCount = 0, totalCount = 0;

  for (const item of allBoardItems) {
    const isDone    = item.status === "Done";
    const isWipLate = item.status === "Working on it" && item.estado === "ATRASADO";
    // EV y PV usan el costo planificado (baseline de Firestore); si aún no hay baseline
    // se usa el costo actual de Monday como fallback.
    const baseCost = projItemBaselines[item.id]?.cost ?? item.cost;

    // Scope: items + subitems On Track / total items + subitems
    totalCount++;
    if (isOnTrack(item.status, item.estado)) onTrackCount++;
    for (const sub of item.subitems) {
      totalCount++;
      if (isOnTrack(sub.status, sub.estado)) onTrackCount++;
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
  const scope = totalCount > 0 ? (onTrackCount / totalCount) * 100 : null;

  return { ev, pv, ac, scope, spi, cpi };
}

export function deriveBoardHealth(metrics: { ev: number; pv: number; ac: number; scope: number | null; spi: number | null; cpi: number | null }): BoardHealthData {
  // scope viene en 0–100 → se normaliza a fracción 0–1 para el VEM.
  const healthIndex = calcVem(metrics.spi, metrics.cpi, metrics.scope !== null ? metrics.scope / 100 : null);
  const healthStatus = healthStatusFromIndex(healthIndex);
  return { ...metrics, healthIndex, healthStatus };
}

/** Asigna a cada board su PM = Resp (o PM) del primer item del board. */
export function projEnrichBoards(
  boards: { id: string; name: string }[],
  projData: ProjItem[]
): { id: string; name: string; pm: string }[] {
  const boardResp: Record<string, string> = {};
  projData.forEach((item) => {
    if (!(item.boardId in boardResp)) boardResp[item.boardId] = item.resp || item.pm || "";
  });
  return boards.map((b) => ({ ...b, pm: boardResp[b.id] || "" }));
}

// ─────────────────────────────────────────────────────────────────────
// CALENDARIO (Google Apps Script)
// ─────────────────────────────────────────────────────────────────────
export function buildCalMap(meetings: CalMeetingRaw[]): CalMap {
  const map: CalMap = new Map();
  for (const m of meetings) {
    if (!map.has(m.codigo)) map.set(m.codigo, { M1: [], M2: [] });
    const type = (m.meeting || "").toUpperCase();
    if (type === "M1" || type === "M2") {
      map.get(m.codigo)![type].push({ inicio: new Date(m.inicio), fin: new Date(m.fin) });
    }
  }
  for (const v of map.values()) {
    v.M1.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
    v.M2.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  }
  return map;
}

/** Próxima reunión futura, o la última pasada si no hay futuras. */
export function nextOrLatest(arr: { inicio: Date; fin: Date }[] | undefined): { inicio: Date; fin: Date } | null {
  if (!arr || arr.length === 0) return null;
  const now = new Date();
  const upcoming = arr.filter((m) => m.inicio >= now);
  return upcoming.length > 0 ? upcoming[0] : arr[arr.length - 1];
}

// ─────────────────────────────────────────────────────────────────────
// SALUD INI POR PM
// ─────────────────────────────────────────────────────────────────────
export interface IniPMHealth {
  status: "on-track" | "in-risk" | "off-track";
  index: number;
  agendadas: number;
  enTiempo: number;
  atrasadas: number;
  sinMeeting: number;
  total: number;
}

export function calcIniPMHealth(pm: string, iniData: IniItem[], calMap: CalMap): IniPMHealth {
  const items = iniData.filter((r) => r.pm === pm && INI_ACTIVE_STS.has(r.status));
  const total = items.length;
  if (total === 0) return { status: "on-track", index: 1, agendadas: 0, enTiempo: 0, atrasadas: 0, sinMeeting: 0, total: 0 };

  const hasMeeting = (r: IniItem) => {
    const cal = calMap.get(r.id) || { M1: [], M2: [] };
    return cal[r.status === "New" ? "M1" : "M2"].length > 0;
  };

  const agendadas = items.filter(hasMeeting).length;
  const enTiempo = items.filter((r) => (r.estado === "EN TIEMPO" || r.estado === "PARA HOY") && hasMeeting(r)).length;
  const atrasadas = items.filter((r) => r.estado === "ATRASADO").length;
  const sinMeeting = items.filter((r) => !hasMeeting(r)).length;

  const index = ((agendadas / total) + (enTiempo / total)) / 2;
  const status = healthStatusFromIndex(index) ?? "off-track";

  return { status, index, agendadas, enTiempo, atrasadas, sinMeeting, total };
}

/** "Para Hoy" de iniciativas: deadline calculado hoy O reunión agendada hoy. */
export function iniIsParaHoy(r: IniItem, calMap: CalMap): boolean {
  if (isToday(r.deadline)) return true;
  const cal = calMap.get(r.id) || { M1: [], M2: [] };
  const type = r.status === "New" ? "M1" : r.status === "Meeting 1" ? "M2" : null;
  if (type) {
    const m = nextOrLatest(cal[type]);
    if (m && isToday(m.inicio)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────
// NPS (encuesta PMO desde Google Forms)
// ─────────────────────────────────────────────────────────────────────

// Normaliza texto (sin acentos, minúsculas) para localizar columnas por pista.
const normCol = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Extrae el texto entre corchetes del encabezado Likert; si no hay, usa el completo.
const cleanQuestion = (key: string) => {
  const m = key.match(/\[(.+)\]/);
  return (m ? m[1] : key).trim();
};
// Escala Likert → porcentaje (20% por nivel). null si no es una respuesta Likert.
const likertPct = (value: string): number | null => {
  const v = normCol(value).trim();
  return v === "totalmente de acuerdo" ? 100
       : v === "de acuerdo" ? 80
       : v === "neutral" ? 60
       : v === "en desacuerdo" ? 40
       : v === "totalmente en desacuerdo" ? 20
       : null;
};

/**
 * NPS = (#promotores − #detractores) / total × 100.
 * Promotores = 9-10, Pasivos = 7-8, Detractores = 0-6.
 * Devuelve además cada respuesta estructurada (para el detalle).
 */
export function calcNps(rows: SheetRow[]): NpsData {
  let promoters = 0, passives = 0, detractors = 0, total = 0;
  const responses: NpsResponse[] = [];
  const qAgg = new Map<string, { sum: number; count: number }>(); // promedio por pregunta

  rows.forEach((row) => {
    const keys = Object.keys(row);
    const scoreKey  = keys.find((k) => normCol(k).includes("recomiende"));
    const tsKey     = keys.find((k) => normCol(k).includes("marca temporal"));
    const mailKey   = keys.find((k) => normCol(k).includes("correo"));
    const reasonKey = keys.find((k) => normCol(k).includes("razon"));

    const scoreRaw = scoreKey ? row[scoreKey] : undefined;
    const score = typeof scoreRaw === "number" ? scoreRaw : parseFloat(String(scoreRaw));
    const validScore = Number.isFinite(score);

    let category: NpsResponse["category"] = null;
    if (validScore) {
      total++;
      category = score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor";
      if (category === "promoter") promoters++;
      else if (category === "passive") passives++;
      else detractors++;
    }

    const metaKeys = new Set([scoreKey, tsKey, mailKey, reasonKey].filter(Boolean) as string[]);
    const answers = keys
      .filter((k) => !metaKeys.has(k) && !/^columna\s*\d+$/i.test(k.trim()))
      .map((k) => ({ question: cleanQuestion(k), value: String(row[k] ?? "").trim() }))
      .filter((a) => a.value !== "");

    // Acumula el % Likert por pregunta (escala 20% por nivel).
    answers.forEach((a) => {
      const pct = likertPct(a.value);
      if (pct === null) return;
      const agg = qAgg.get(a.question) ?? { sum: 0, count: 0 };
      agg.sum += pct; agg.count++;
      qAgg.set(a.question, agg);
    });

    responses.push({
      timestamp: tsKey ? String(row[tsKey] ?? "") : "",
      email: mailKey ? String(row[mailKey] ?? "") : "",
      score: validScore ? score : null,
      category,
      reason: reasonKey ? String(row[reasonKey] ?? "") : "",
      answers,
    });
  });

  const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null;
  const questions = [...qAgg.entries()].map(([question, { sum, count }]) => ({
    question, avg: Math.round(sum / count), count,
  }));
  const overallAvg = questions.length > 0
    ? Math.round(questions.reduce((s, q) => s + q.avg, 0) / questions.length)
    : null;

  return { nps, promoters, passives, detractors, total, responses, questions, overallAvg };
}

/** Clasificación del NPS (rangos, color y texto) — fuente única. */
export function npsCfg(nps: number | null): { color: string; label: string } | null {
  if (nps === null) return null;
  return nps >= 70 ? { color: "#43a047", label: "PMO EXCELENTE" }   // +70 a +100
       : nps >= 50 ? { color: "#2e7d32", label: "PMO BUENA" }       // +50 a +69
       : nps >= 30 ? { color: "#ef6c00", label: "PMO ACEPTABLE" }   // +30 a +49
       : nps >= 0  ? { color: "#c9a227", label: "PMO BÁSICA" }      //   0 a +29
       :             { color: "#c0392b", label: "PMO EN RIESGO" };  // -100 a -1
}
