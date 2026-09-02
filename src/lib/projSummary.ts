// src/lib/projSummary.ts
// Resumen ejecutivo de UN proyecto (board), para el Dashboard Gerencial: avance,
// desglose por fase, atrasos y estimado predictivo de cierre. Módulo PURO
// (cliente + servidor) — sin dependencias de red ni de React.

import { addBusinessDays, businessDays, today } from "@/lib/business";
import { classifyDev } from "@/lib/devTimeline";
import { isFase3, isDesarrolloPorIteracionesStep } from "@/lib/dashboard";
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
  /** Fecha de inicio del CPM de ESTA unidad (Start Date del hito, o del item si no
   *  tiene subitems). Para ordenar cronológicamente (ver Fase 3 en PhaseTimeline). */
  startDate: Date | null;
  entrega: "on-time" | "late" | null;
  /** Quién está a cargo de la tarea (columna "Responsible" de Monday). NO es la
   *  atribución manual de responsable del ATRASO (delayAttributions/ResponsibleSelect,
   *  que es para efectos de KPI) — esto es simplemente el dueño operativo del hito/step. */
  responsible: string;
  /** Item (step) padre al que pertenece esta unidad — para fases con varios steps en
   *  paralelo (ver Fase 3 en PhaseTimeline, que divide su fila por step en vez de una
   *  sola para toda la fase). Si el item no tiene subitems, stepId/stepName son los
   *  del item mismo (trivial: es su propio step). */
  stepId: string;
  stepName: string;
  /** Fecha de inicio del CPM del item (step) padre — no la de este hito. Igual a
   *  `startDate` cuando el item no tiene subitems (es su propio step). */
  stepStartDate: Date | null;
}

export function flattenBoardUnits(items: ProjItem[]): WorkUnit[] {
  const out: WorkUnit[] = [];
  for (const it of items) {
    if (it.subitems.length > 0) {
      for (const s of it.subitems) {
        out.push({ id: s.id, name: s.name, grupo: it.grupo, status: s.status, estado: s.estado, deadline: s.deadline, actualEnd: s.actualEnd, startDate: s.startDate, entrega: s.entrega, responsible: s.responsible, stepId: it.id, stepName: it.name, stepStartDate: it.startDate });
      }
    } else {
      out.push({ id: it.id, name: it.name, grupo: it.grupo, status: it.status, estado: it.estado, deadline: it.deadline, actualEnd: it.endDate, startDate: it.startDate, entrega: it.entrega, responsible: it.responsible, stepId: it.id, stepName: it.name, stepStartDate: it.startDate });
    }
  }
  return out;
}

// ── Fase 3: agrupamiento en sus unidades de medición ─────────────────────
/** Una unidad de medición de Fase 3 — un step (item) o un hito (subitem de
 *  "Desarrollo por iteraciones..."), según la plantilla del board. */
export interface Fase3Group { name: string; units: WorkUnit[] }

/** Agrupa los WorkUnit de la Fase 3 de un proyecto en sus unidades de medición
 *  — ver isDesarrolloPorIteracionesStep en lib/dashboard (mismo criterio que
 *  Calidad, calidadUnits/stepsQueMidenCalidad):
 *    · Plantilla vieja ("Launch | Desarrollo", existe ese step): un grupo POR
 *      HITO (subitem de ese step) — los demás checkpoints de la fase quedan
 *      fuera, son controles de fecha redundantes sobre los MISMOS hitos.
 *    · Plantilla nueva (sin ese step): un grupo POR ITEM (step) de la fase,
 *      con sus hitos (subitems) agrupados.
 *  Reutilizado tanto por PhaseTimeline (un renglón por grupo) como por el
 *  avance global (cada grupo pesa como una fase más, ver calcProgress). */
export function groupFase3Units(units: WorkUnit[], fase3Grupo: string): Fase3Group[] {
  const list = units.filter((u) => u.grupo === fase3Grupo);

  const desarrolloUnits = list.filter((u) => isDesarrolloPorIteracionesStep(u.stepName));
  if (desarrolloUnits.length > 0) {
    return desarrolloUnits.map((u) => ({ name: u.name, units: [u] }));
  }

  const order: string[] = [];
  const byStep = new Map<string, WorkUnit[]>();
  for (const u of list) {
    if (!byStep.has(u.stepId)) { order.push(u.stepId); byStep.set(u.stepId, []); }
    byStep.get(u.stepId)!.push(u);
  }
  return order.map((stepId) => {
    const stepUnits = byStep.get(stepId)!;
    return { name: stepUnits[0].stepName, units: stepUnits };
  });
}

// ── Avance ──────────────────────────────────────────────────────────────
export interface ProgressSummary { total: number; done: number; pct: number }

/** Avance del proyecto: cada FASE pesa como UNA unidad, excepto Fase 3, que se
 *  abre en sus propios steps/hitos (ver groupFase3Units) — cada uno de esos
 *  pesa como una fase más (ej.: 4 fases + 4 items de Fase 3 = 8 unidades). El
 *  aporte de cada unidad es su propia fracción done/total (no binario: una
 *  fase o step a medio completar suma su avance real, no 0), y `pct` es el
 *  promedio de esas fracciones — así ninguna unidad domina por tener más
 *  hitos que otra. `done` cuenta unidades 100% completas (informativo). */
export function calcProgress(units: WorkUnit[], phases: PhaseSummary[]): ProgressSummary {
  const parts: { done: number; total: number }[] = [];
  for (const p of phases) {
    if (isFase3(p.grupo)) {
      for (const g of groupFase3Units(units, p.grupo)) {
        parts.push({ done: g.units.filter((u) => u.status === "Done").length, total: g.units.length });
      }
    } else {
      parts.push({ done: p.done, total: p.total });
    }
  }
  const total = parts.length;
  if (!total) return { total: 0, done: 0, pct: 0 };
  const sumFrac = parts.reduce((s, p) => s + (p.total ? p.done / p.total : 0), 0);
  const fullyDone = parts.filter((p) => p.total > 0 && p.done === p.total).length;
  return { total, done: fullyDone, pct: Math.round((sumFrac / total) * 100) };
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
  const phases = buildPhaseSummaries(units);
  const progress = calcProgress(units, phases);
  const delay = calcDelaySummary(units);
  const completion = calcCompletionEstimate(units, delay.avgSlipDays);
  return { units, progress, phases, delay, completion };
}
