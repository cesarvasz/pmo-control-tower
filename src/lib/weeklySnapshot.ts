// src/lib/weeklySnapshot.ts
// Histórico semanal del portafolio (Control Tower) — pedido del usuario:
// "guardar un historico semanal de los datos. Cada lunes a las 8 am que se
// guarden y se tenga una vista que muestre el progreso. Tiene que ser el
// EVM, Beneficio $ Confirmado, Calidad de entregas, Entregas a tiempo y NPS".
//
// computeWeeklySnapshotMetrics() recalcula esos 5 números EXACTAMENTE igual
// que las tarjetas ya visibles en Control Tower (mismas funciones puras de
// dashboard.ts/health.ts/ini.ts/nps.ts) — no se guarda nada que no se pueda
// ver hoy mismo en pantalla. Se recalcula aparte (no se reusa el useMemo de
// page.tsx) porque ese hook mezcla estos 5 valores con muchos otros propios
// de la UI (VPA actions, boardsOffTrack, etc.) — separarlos ahí sería un
// refactor mucho más grande y riesgoso que repetir esta orquestación corta.
// El cron (api/cron/weekly-snapshot) corre esto server-side; si algún día
// cambia una fórmula en page.tsx, hay que replicar el cambio aquí también.

import { calcIniPMHealth } from "@/lib/ini";
import { buildAllProjectMetrics, boardHealthFromMetrics } from "@/lib/projectMetrics";
import { calcBoardMetrics } from "@/lib/proj";
import {
  reqStageAmounts, projStageAmounts, sumStageAmounts,
  calcEntregaStatsRaw, calcReprocesoStatsRaw, type StageAmounts,
} from "@/lib/dashboard";
import { weightedEvm } from "@/lib/health";
import { REQ_ACTIVE_GRUPOS } from "@/lib/req";
import type { DashboardData, ProjItem } from "@/types";

export interface WeeklySnapshotMetrics {
  /** EVM del equipo, 0–100 (igual que la tarjeta "Salud del equipo"). */
  evm: number | null;
  /** Beneficio $ de la etapa Confirmación, SIEMPRE HardSaving (igual que el
   *  componente "Beneficio HardSaving" del KPI — no depende del toggle "Solo
   *  HardSaving" de la tarjeta Costo &amp; Beneficio, que es solo de UI). */
  beneficioConfirmado: number;
  /** "Calidad de Entregas", 0–100 (variante real sin filtros de la tarjeta principal). */
  calidad: number | null;
  /** "Cumplimiento de Entrega" / entregas a tiempo, 0–100 (variante real sin filtros). */
  cumplimiento: number | null;
  /** NPS del equipo, -100..100. */
  nps: number | null;
}

export function computeWeeklySnapshotMetrics(data: DashboardData): WeeklySnapshotMetrics {
  const { ini, req, proj, projBoards, projItemBaselines, calMap, nps, reprocesoAttributions: reproceso } = data;

  // ── EVM del equipo: promedio ponderado Iniciativas 10% · REQ 20% · Proyectos 70% ──
  const allPMs = [...new Set([
    ...ini.filter((r) => r.pm && r.estado !== "SKIP").map((r) => r.pm),
    ...req.filter((r) => r.pm && r.estado !== "CERRADO").map((r) => r.pm),
  ])];
  const teamIniHIs = allPMs
    .map((pm) => calcIniPMHealth(pm, ini, calMap))
    .filter((h) => h.total > 0)
    .map((h) => h.index);
  const teamIniHealth = teamIniHIs.length > 0 ? teamIniHIs.reduce((a, b) => a + b, 0) / teamIniHIs.length : null;

  const reqProc = req.filter((r) => REQ_ACTIVE_GRUPOS.has(r.grupo));
  const reqVemAll = reqProc.filter((r) => r.vem != null).map((r) => r.vem as number);
  const teamReqHealth = reqVemAll.length > 0 ? reqVemAll.reduce((a, b) => a + b, 0) / reqVemAll.length : null;

  const projMetricsByBoard = new Map(
    buildAllProjectMetrics(projBoards, proj, { baselines: projItemBaselines }).map((m) => [m.boardId, m]),
  );
  const boardHealthIndexes: number[] = [];
  projBoards.forEach((b) => {
    const m = projMetricsByBoard.get(b.id);
    if (!m) return;
    const { ac } = calcBoardMetrics(proj.filter((r) => r.boardId === b.id), projItemBaselines);
    const h = boardHealthFromMetrics(m, ac);
    if (h.healthIndex != null) boardHealthIndexes.push(h.healthIndex);
  });
  const teamProjHealth = boardHealthIndexes.length > 0 ? boardHealthIndexes.reduce((a, b) => a + b, 0) / boardHealthIndexes.length : null;

  const teamVem = weightedEvm({ ini: teamIniHealth, req: teamReqHealth, proj: teamProjHealth });
  const evm = teamVem !== null ? Math.round(teamVem * 100) : null;

  // ── Beneficio $ Confirmado (HardSaving) ──
  const hardBoardIds = new Set(projBoards.filter((b) => b.benefitType === "HardSaving").map((b) => b.id));
  const kpiReqStages = req
    .filter((r) => r.benefitType === "HardSaving")
    .map(reqStageAmounts)
    .filter((s): s is StageAmounts => s != null);
  const kpiProjItemsByBoard = new Map<string, ProjItem[]>();
  for (const r of proj) {
    if (!hardBoardIds.has(r.boardId)) continue;
    const arr = kpiProjItemsByBoard.get(r.boardId);
    if (arr) arr.push(r); else kpiProjItemsByBoard.set(r.boardId, [r]);
  }
  const kpiProjStages = [...kpiProjItemsByBoard.values()]
    .map(projStageAmounts)
    .filter((s): s is StageAmounts => s != null);
  const kpiAgg = sumStageAmounts([...kpiReqStages, ...kpiProjStages]);
  const beneficioConfirmado = kpiAgg.confirmacion.benefit;

  // ── Calidad de Entregas / Cumplimiento de Entrega (variantes reales, sin excusas) ──
  const { pct: calidad } = calcReprocesoStatsRaw(req, proj, reproceso);
  const { pct: cumplimiento } = calcEntregaStatsRaw(req, proj);

  return { evm, beneficioConfirmado, calidad, cumplimiento, nps: nps.nps };
}
