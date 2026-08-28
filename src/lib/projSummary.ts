// src/lib/projSummary.ts
// Resumen ejecutivo de UN proyecto (board), para el Dashboard Gerencial: avance,
// desglose por fase, atrasos y estimado predictivo de cierre. Módulo PURO
// (cliente + servidor) — sin dependencias de red ni de React.

import { addBusinessDays, businessDays, today } from "@/lib/business";
import { classifyDev } from "@/lib/devTimeline";
import type { ProjItem } from "@/types";

/** Unidad de trabajo aplanada: el hito (subitem) si el item los tiene, o el item
 *  mismo si no — evita doble conteo (mismo criterio que "subOffTrack" en /proyectos). */
export interface WorkUnit {
  id: string;
  name: string;
  grupo: string;
  status: string;
  estado: string; // ATRASADO | PARA HOY | EN TIEMPO
  deadline: Date | null;
  actualEnd: Date | null; // fecha real de cierre (Actual End del hito / End Date del item)
  entrega: "on-time" | "late" | null;
  /** Quién está a cargo de la tarea (columna "Responsible" de Monday). NO es la
   *  atribución manual de responsable del ATRASO (delayAttributions/ResponsibleSelect,
   *  que es para efectos de KPI) — esto es simplemente el dueño operativo del hito/step. */
  responsible: string;
}

export function flattenBoardUnits(items: ProjItem[]): WorkUnit[] {
  const out: WorkUnit[] = [];
  for (const it of items) {
    if (it.subitems.length > 0) {
      for (const s of it.subitems) {
        out.push({ id: s.id, name: s.name, grupo: it.grupo, status: s.status, estado: s.estado, deadline: s.deadline, actualEnd: s.actualEnd, entrega: s.entrega, responsible: s.responsible });
      }
    } else {
      out.push({ id: it.id, name: it.name, grupo: it.grupo, status: it.status, estado: it.estado, deadline: it.deadline, actualEnd: it.endDate, entrega: it.entrega, responsible: it.responsible });
    }
  }
  return out;
}

// ── Avance ──────────────────────────────────────────────────────────────
export interface ProgressSummary { total: number; done: number; pct: number }

export function calcProgress(units: WorkUnit[]): ProgressSummary {
  const total = units.length;
  const done = units.filter((u) => u.status === "Done").length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** % planificado a la fecha: fracción de hitos/steps que YA deberían estar Done
 *  según su propio deadline (venció o es Done), sin importar si en verdad lo están.
 *  Comparado con calcProgress().pct (avance real) da la brecha física vs. plan. */
export function calcPlannedProgress(units: WorkUnit[]): number {
  const total = units.length;
  if (!total) return 0;
  const t = today();
  const shouldBeDone = units.filter((u) => u.status === "Done" || (u.deadline !== null && u.deadline <= t)).length;
  return Math.round((shouldBeDone / total) * 100);
}

// ── Fases (grupos de Monday), en orden de aparición en el board ──────────
export interface PhaseSummary {
  grupo: string;
  total: number;
  done: number;
  offTrack: boolean; // algún hito/step activo (no Done) está ATRASADO
  started: boolean;  // algún hito/step ya salió de "Future Steps/Not Started" (o está Done)
}

/** classifyDev clasifica cualquier status de Monday en future/working/done — se
 *  reutiliza aquí solo para detectar "aún no iniciado" (no es lógica de desarrollo). */
export function buildPhaseSummaries(units: WorkUnit[]): PhaseSummary[] {
  const order: string[] = [];
  const map = new Map<string, WorkUnit[]>();
  for (const u of units) {
    if (!map.has(u.grupo)) { order.push(u.grupo); map.set(u.grupo, []); }
    map.get(u.grupo)!.push(u);
  }
  return order.map((grupo) => {
    const list = map.get(grupo)!;
    const done = list.filter((u) => u.status === "Done").length;
    const offTrack = list.some((u) => u.status !== "Done" && u.estado === "ATRASADO");
    const started = list.some((u) => classifyDev(u.status) !== "future");
    return { grupo, total: list.length, done, offTrack, started };
  });
}

// ── Atrasos ────────────────────────────────────────────────────────────
export interface DelaySummary {
  overdueCount: number;      // hitos/steps activos (no Done) con Estado ATRASADO
  worstOverdueDays: number;  // el mayor atraso (días hábiles) entre esos activos
  lateDoneCount: number;     // hitos/steps YA entregados con atraso (evidencia histórica)
  avgSlipDays: number;       // atraso promedio (días hábiles) de esos entregados con atraso
}

export function calcDelaySummary(units: WorkUnit[]): DelaySummary {
  const t = today();
  const overdue = units.filter((u): u is WorkUnit & { deadline: Date } => u.status !== "Done" && u.estado === "ATRASADO" && u.deadline !== null);
  const worstOverdueDays = overdue.reduce((max, u) => Math.max(max, businessDays(u.deadline, t)), 0);

  const lateDone = units.filter((u): u is WorkUnit & { deadline: Date; actualEnd: Date } => u.entrega === "late" && u.deadline !== null && u.actualEnd !== null);
  const slipDaysList = lateDone.map((u) => businessDays(u.deadline, u.actualEnd));
  const avgSlipDays = slipDaysList.length ? Math.round(slipDaysList.reduce((a, b) => a + b, 0) / slipDaysList.length) : 0;

  return { overdueCount: overdue.length, worstOverdueDays, lateDoneCount: lateDone.length, avgSlipDays };
}

// ── Estimado de finalización ──────────────────────────────────────────
export interface CompletionEstimate {
  isComplete: boolean;
  actualFinish: Date | null;     // ya terminó: fecha real del último cierre
  plannedFinish: Date | null;    // deadline más tardío entre lo pendiente (el plan)
  estimatedFinish: Date | null;  // predicción: el plan (o hoy, si ya venció) + el atraso promedio observado
  scheduleSlipDays: number;      // días hábiles ya vencidos del propio deadline del proyecto (0 si aún no llega)
}

/**
 * Estimado PREDICTIVO de cierre: parte del deadline más tardío entre lo pendiente
 * (el plan); si ese plan ya venció, arranca desde hoy. A ese punto le suma el atraso
 * promedio (días hábiles) que este mismo proyecto ya mostró en sus hitos entregados
 * con atraso (avgSlipDays de calcDelaySummary) — una proyección simple por tendencia,
 * no una fecha inventada. Sin evidencia de atraso (avgSlipDays=0), el estimado es el plan.
 */
export function calcCompletionEstimate(units: WorkUnit[], avgSlipDays: number): CompletionEstimate {
  const t = today();
  const pending = units.filter((u) => u.status !== "Done");

  if (units.length > 0 && pending.length === 0) {
    const finishes = units.map((u) => u.actualEnd).filter((d): d is Date => d !== null);
    const actualFinish = finishes.length ? new Date(Math.max(...finishes.map((d) => d.getTime()))) : null;
    return { isComplete: true, actualFinish, plannedFinish: null, estimatedFinish: actualFinish, scheduleSlipDays: 0 };
  }

  const deadlines = pending.map((u) => u.deadline).filter((d): d is Date => d !== null);
  if (!deadlines.length) {
    return { isComplete: false, actualFinish: null, plannedFinish: null, estimatedFinish: null, scheduleSlipDays: 0 };
  }
  const plannedFinish = new Date(Math.max(...deadlines.map((d) => d.getTime())));

  const scheduleSlipDays = plannedFinish < t ? businessDays(plannedFinish, t) : 0;
  const base = scheduleSlipDays > 0 ? t : plannedFinish;
  const estimatedFinish = avgSlipDays > 0 ? addBusinessDays(base, avgSlipDays) : base;

  return { isComplete: false, actualFinish: null, plannedFinish, estimatedFinish, scheduleSlipDays };
}

// ── Resumen completo (atajo para la página) ───────────────────────────
export interface ProjectSummary {
  units: WorkUnit[];
  progress: ProgressSummary;
  phases: PhaseSummary[];
  delay: DelaySummary;
  completion: CompletionEstimate;
}

export function buildProjectSummary(items: ProjItem[]): ProjectSummary {
  const units = flattenBoardUnits(items);
  const progress = calcProgress(units);
  const phases = buildPhaseSummaries(units);
  const delay = calcDelaySummary(units);
  const completion = calcCompletionEstimate(units, delay.avgSlipDays);
  return { units, progress, phases, delay, completion };
}
