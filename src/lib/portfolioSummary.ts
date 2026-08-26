// src/lib/portfolioSummary.ts
// Resumen ejecutivo de TODO el portafolio (todos los boards a la vez), para
// /resumen-ejecutivo. Reutiliza la salud EVM (proj.ts) y el resumen por
// proyecto (projSummary.ts) — aquí solo se agrega a nivel de portafolio y se
// detectan riesgos que cruzan varios proyectos. Módulo PURO (cliente/servidor).

import { fmtMoney } from "@/lib/business";
import { calcBoardMetrics, deriveBoardHealth, splitBoardName } from "@/lib/proj";
import { buildProjectSummary, calcPlannedProgress } from "@/lib/projSummary";
import type { HealthStatus } from "@/lib/health";
import type { ProjBoard, ProjItem, ProjItemBaseline } from "@/types";

// ── Fila de portafolio (una por proyecto/board) ──────────────────────────
export interface RiskFlag { label: string; severity: "high" | "medium" | "low" }

export interface PortfolioProjectRow {
  boardId: string;
  code: string;
  name: string;
  pm: string;
  healthStatus: HealthStatus | null;
  healthIndex: number | null;
  spi: number | null;
  cpi: number | null;
  ev: number; pv: number;
  isComplete: boolean;
  progressPct: number;       // % avance físico (hitos Done / total)
  plannedPct: number;        // % que ya debería estar Done según la fecha
  budgetApproved: number;    // suma de Cost $ de todos los items del board
  budgetSpent: number;       // AC — costo real de lo hecho (o atrasado en curso)
  pctConsumed: number | null;
  worstOverdueDays: number;
  overdueCount: number;
  avgSlipDays: number;
  mainRisk: RiskFlag;
}

function deriveMainRisk(r: Omit<PortfolioProjectRow, "mainRisk">): RiskFlag {
  if (r.isComplete) return { label: "Cerrado — sin riesgo abierto", severity: "low" };
  if (r.overdueCount > 0) {
    return {
      label: `${r.overdueCount} hito${r.overdueCount === 1 ? "" : "s"} atrasado${r.overdueCount === 1 ? "" : "s"} (peor: ${r.worstOverdueDays}d hábiles)`,
      severity: r.worstOverdueDays > 15 ? "high" : "medium",
    };
  }
  if (r.cpi !== null && r.cpi < 0.85) {
    return { label: `Sobrecosto: CPI ${r.cpi.toFixed(2)}`, severity: "high" };
  }
  if (r.healthStatus === null) {
    return { label: "Datos incompletos (faltan fechas o costos en Monday)", severity: "medium" };
  }
  if (r.avgSlipDays > 0) {
    return { label: `Tendencia histórica de atraso (${r.avgSlipDays}d hábiles en promedio)`, severity: "low" };
  }
  return { label: "Sin riesgos relevantes detectados", severity: "low" };
}

export function buildPortfolioRows(
  boards: ProjBoard[],
  proj: ProjItem[],
  baselines: Record<string, ProjItemBaseline>,
): PortfolioProjectRow[] {
  return boards.map((b) => {
    const items = proj.filter((r) => r.boardId === b.id);
    const { code, name } = splitBoardName(b.name);
    const summary = buildProjectSummary(items);
    const health = deriveBoardHealth(calcBoardMetrics(items, baselines));
    const budgetApproved = items.reduce((s, it) => s + it.cost, 0);
    const budgetSpent = health.ac;
    const pctConsumed = budgetApproved > 0 ? Math.round((budgetSpent / budgetApproved) * 100) : null;

    const base = {
      boardId: b.id, code, name, pm: b.pm,
      healthStatus: health.healthStatus, healthIndex: health.healthIndex,
      spi: health.spi, cpi: health.cpi, ev: health.ev, pv: health.pv,
      isComplete: summary.completion.isComplete,
      progressPct: summary.progress.pct, plannedPct: calcPlannedProgress(summary.units),
      budgetApproved, budgetSpent, pctConsumed,
      worstOverdueDays: summary.delay.worstOverdueDays, overdueCount: summary.delay.overdueCount,
      avgSlipDays: summary.delay.avgSlipDays,
    };
    return { ...base, mainRisk: deriveMainRisk(base) };
  });
}

// ── Totales del portafolio ────────────────────────────────────────────
export interface PortfolioTotals {
  total: number;
  completed: number; onTrack: number; inRisk: number; offTrack: number; noData: number;
  budgetApproved: number; budgetSpent: number; burnRatePct: number | null;
  ev: number; pv: number; ac: number;
  portfolioSpi: number | null; portfolioCpi: number | null; // ponderados por EV/PV/AC del portafolio (no promedio simple)
}

export function calcPortfolioTotals(rows: PortfolioProjectRow[]): PortfolioTotals {
  const total = rows.length;
  const completed = rows.filter((r) => r.isComplete).length;
  const onTrack   = rows.filter((r) => !r.isComplete && r.healthStatus === "on-track").length;
  const inRisk    = rows.filter((r) => !r.isComplete && r.healthStatus === "in-risk").length;
  const offTrack  = rows.filter((r) => !r.isComplete && r.healthStatus === "off-track").length;
  const noData    = rows.filter((r) => !r.isComplete && r.healthStatus === null).length;

  const budgetApproved = rows.reduce((s, r) => s + r.budgetApproved, 0);
  const budgetSpent = rows.reduce((s, r) => s + r.budgetSpent, 0);
  const burnRatePct = budgetApproved > 0 ? Math.round((budgetSpent / budgetApproved) * 100) : null;

  const ev = rows.reduce((s, r) => s + r.ev, 0);
  const pv = rows.reduce((s, r) => s + r.pv, 0);
  const ac = budgetSpent;
  const portfolioSpi = pv > 0 ? ev / pv : null;
  const portfolioCpi = ac > 0 ? ev / ac : null;

  return { total, completed, onTrack, inRisk, offTrack, noData, budgetApproved, budgetSpent, burnRatePct, ev, pv, ac, portfolioSpi, portfolioCpi };
}

/** Los N proyectos que requieren intervención más urgente: primero Off Track,
 *  luego In Risk, ordenados por VEM ascendente (peor primero) y, a igualdad,
 *  por el presupuesto en juego (mayor primero). Cerrados quedan fuera. */
export function topCriticalProjects(rows: PortfolioProjectRow[], n = 3): PortfolioProjectRow[] {
  const order: Record<HealthStatus, number> = { "off-track": 0, "in-risk": 1, "on-track": 2 };
  return rows
    .filter((r) => !r.isComplete && r.healthStatus !== null && r.healthStatus !== "on-track")
    .sort((a, b) => {
      const oa = order[a.healthStatus!], ob = order[b.healthStatus!];
      if (oa !== ob) return oa - ob;
      const ha = a.healthIndex ?? 1, hb = b.healthIndex ?? 1;
      if (ha !== hb) return ha - hb;
      return b.budgetApproved - a.budgetApproved;
    })
    .slice(0, n);
}

// ── Riesgos que cruzan varios proyectos ──────────────────────────────────
export interface CrossRisk { title: string; detail: string; severity: "high" | "medium"; mitigation: string }

/**
 * Detecta hasta 3 riesgos de portafolio (no de un solo proyecto):
 *  1) Exposición financiera concentrada en proyectos Off Track.
 *  2) Un responsable de atraso que concentra una porción dominante de los
 *     atrasos atribuidos en TODO el portafolio (ver delay.ts countByResponsible;
 *     responsibleCounts se calcula en la página con los itemIds atrasados de
 *     todos los boards + delayAttributions de Firestore).
 *  3) Un PM cuya mayoría de proyectos asignados está En Riesgo u Off Track.
 */
export function buildCrossRisks(
  rows: PortfolioProjectRow[],
  totals: PortfolioTotals,
  responsibleCounts: Record<string, number>,
): CrossRisk[] {
  const risks: CrossRisk[] = [];

  // 1) Exposición financiera en Off Track.
  const offTrackRows = rows.filter((r) => !r.isComplete && r.healthStatus === "off-track");
  const offTrackSpend = offTrackRows.reduce((s, r) => s + r.budgetSpent, 0);
  const spendSharePct = totals.budgetSpent > 0 ? Math.round((offTrackSpend / totals.budgetSpent) * 100) : 0;
  if (offTrackRows.length > 0 && spendSharePct > 0) {
    risks.push({
      title: "Exposición financiera en proyectos atrasados",
      detail: `${offTrackRows.length} proyecto${offTrackRows.length === 1 ? "" : "s"} Off Track concentran ${fmtMoney(offTrackSpend)} ya ejecutados (${spendSharePct}% del gasto total del portafolio).`,
      severity: spendSharePct >= 25 ? "high" : "medium",
      mitigation: "Congelar nuevas asignaciones de presupuesto en estos proyectos hasta que presenten un plan de recuperación de cronograma.",
    });
  }

  // 2) Responsable dominante de atrasos.
  const totalAttributed = Object.values(responsibleCounts).reduce((a, b) => a + b, 0);
  const top = Object.entries(responsibleCounts).sort((a, b) => b[1] - a[1])[0];
  if (top && totalAttributed > 0) {
    const [name, count] = top;
    const pct = Math.round((count / totalAttributed) * 100);
    if (pct >= 30) {
      risks.push({
        title: `Concentración de atrasos en "${name}"`,
        detail: `"${name}" concentra ${count} de ${totalAttributed} atrasos atribuidos en todo el portafolio (${pct}%).`,
        severity: pct >= 50 ? "high" : "medium",
        mitigation: name === "Sin asignar"
          ? "Exigir a los PM que asignen responsable a cada atraso — sin eso no se puede actuar sobre la causa raíz."
          : `Revisar la carga de trabajo de "${name}" a nivel portafolio; evaluar refuerzo de capacidad o redistribución.`,
      });
    }
  }

  // 3) Concentración de riesgo por PM.
  const byPm = new Map<string, { total: number; atRisk: number }>();
  rows.forEach((r) => {
    if (!r.pm) return;
    const e = byPm.get(r.pm) ?? { total: 0, atRisk: 0 };
    e.total++;
    if (!r.isComplete && (r.healthStatus === "off-track" || r.healthStatus === "in-risk")) e.atRisk++;
    byPm.set(r.pm, e);
  });
  const worstPm = [...byPm.entries()]
    .filter(([, e]) => e.total >= 2 && e.atRisk > 0)
    .sort((a, b) => b[1].atRisk / b[1].total - a[1].atRisk / a[1].total)[0];
  if (worstPm) {
    const [pm, e] = worstPm;
    const pct = Math.round((e.atRisk / e.total) * 100);
    if (pct >= 50) {
      risks.push({
        title: `Concentración de carga en ${pm}`,
        detail: `${pm} lidera ${e.total} proyectos y ${e.atRisk} (${pct}%) están En Riesgo u Off Track.`,
        severity: pct >= 75 ? "high" : "medium",
        mitigation: `Evaluar redistribuir parte del portafolio de ${pm} o reforzarle equipo antes de asignarle nuevos proyectos.`,
      });
    }
  }

  return risks.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1)).slice(0, 3);
}
