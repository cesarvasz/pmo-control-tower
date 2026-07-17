// src/lib/dashboard.ts
// Agregados del Control Tower: salud por board y métricas por PM (EVM propio,
// NPS, % de entregas, costo/beneficio y KPI ponderado). Funciones PURAS sobre
// datos ya procesados (ini/req/proj), reutilizables y testeables.

import { calcIniPMHealth } from "@/lib/ini";
import { healthStatusFromIndex, type HealthStatus } from "@/lib/health";
import { calcBoardMetrics, deriveBoardHealth, type BoardHealthData } from "@/lib/proj";
import { REQ_ACTIVE_GRUPOS } from "@/lib/req";
import { calcNpsFromRecords } from "@/lib/nps";
import { computeKpi } from "@/lib/kpi";
import type {
  CalMap, IniItem, NpsRecord, ProjBoard, ProjItem, ProjItemBaseline, ReqItem,
} from "@/types";

// Fases REQ de la 2 en adelante (Aprobación → Cierre ROI), para sumar costo/beneficio.
export const REQ_PHASE2PLUS = new Set(["Aprobación", "Desarrollo", "Operación", "Cierre ROI"]);
// REQ que ya pasaron la fase 2 → su valor es "Confirmación"; si siguen en fase 2, "Aprobación".
export const REQ_PASSED_PHASE2 = new Set(["Desarrollo", "Operación", "Cierre ROI"]);

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Value Gate (BC) FIRMADO en cualquier fase: cubre el de Aprobación
 *  ("Firmado y aprobado") y el de Launch ("Actualizado y firmado"). */
export const isValueGateSigned = (name: string) => {
  const n = norm(name);
  return n.includes("value gate") && n.includes("firmado");
};

// ── Costo/beneficio por PM ───────────────────────────────────────────────
export interface PmValueItem { name: string; cost: number; benefit: number; confirmed: boolean }
export interface PmValue {
  totalCost: number; totalBenefit: number;
  aprobCost: number; aprobBenefit: number;       // Aprobación: REQ en fase 2 + proyectos con solo gate Aprobación
  confirmCost: number; confirmBenefit: number;   // Confirmación: REQ que pasó fase 2 + proyectos con gate Launch firmado
  detail: {
    reqs: PmValueItem[];
    projects: PmValueItem[];
  };
}

/** Mapa boardId → salud (EV/PV/AC + VEM) de cada board de Proyectos. */
export function buildBoardHealthMap(
  proj: ProjItem[],
  projBoards: { id: string }[],
  projItemBaselines: Record<string, ProjItemBaseline> = {},
): Map<string, BoardHealthData> {
  const map = new Map<string, BoardHealthData>();
  projBoards.forEach((b) => {
    map.set(b.id, deriveBoardHealth(calcBoardMetrics(proj.filter((r) => r.boardId === b.id), projItemBaselines)));
  });
  return map;
}

/** Estado general de un PM = peor estado entre Iniciativas, REQ y Proyectos. */
export function pmWorstStatus(
  pm: string,
  ini: IniItem[],
  req: ReqItem[],
  projBoards: ProjBoard[],
  boardHealthMap: Map<string, BoardHealthData>,
  calMap: CalMap,
): HealthStatus {
  const iniHealth = calcIniPMHealth(pm, ini, calMap);
  const iniStatus: HealthStatus | null = iniHealth.total > 0
    ? (iniHealth.offTrack > 0 ? "off-track" : iniHealth.inRisk > 0 ? "in-risk" : "on-track")
    : null;

  const reqVemItems = req.filter(
    (r) => r.pm === pm && r.estado !== "CERRADO" && REQ_ACTIVE_GRUPOS.has(r.grupo) && r.vem != null,
  );
  const reqSts = reqVemItems.map((r) => healthStatusFromIndex(r.vem as number));
  const reqStatus: HealthStatus | null = reqSts.includes("off-track") ? "off-track"
    : reqSts.includes("in-risk") ? "in-risk" : reqSts.length ? "on-track" : null;

  const pmBoards = projBoards.filter((b) => b.pm === pm && boardHealthMap.get(b.id)?.healthStatus != null);
  const projStatus: HealthStatus | null = pmBoards.length
    ? (pmBoards.some((b) => boardHealthMap.get(b.id)?.healthStatus === "off-track") ? "off-track"
      : pmBoards.some((b) => boardHealthMap.get(b.id)?.healthStatus === "in-risk") ? "in-risk"
      : "on-track")
    : null;

  const all = [iniStatus, reqStatus, projStatus];
  return all.includes("off-track") ? "off-track" : all.includes("in-risk") ? "in-risk" : "on-track";
}

/** Costo/beneficio por PM en dos columnas: Aprobación (en fase 2 / gate Aprobación)
 *  y Confirmación (REQ que pasó fase 2 / proyecto con Value Gate de Launch firmado). */
export function calcPmValue(pm: string, req: ReqItem[], proj: ProjItem[], projBoards: ProjBoard[], hardOnly = false): PmValue {
  const reqItems = req.filter((r) => r.pm === pm && REQ_PHASE2PLUS.has(r.grupo) && (!hardOnly || r.benefitType === "HardSaving"));
  const hardBoardIds = new Set(projBoards.filter((b) => b.benefitType === "HardSaving").map((b) => b.id));
  const reqCost    = reqItems.reduce((s, r) => s + r.costRH + r.costSft, 0);
  const reqBenefit = reqItems.reduce((s, r) => s + r.benefit, 0);
  // REQ que pasaron fase 2 → Confirmación; los que siguen en fase 2 → Aprobación.
  const reqDetail = reqItems.map((r) => ({
    name: r.name, cost: r.costRH + r.costSft, benefit: r.benefit,
    confirmed: REQ_PASSED_PHASE2.has(r.grupo),
  }));
  const reqAprobCost      = reqDetail.filter((r) => !r.confirmed).reduce((s, r) => s + r.cost, 0);
  const reqAprobBenefit   = reqDetail.filter((r) => !r.confirmed).reduce((s, r) => s + r.benefit, 0);
  const reqConfirmCost    = reqDetail.filter((r) => r.confirmed).reduce((s, r) => s + r.cost, 0);
  const reqConfirmBenefit = reqDetail.filter((r) => r.confirmed).reduce((s, r) => s + r.benefit, 0);

  const pmBoardIds = new Set(projBoards.filter((b) => b.pm === pm).map((b) => b.id));
  const agg = new Map<string, { name: string; cost: number; benefit: number; doneAprob: boolean; doneLaunch: boolean }>();
  for (const r of proj) {
    if (!pmBoardIds.has(r.boardId)) continue;
    if (hardOnly && !hardBoardIds.has(r.boardId)) continue;
    let a = agg.get(r.boardId);
    if (!a) { a = { name: r.boardName, cost: 0, benefit: 0, doneAprob: false, doneLaunch: false }; agg.set(r.boardId, a); }
    a.cost += r.cost;
    a.benefit += r.benefit;
    if (r.status === "Done" && isValueGateSigned(r.name)) {
      const g = norm(r.grupo);
      if (g.includes("aprobacion")) a.doneAprob = true;
      if (g.includes("launch")) a.doneLaunch = true;
    }
  }
  const boards = [...agg.values()];
  // Proyectos: aprob-only = solo Value Gate Aprobación; confirmado = también Launch firmado.
  const aprob = boards.filter((b) => b.doneAprob && !b.doneLaunch);
  const ambos = boards.filter((b) => b.doneAprob && b.doneLaunch);
  const aprobCost    = aprob.reduce((s, b) => s + b.cost, 0);
  const aprobBenefit = aprob.reduce((s, b) => s + b.benefit, 0);
  const ambosCost    = ambos.reduce((s, b) => s + b.cost, 0);
  const ambosBenefit = ambos.reduce((s, b) => s + b.benefit, 0);

  const detail = {
    reqs: reqDetail,
    projects: boards
      .filter((b) => b.doneAprob) // solo los que cuentan (aprob-only o confirmados)
      .map((b) => ({ name: b.name, cost: b.cost, benefit: b.benefit, confirmed: b.doneAprob && b.doneLaunch })),
  };

  return {
    totalCost: reqCost + aprobCost + ambosCost,
    totalBenefit: reqBenefit + aprobBenefit + ambosBenefit,
    aprobCost: reqAprobCost + aprobCost,
    aprobBenefit: reqAprobBenefit + aprobBenefit,
    confirmCost: reqConfirmCost + ambosCost,
    confirmBenefit: reqConfirmBenefit + ambosBenefit,
    detail,
  };
}

// Métricas de resumen de un PM para el scoreboard (mismas fórmulas que la tarjeta de PM):
// EVM propio, NPS propio, % de entregas, beneficio HardSaving confirmado y KPI ponderado.
export function calcPmMetrics(
  pm: string, ini: IniItem[], req: ReqItem[], proj: ProjItem[], projBoards: ProjBoard[],
  boardHealthMap: Map<string, BoardHealthData>, calMap: CalMap, npsRecords: NpsRecord[],
) {
  const iniHealth = calcIniPMHealth(pm, ini, calMap);

  const reqVemItems = req.filter((r) => r.pm === pm && r.estado !== "CERRADO" && REQ_ACTIVE_GRUPOS.has(r.grupo) && r.vem != null);
  const reqAvgVem = reqVemItems.length ? reqVemItems.reduce((s, r) => s + (r.vem as number), 0) / reqVemItems.length : null;

  const pmProjBoards = projBoards.filter((b) => b.pm === pm && boardHealthMap.get(b.id)?.healthStatus !== null);
  const pmProjHIs = pmProjBoards.map((b) => boardHealthMap.get(b.id)?.healthIndex).filter((v): v is number => v != null);
  const pmProjAvgHI = pmProjHIs.length > 0 ? pmProjHIs.reduce((a, b) => a + b, 0) / pmProjHIs.length : null;

  const evmParts = ([iniHealth.index, reqAvgVem, pmProjAvgHI] as (number | null)[]).filter((v): v is number => v != null);
  const evmRaw = evmParts.length > 0 ? evmParts.reduce((a, b) => a + b, 0) / evmParts.length : null;
  const evmPct = evmRaw !== null ? Math.round(evmRaw * 100) : null;

  const nps = calcNpsFromRecords(npsRecords, pm);

  const pmBoardIdSet = new Set(projBoards.filter((b) => b.pm === pm).map((b) => b.id));
  let entOn = 0, entLate = 0;
  for (const r of req) {
    if (r.pm !== pm) continue;
    if (r.onTime.verdict === "on-time") entOn++; else if (r.onTime.verdict === "late") entLate++;
  }
  for (const p of proj) {
    if (!pmBoardIdSet.has(p.boardId)) continue;
    if (p.entrega === "on-time") entOn++; else if (p.entrega === "late") entLate++;
    for (const s of p.subitems) {
      if (s.entrega === "on-time") entOn++; else if (s.entrega === "late") entLate++;
    }
  }
  const entTotal = entOn + entLate;
  const entPct = entTotal > 0 ? Math.round((entOn / entTotal) * 100) : null;

  const pmValueAll = calcPmValue(pm, req, proj, projBoards, false);
  const pmValueHard = calcPmValue(pm, req, proj, projBoards, true);
  const benefit = pmValueHard.confirmBenefit;

  const kpi = computeKpi({ evm: evmRaw, nps: nps.nps, benefit, entregasPct: entPct });
  const health = pmWorstStatus(pm, ini, req, projBoards, boardHealthMap, calMap);

  return { pm, evmRaw, evmPct, nps, entOn, entLate, entTotal, entPct, benefit, pmValueAll, pmValueHard, kpi, kpiPct: Math.round(kpi.score), health };
}
