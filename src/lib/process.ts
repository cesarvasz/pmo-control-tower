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
  ProjItem,
  ReqItem,
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

export function reqProcess(items: MondayItem[]): ReqItem[] {
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

    // ── Scope ──
    const status = col(REQ_COLS.status);
    const SCOPE_MAP: Record<string, number> = {
      "Valuación": 0, "Aprobación": 0.2, "Desarrollo": 0.4, "Operación": 0.6, "Cierre ROI": 0.8,
    };
    const scope = REQ_ACTIVE_GRUPOS.has(grp)
      ? grp === "Cierre ROI" && status === "ROI 30D" ? 1.0 : SCOPE_MAP[grp] ?? null
      : null;

    // ── SPI / CPI ──
    const FASE_PCT: Record<string, number> = {
      "Valuación": 20, "Aprobación": 20, "Desarrollo": 40, "Operación": 60, "Cierre ROI": 80,
    };
    const devDays0 = tld === "LM" ? 32 : tld === "S/dev" ? 0 : 7;
    const phaseDurs0 = [1, 2, devDays0, 3, 20];
    const totalDays = phaseDurs0.reduce((a, b) => a + b, 0);
    const PHASE_IDX: Record<string, number> = {
      "Valuación": 0, "Aprobación": 1, "Desarrollo": 2, "Operación": 3, "Cierre ROI": 4,
    };
    const phaseIdx = PHASE_IDX[grp] ?? -1;
    const expectedDays = phaseIdx >= 0
      ? phaseDurs0.slice(0, phaseIdx + 1).reduce((a, b) => a + b, 0)
      : null;

    let spi: number | null = null, cpi: number | null = null;
    if (REQ_ACTIVE_GRUPOS.has(grp)) {
      const evPct = grp === "Valuación"
        ? estado !== "ATRASADO" ? 20 : 0
        : grp === "Cierre ROI"
          ? status === "ROI 30D" ? 100 : 80
          : FASE_PCT[grp] ?? null;
      if (evPct !== null && cpmStart) {
        const phaseDurs = phaseDurs0;
        const phasePcts = [20, 20, 40, 60, 80];
        const elapsed = businessDays(cpmStart, t);
        let pvPct: number | null = null, cum = 0;
        for (let i = 0; i < 5; i++) {
          if (elapsed < cum + phaseDurs[i]) { pvPct = phasePcts[i]; break; }
          cum += phaseDurs[i];
        }
        if (pvPct === null) pvPct = 80;
        if (pvPct > 0) spi = Math.min(1, Math.round((evPct / pvPct) * 100) / 100);
        if (elapsed > 0 && totalDays > 0) {
          cpi = Math.min(1, Math.round((evPct * totalDays / (elapsed * 100)) * 100) / 100);
        }
      }
    }
    const vem = spi !== null && cpi !== null && scope !== null
      ? Math.round(((spi + cpi + scope) / 3) * 100) / 100
      : null;

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
      elapsed: cpmStart ? businessDays(cpmStart, t) : null,
      expectedDays: REQ_ACTIVE_GRUPOS.has(grp) ? expectedDays : null,
      estDev,
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

export const PROJ_PHASE_GROUPS = [
  "Valuacion | Formulacion del proyecto",
  "Aprobacion | Value Gate",
  "Launch | Desarrollo",
  "Operacion | Implementacion",
  "Revision | Cierre ROI",
];

// Normaliza un nombre de grupo para comparar sin acentos ni mayúsculas.
const normGroup = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const PROJ_PHASE_NORM = PROJ_PHASE_GROUPS.map(normGroup);

export function calcBoardMetrics(allBoardItems: ProjItem[]): { ev: number; pv: number; ac: number; scope: number | null; spi: number | null; cpi: number | null } {
  let ev = 0, pv = 0, ac = 0, scopeOn = 0, scopeTotal = 0, costTotal = 0;
  allBoardItems.forEach((r) => {
    const onTrackWip = r.status === "Working on it" && r.estado !== "ATRASADO";
    const pvWip      = r.status === "Working on it";
    if (r.status === "Done" || onTrackWip) ev += r.cost;
    if (r.status === "Done" || pvWip)      pv += r.cost;
    if (r.status === "Done")               ac += r.cost;
    costTotal += r.cost;
    scopeTotal++;
    if (r.status === "Done" || r.estado === "EN TIEMPO") scopeOn++;
    r.subitems.forEach((s) => {
      const sOnTrackWip = s.status === "Working on it" && s.estado !== "ATRASADO";
      const sPvWip      = s.status === "Working on it";
      if (s.status === "Done" || sOnTrackWip) ev += s.cost;
      if (s.status === "Done" || sPvWip)      pv += s.cost;
      if (s.status === "Done")                ac += s.cost;
      costTotal += s.cost;
      scopeTotal++;
      if (s.status === "Done" || s.estado === "EN TIEMPO") scopeOn++;
    });
  });

  // Phase-based SPI (match de grupo sin acentos ni mayúsculas)
  const gMap = new Map<string, ProjItem[]>();
  allBoardItems.forEach((r) => {
    const key = normGroup(r.grupo);
    if (!gMap.has(key)) gMap.set(key, []);
    gMap.get(key)!.push(r);
  });
  let evGroups = 0, pvGroups = 0, acCost = 0;
  PROJ_PHASE_NORM.forEach((gKey) => {
    const gItems = gMap.get(gKey);
    if (!gItems || gItems.length === 0) return;
    const all: { status: string; estado: string }[] = [];
    let gCost = 0; // costo total del grupo (incluye Future Steps de una fase ya comenzada)
    gItems.forEach((r) => {
      if (r.status !== "Future Steps") all.push({ status: r.status, estado: r.estado });
      gCost += r.cost;
      r.subitems.forEach((s) => {
        if (s.status !== "Future Steps") all.push({ status: s.status, estado: s.estado });
        gCost += s.cost;
      });
    });
    if (all.length === 0) return; // fase 100% Future Steps: no ha comenzado, no cuenta
    const allDone        = all.every((x) => x.status === "Done");
    const hasWip         = all.some((x) => x.status === "Working on it");
    const hasAtrasadoWip = all.some((x) => x.status === "Working on it" && x.estado === "ATRASADO");
    if (allDone || (hasWip && !hasAtrasadoWip)) {
      evGroups++;
      pvGroups++;
    } else if (hasWip) {
      pvGroups++;
    }
    // AC: costo de fases completadas o con WIP (las mismas que cuentan para PV)
    if (allDone || hasWip) acCost += gCost;
  });
  const spi = pvGroups > 0 ? evGroups / pvGroups : null;

  // CPI = EV(fases) / AC, donde EV(fases) = (evGroups × 20%) × costoTotal del board
  const evPhase = (evGroups * 0.2) * costTotal;
  const cpi = acCost > 0 ? Math.min(1, evPhase / acCost) : null;

  return { ev, pv, ac, scope: scopeTotal > 0 ? (scopeOn / scopeTotal) * 100 : null, spi, cpi };
}

export function deriveBoardHealth(metrics: { ev: number; pv: number; ac: number; scope: number | null; spi: number | null; cpi: number | null }): BoardHealthData {
  const spi = metrics.spi;
  const cpi = metrics.cpi;
  const healthIndex = spi !== null && cpi !== null && metrics.scope !== null
    ? (spi + cpi + metrics.scope / 100) / 3
    : null;
  const healthStatus: HealthStatus | null = healthIndex === null ? null
    : healthIndex >= 0.95 ? "on-track"
    : healthIndex >= 0.85 ? "in-risk"
    : "off-track";
  return { ...metrics, spi, cpi, healthIndex, healthStatus };
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
  const status = index >= 0.95 ? "on-track" : index >= 0.85 ? "in-risk" : "off-track";

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
