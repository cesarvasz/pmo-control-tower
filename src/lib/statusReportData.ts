// src/lib/statusReportData.ts
// Adaptador PURO: convierte el resumen de un proyecto (ProjectSummary + salud +
// atrasos) al esquema `data.json` del "Status Ejecutivo PMO" (skill
// `/status-pdf`), que es lo que consume <StatusReport>. Toda la lógica de
// "qué dato va en cada casilla del reporte" vive aquí; el componente solo
// dibuja. Sin React ni red — con test.

import { businessDays, fmtDate, fmtMoney, today } from "@/lib/business";
import { addMonth, startOfMonth } from "@/lib/dateAxis";
import { isFase3, isCierreVmoStep, isDesarrolloPorIteracionesStep } from "@/lib/dashboard";
import { classifyDev } from "@/lib/devTimeline";
import {
  calcAtrasoActualDias, currentPhaseIndex, enScope, groupFase3Units,
  type PhaseSummary, type ProjectSummary, type Responsabilidad, type StepAtraso, type WorkUnit,
} from "@/lib/projSummary";
import { valorLateStages, valorProgress, valorStageOf } from "@/lib/valorStepper";
import { atrasoReparto } from "@/lib/delay";
import { atrasoRespSlot, type Tone } from "@/lib/reportTheme";
import type { BoardHealthData } from "@/lib/proj";
import type { AtrasoDetalle, ProjBoard } from "@/types";

export type StatusBand = "V" | "A" | "L" | "O" | "R";
export type StatusPhaseStatus = "done" | "current" | "late" | "pending_progress" | "pending" | "future";

export interface StatusPhase {
  name: string;
  state: string;                 // "Completada" | "En curso" | "Atrasada" | "Pendiente" | "A futuro"
  status: StatusPhaseStatus;
  indent: 0 | 1;
  bold: boolean;
  band?: StatusBand;             // solo en filas de nivel 0
  progress?: number;             // 0..1 (barras start/due)
  start?: string;                // YYYY-MM-DD
  due?: string;                  // YYYY-MM-DD
  milestone?: string;            // YYYY-MM-DD (rombo, en vez de start/due)
}

export interface StatusRepartoTramo {
  dias: number;                  // días hábiles atribuidos a `resp`
  resp: string;                  // rol o "Sin asignar"
  tone: string;                  // "violet" | "blue" | "neutral" | hex
}

export interface StatusAtraso {
  id: string;                    // itemId de Monday (para editar reparto/Motivo en pantalla)
  hito: string;
  fecha: string;
  acargo: string;
  dias: string;                  // etiqueta ("11 d" | "Stuck" | "—")
  diasNum: number;               // días de atraso como número (0 si solo "Stuck") — tope del reparto
  reparto: StatusRepartoTramo[]; // reparto de los días de atraso por rol
  resp: string;                  // rol dominante (más días) — para vistas de valor único
  resp_tone: string;             // "violet" | "blue" | "neutral" | hex del rol dominante
  motivo: string;
  actividades: string;
}

export interface StatusRespDist { label: string; value: number; color: string }

export interface StatusReportData {
  project: { id: string; name: string; pm: string; sponsor: string; cku: string; estrategia: string };
  today: string;
  plan_date: string;
  timeline_start: string;
  timeline_end: string;
  timeline_hint: string;
  current_band: StatusBand;
  late_bands: StatusBand[];
  spi: number | null;
  avance_real: string;
  avance_plan: string;
  salud_pct: string;
  salud_estado: string;
  salud_tone: Tone;
  atraso_valor: string;
  atraso_tone: Tone;
  fecha_cierre_plan: string;
  cierre_estimado: string;
  cierre_estimado_sub: string;
  cierre_estimado_tone: Tone;
  valor_generado: string;
  roi: string;
  roi_sub: string;
  payback: string;
  phases: StatusPhase[];
  atrasos: StatusAtraso[];
  resp_dist: StatusRespDist[];
  footer_left: string;
  footer_right: string;
}

const STAGE_LETTER: StatusBand[] = ["V", "A", "L", "O", "R"];
const toYMD = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const bandOf = (grupo: string): StatusBand | undefined => {
  const s = valorStageOf(grupo);
  return s >= 0 ? STAGE_LETTER[s] : undefined;
};

/** Nombre corto de una fase para la etiqueta del Gantt (una sola línea): la
 *  parte después del primer " | " ("Valuación | Formulación..." → "Formulación
 *  ..."), o el grupo tal cual si no tiene separador. */
export function shortPhaseName(grupo: string): string {
  const i = grupo.indexOf(" | ");
  return (i >= 0 ? grupo.slice(i + 3) : grupo).trim() || grupo.trim();
}

const HEALTH_LABEL: Record<string, string> = { "on-track": "On Track", "in-risk": "At Risk", "off-track": "Off Track" };
const HEALTH_TONE: Record<string, Tone> = { "on-track": "good", "in-risk": "warn", "off-track": "crit" };

// ── Gantt: filas de nivel 0 (fases) + Fase 3 expandida en sus steps/hitos ──
interface GRow { grupo: string; total: number; done: number; offTrack: boolean; started: boolean; isCurrent: boolean; indent: 0 | 1; units: WorkUnit[] }

const cmpStart = (a: Date | null, b: Date | null) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.getTime() - b.getTime();
};
const startOfGroup = (g: { units: WorkUnit[] }) =>
  isDesarrolloPorIteracionesStep(g.units[0].stepName) ? g.units[0].startDate : g.units[0].stepStartDate;

function buildGanttRows(phases: PhaseSummary[], units: WorkUnit[]): GRow[] {
  const curPhaseIdx = currentPhaseIndex(phases);
  const rows: GRow[] = [];
  phases.forEach((p, i) => {
    rows.push({ grupo: p.grupo || "Sin grupo", total: p.total, done: p.done, offTrack: p.offTrack, started: p.started, isCurrent: i === curPhaseIdx, indent: 0, units: units.filter((u) => u.grupo === p.grupo) });
    if (!isFase3(p.grupo)) return;
    const groups = groupFase3Units(units, p.grupo).sort((a, b) => cmpStart(startOfGroup(a), startOfGroup(b)));
    if (groups.length <= 1) return;
    const stepPhases = groups.map((g) => ({
      grupo: g.name,
      total: g.units.length,
      done: g.units.filter((u) => u.status === "Done").length,
      offTrack: g.units.some((u) => enScope(u.status, u.estado, u.deadline)),
      started: g.units.some((u) => classifyDev(u.status) !== "future"),
      units: g.units,
    }));
    const curStepIdx = currentPhaseIndex(stepPhases);
    stepPhases.forEach((sp, si) => {
      rows.push({ ...sp, isCurrent: si === curStepIdx, indent: 1 });
    });
  });
  return rows;
}

/** Rango [start,end] de una fila del Gantt.
 *  Plantilla VIEJA (isOldTemplate):
 *   · fila de hito de Fase 3 (indent 1 — ver groupFase3Units): un solo punto,
 *     el Limit Date de ESE hito (nunca Actual End) — así la línea de tiempo
 *     refleja el compromiso, no cuándo se cerró de hecho.
 *   · fases 1/2/4/5 (V/A/O/R, indent 0): min/max del Limit Date de TODOS sus
 *     ITEMS — nunca de sus hitos/subitems (`stepDeadline`, no `deadline`; no
 *     hay Start Date confiable en esta plantilla, ver proj.ts). La fase 5
 *     (Revisión) es la excepción: su fin no es el máximo, es el Limit Date
 *     del item "Cierre VMO (OP) del proyecto" (mismo criterio que
 *     calcCompletionEstimate para "Fecha cierre plan" — un solo dato, dos usos).
 *  Todo lo demás (plantilla nueva, o Fase 3/Launch de nivel 0 en cualquier
 *  plantilla): el criterio de siempre, min/max de Limit Date + Actual End
 *  a nivel HITO (deadline/actualEnd, no stepDeadline).
 */
function rowRange(r: GRow, isOldTemplate: boolean): { start: number; end: number } | null {
  if (isOldTemplate) {
    if (r.indent === 1) {
      const d = r.units[0]?.deadline;
      return d ? { start: d.getTime(), end: d.getTime() } : null;
    }
    const stage = valorStageOf(r.grupo);
    if (stage === 0 || stage === 1 || stage === 3 || stage === 4) {
      const deadlines = r.units.map((u) => u.stepDeadline).filter((d): d is Date => d !== null);
      if (!deadlines.length) return null;
      const start = Math.min(...deadlines.map((d) => d.getTime()));
      let end = Math.max(...deadlines.map((d) => d.getTime()));
      if (stage === 4) {
        const cierre = r.units.find((u) => isCierreVmoStep(u.stepName))?.stepDeadline;
        if (cierre) end = cierre.getTime();
      }
      return { start, end };
    }
  }
  const ds: number[] = [];
  r.units.forEach((u) => {
    if (u.deadline) ds.push(u.deadline.getTime());
    if (u.actualEnd) ds.push(u.actualEnd.getTime());
  });
  return ds.length ? { start: Math.min(...ds), end: Math.max(...ds) } : null;
}

function phaseStatusOf(r: GRow): StatusPhaseStatus {
  if (r.total > 0 && r.done === r.total) return "done";
  if (r.offTrack) return "late";
  if (r.isCurrent) return "current";
  if (r.started) return "pending_progress";
  return "pending";
}
function phaseStateLabel(r: GRow): string {
  if (r.total > 0 && r.done === r.total) return "Completada";
  if (r.offTrack) return "Atrasada";
  return r.isCurrent ? "En curso" : "Pendiente";
}

/** Fila de hito de Fase 3, plantilla VIEJA: el color/estado viene del status
 *  crudo de Monday (Done/Working on it/Future Steps), no de "es la fase
 *  actual" — pero un hito vencido (mismo criterio que la tabla Atrasos,
 *  enScope) siempre se pinta "Atrasada" en rojo, sin importar su status. */
function fase3EntregableStatus(u: WorkUnit): { status: StatusPhaseStatus; state: string } {
  if (enScope(u.status, u.estado, u.deadline)) return { status: "late", state: "Atrasada" };
  if (u.status === "Done") return { status: "done", state: "Completada" };
  if (u.status === "Working on it") return { status: "current", state: "En curso" };
  if (u.status === "Future Steps") return { status: "future", state: "A futuro" };
  return { status: "pending", state: u.status || "Pendiente" };
}

// ── Entrada del adaptador ───────────────────────────────────────────────
export interface StatusReportInput {
  board: ProjBoard;
  code: string;
  name: string;
  summary: ProjectSummary;
  health: BoardHealthData;
  atrasos: StepAtraso[];
  atrasoDetalles?: Record<string, AtrasoDetalle>;
  responsabilidadAtraso: Responsabilidad[];
  avancePlanificado: number;
  valorProyecto: number | null;
  roi: number | null;
  payback: number | null;
  /** "hoy" fijado (Date.now del montaje) — para que el reporte no cambie entre renders. */
  now?: number;
}

export function buildStatusReportData(input: StatusReportInput): StatusReportData {
  const {
    board, code, name, summary, health, atrasos, atrasoDetalles, responsabilidadAtraso,
    avancePlanificado, valorProyecto, roi, payback,
  } = input;
  const nowDate = input.now != null ? new Date(input.now) : today();
  const { units, progress, phases, completion } = summary;
  const { plannedFinish, estimatedFinish, scheduleSlipDays } = completion;

  // Plantilla vieja: existe el step "Desarrollo por iteraciones..." en Fase 3
  // (ver isDesarrolloPorIteracionesStep) — decide cómo se arman las fases 1/2/4/5
  // y las filas de Fase 3 (ver rowRange/fase3EntregableStatus abajo), y también
  // el dominio temporal del eje de meses (ver abajo: por qué no usa `units` crudo).
  const isOldTemplate = units.some((u) => isFase3(u.grupo) && isDesarrolloPorIteracionesStep(u.stepName));
  const gRows = buildGanttRows(phases, units);

  // ── dominio temporal ──
  const dateNums: number[] = [nowDate.getTime()];
  if (isOldTemplate) {
    // Igual que el Gantt: SOLO las fechas que de verdad se dibujan (rowRange de
    // cada fila) — nunca las de `units` crudo. La plantilla vieja trae fases
    // administrativas (ej. Fase 5 con "VPA recopila datos a 90 días...",
    // "Cierre formal del proyecto") con Limit Date meses después del cierre
    // real del proyecto (el de "Cierre VMO..."); si el eje las incluyera
    // igual, el mes axis se estiraría con espacio muerto que ninguna barra usa.
    gRows.forEach((r) => {
      const range = rowRange(r, isOldTemplate);
      if (range) { dateNums.push(range.start, range.end); }
    });
  } else {
    units.forEach((u) => {
      [u.startDate, u.deadline, u.actualEnd].forEach((d) => { if (d) dateNums.push(d.getTime()); });
    });
  }
  if (plannedFinish) dateNums.push(plannedFinish.getTime());
  if (estimatedFinish) dateNums.push(estimatedFinish.getTime());
  const rawMin = new Date(Math.min(...dateNums));
  const rawMax = new Date(Math.max(...dateNums));
  const tlStart = startOfMonth(rawMin);
  const tlEnd = addMonth(rawMax);
  const monthYear = (d: Date) => d.toLocaleDateString("es-GT", { month: "long", year: "numeric" });

  // ── fases del Gantt ──
  const fallbackMs = (plannedFinish ?? tlEnd).getTime();
  const statusPhases: StatusPhase[] = gRows.map((r) => {
    const range = rowRange(r, isOldTemplate);
    const { status, state } = isOldTemplate && r.indent === 1
      ? fase3EntregableStatus(r.units[0])
      : { status: phaseStatusOf(r), state: phaseStateLabel(r) };
    const base: StatusPhase = {
      name: r.indent === 0 ? shortPhaseName(r.grupo) : r.grupo,
      state,
      status,
      indent: r.indent,
      bold: r.indent === 0,
      ...(r.indent === 0 && bandOf(r.grupo) ? { band: bandOf(r.grupo) } : {}),
    };
    if (range && range.start !== range.end) {
      return { ...base, start: toYMD(new Date(range.start)), due: toYMD(new Date(range.end)), progress: r.total ? r.done / r.total : 0 };
    }
    return { ...base, milestone: toYMD(new Date(range ? range.end : fallbackMs)) };
  });

  // ── stepper VALOR ──
  const vp = valorProgress(phases);
  const currentBand = vp.allDone ? "R" : STAGE_LETTER[Math.min(Math.max(vp.current, 0), 4)];
  const lateBands = [...valorLateStages(phases)].sort((a, b) => a - b).map((i) => STAGE_LETTER[i]);

  // ── KPIs ──
  const spi = avancePlanificado > 0 ? progress.pct / avancePlanificado : null;
  const healthPct = health.healthIndex !== null ? `${Math.round(health.healthIndex * 100)}%` : "—";
  const saludEstado = health.healthStatus ? HEALTH_LABEL[health.healthStatus] : "Sin datos";
  const saludTone: Tone = health.healthStatus ? HEALTH_TONE[health.healthStatus] : "neutral";
  const atrasoActualDias = calcAtrasoActualDias(atrasos, today());
  const slipVsPlan = plannedFinish && estimatedFinish && estimatedFinish > plannedFinish
    ? businessDays(plannedFinish, estimatedFinish) : scheduleSlipDays;

  const statusAtrasos: StatusAtraso[] = atrasos.map((a) => {
    const det = atrasoDetalles?.[a.id];
    const n = a.nHitos || 1;
    const diasNum = a.daysLate != null && a.daysLate > 0 ? a.daysLate : 0;
    const reparto: StatusRepartoTramo[] = atrasoReparto(det, diasNum).map((r) => ({
      dias: r.dias, resp: r.resp, tone: atrasoRespSlot(r.resp),
    }));
    const dom = reparto.reduce((best, r) => (r.dias > best.dias ? r : best), reparto[0]);
    return {
      id: a.id,
      hito: a.name,
      fecha: fmtDate(a.deadline),
      acargo: a.responsible || "—",
      dias: a.daysLate != null && a.daysLate > 0 ? `${a.daysLate} d` : a.stuck ? "Stuck" : "—",
      diasNum,
      reparto,
      resp: dom?.resp ?? "Sin asignar",
      resp_tone: dom ? dom.tone : "neutral",
      motivo: det?.motivo || "—",
      actividades: `${n} actividad${n === 1 ? "" : "es"}${a.stuck ? " · Stuck" : ""}`,
    };
  });

  const respDist: StatusRespDist[] = responsabilidadAtraso.map((r) => ({
    label: r.label, value: r.pct, color: atrasoRespSlot(r.label),
  }));

  return {
    project: {
      id: code, name,
      pm: board.pm || "—", sponsor: board.sponsor || "—",
      cku: board.cku || "—", estrategia: board.estrategia || "—",
    },
    today: toYMD(nowDate),
    plan_date: toYMD(plannedFinish ?? tlEnd),
    timeline_start: toYMD(tlStart),
    timeline_end: toYMD(tlEnd),
    timeline_hint: `Fases VALOR y entregables · ${monthYear(rawMin)} – ${monthYear(rawMax)}`,
    current_band: currentBand,
    late_bands: lateBands,
    spi,
    avance_real: `${progress.pct}%`,
    avance_plan: `${avancePlanificado}%`,
    salud_pct: healthPct,
    salud_estado: saludEstado,
    salud_tone: saludTone,
    atraso_valor: atrasos.length > 0 ? `${atrasoActualDias} d hábiles` : "Sin atrasos",
    atraso_tone: atrasos.length > 0 ? "crit" : "good",
    fecha_cierre_plan: fmtDate(plannedFinish),
    cierre_estimado: fmtDate(estimatedFinish),
    cierre_estimado_sub: slipVsPlan > 0 ? `+${slipVsPlan} días vs plan` : plannedFinish ? "en fecha" : "",
    cierre_estimado_tone: slipVsPlan > 0 ? "warn" : plannedFinish ? "good" : "neutral",
    valor_generado: fmtMoney(valorProyecto),
    roi: roi !== null ? `${Math.round(roi).toLocaleString("en-US")}%` : "—",
    roi_sub: roi !== null ? "Retorno inversión" : "",
    payback: payback !== null ? `${payback.toFixed(1)} meses` : "—",
    phases: statusPhases,
    atrasos: statusAtrasos,
    resp_dist: respDist,
    footer_left: `${code ? `${code} ` : ""}${name} · Reporte Ejecutivo PMO`,
    footer_right: "Confidencial · Uso interno",
  };
}
