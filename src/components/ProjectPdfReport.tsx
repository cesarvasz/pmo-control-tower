"use client";

// Reporte de detalle de proyecto PARA EL PDF — NO es una captura/print de la
// página en pantalla: es un layout propio, con dimensiones fijas en píxeles
// del tamaño exacto de una hoja A4 vertical (794×1123px @ 96dpi), que
// lib/pdf.ts captura con html2canvas y empaqueta en un PDF real (descarga
// directa, sin pasar por el diálogo de impresión del navegador). Vive
// siempre montado (oculto fuera de pantalla) mientras se ve el detalle de un
// proyecto — ver su uso en resumen-ejecutivo/page.tsx.
//
// Usa una paleta de colores fija y clara (no las variables CSS del tema
// activo): un reporte que se descarga para compartir/imprimir debe verse
// igual sin importar si el usuario tenía el tema oscuro puesto, y evita
// depender de que html2canvas resuelva bien custom properties de CSS.
//
// Cada sección tiene una altura fija con overflow oculto — así el layout
// SIEMPRE cabe en una sola hoja sin importar cuántas fases o atrasos tenga
// el proyecto (con listas largas, se recorta y se indica "+N más"), en vez
// de depender de la paginación del motor de impresión del navegador. Y
// OJO: html2canvas dibuja el texto a mano (no usa el layout nativo del
// navegador) y NO soporta `text-overflow: ellipsis` — con overflow:hidden
// simplemente corta el texto crudo, sin puntos suspensivos, lo que se ve
// como si faltaran caracteres. Por eso acá NINGÚN texto usa ellipsis: cada
// contenedor tiene ancho de sobra para el contenido esperado, o el texto
// puede pasar a una segunda línea (whiteSpace normal) con el contenedor
// recortando por altura si de plano no cabe — nunca a la mitad de una letra.

import { forwardRef, useMemo, useState, type ReactNode } from "react";
import { fmtDate, fmtMoney, today } from "@/lib/business";
import { addMonth, monthTicks, startOfMonth } from "@/lib/dateAxis";
import { isFase3, isDesarrolloPorIteracionesStep } from "@/lib/dashboard";
import { classifyDev } from "@/lib/devTimeline";
import {
  calcAtrasoActualDias, currentPhaseIndex, enScope, groupFase3Units, phaseState,
  type PhaseSummary, type ProjectSummary, type Responsabilidad, type StepAtraso, type WorkUnit,
} from "@/lib/projSummary";
import type { BoardHealthData } from "@/lib/proj";
import type { ProjBoard } from "@/types";

const PAGE_W = 794;
const PAGE_H = 1123;
const MARGIN = 32;
const CONTENT_W = PAGE_W - MARGIN * 2;

const C = {
  text: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#94a3b8",
  border: "#e2e8f0",
  cardBg: "#f8fafc",
  ok: "#059669",
  okBg: "#d1fae5",
  bad: "#dc2626",
  badBg: "#fee2e2",
  warn: "#b45309",
  warnBg: "#fef3c7",
  accent: "#4f46e5",
  disabled: "#94a3b8",
  disabledBg: "#f1f5f9",
};

// Solo 3 colores (mismo criterio que en pantalla, ver resumen-ejecutivo/
// page.tsx): verde completada, ámbar la fase actual (aunque esté atrasada),
// gris todo lo demás — una fase atrasada que ya NO es la actual también es
// gris, el texto "Atrasada" se decide aparte (ver phaseLabel).
const PHASE_PDF_CFG: Record<ReturnType<typeof phaseState>, { color: string; bg: string }> = {
  done:    { color: C.ok,   bg: C.okBg },
  current: { color: C.warn, bg: C.warnBg },
  pending: { color: C.textMuted, bg: C.disabledBg },
};
// Rojo SOLO para los steps del desglose de Fase 3 (ver buildGanttRows/indent) —
// mismo criterio que en pantalla (resumen-ejecutivo/page.tsx, FASE3_LATE_CFG):
// un step realmente atrasado (mismo dato que la tabla de Atrasos, ver enScope)
// pesa más que estar "en curso". Las otras 4 fases mantienen los 3 colores.
const FASE3_LATE_PDF_CFG = { color: C.bad, bg: C.badBg };
function phaseLabel(p: PhaseSummary, isCurrent: boolean): string {
  if (p.total > 0 && p.done === p.total) return "Completada";
  if (p.offTrack) return "Atrasada";
  return isCurrent ? "En curso" : "Pendiente";
}

function fmtMoneyOrDash(n: number | null | undefined): string {
  return n ? fmtMoney(n) : "—";
}

// ── KPIs: grid de 4×2 (no 8 en una sola fila) — con 8 tarjetas en una fila
// de 730px cada una queda con ~70px de ancho, insuficiente para valores como
// "✕ Off Track" y es justo lo que producía el corte de texto reportado. En
// 4×2 cada tarjeta tiene más del doble de ancho.
const KPI_H = 104;

interface Card { value: ReactNode; label: string; color?: string }

function KpiCard({ value, label, color }: Card) {
  return (
    <div
      style={{
        minWidth: 0, borderRadius: 8, border: `1px solid ${C.border}`, background: C.cardBg,
        padding: "6px 8px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        textAlign: "center", gap: 4, overflow: "hidden",
      }}
    >
      <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, color: C.textSecondary, lineHeight: 1.3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color ?? C.text, lineHeight: 1.25, maxWidth: "100%" }}>
        {value}
      </div>
    </div>
  );
}

// ── Gantt (línea de tiempo por fase, con Fase 3 SIEMPRE expandida en sus
// steps/hitos — ver buildGanttRows) ─────────────────────────────────────
const GANTT_AXIS_H = 16;
const PHASE_COL_W = 190;

/** Una fila del Gantt: o bien una de las 5 fases del proyecto (`indent`
 *  false), o bien uno de los steps/hitos DENTRO de Fase 3 (`indent` true,
 *  justo debajo de la fila resumen de esa fase) — mismo desglose y mismo
 *  criterio de atraso (enScope) que ya usa la tabla de Atrasos y el Gantt en
 *  pantalla (ver fase3StepRowsFor en resumen-ejecutivo/page.tsx), para que
 *  el PDF muestre la MISMA información, solo que siempre "abierta" (el PDF
 *  no tiene interacción de clic para expandir/colapsar). */
interface GanttRow { grupo: string; total: number; done: number; offTrack: boolean; started: boolean; isCurrent: boolean; indent: boolean; units: WorkUnit[] }

const cmpStart = (a: Date | null, b: Date | null) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.getTime() - b.getTime();
};
const startOfGroup = (g: { units: WorkUnit[] }) =>
  isDesarrolloPorIteracionesStep(g.units[0].stepName) ? g.units[0].startDate : g.units[0].stepStartDate;

function buildGanttRows(phases: PhaseSummary[], units: WorkUnit[]): GanttRow[] {
  const curPhaseIdx = currentPhaseIndex(phases);
  const rows: GanttRow[] = [];
  phases.forEach((p, i) => {
    rows.push({ grupo: p.grupo || "Sin grupo", total: p.total, done: p.done, offTrack: p.offTrack, started: p.started, isCurrent: i === curPhaseIdx, indent: false, units: units.filter((u) => u.grupo === p.grupo) });
    if (!isFase3(p.grupo)) return;
    const groups = groupFase3Units(units, p.grupo).sort((a, b) => cmpStart(startOfGroup(a), startOfGroup(b)));
    if (groups.length <= 1) return; // nada que desglosar aparte de la fila resumen
    const stepPhases = groups.map((g) => ({
      grupo: g.name, total: g.units.length,
      done: g.units.filter((u) => u.status === "Done").length,
      offTrack: g.units.some((u) => enScope(u.status, u.estado, u.deadline)),
      started: g.units.some((u) => classifyDev(u.status) !== "future"),
      units: g.units,
    }));
    const curStepIdx = currentPhaseIndex(stepPhases);
    stepPhases.forEach((sp, si) => {
      rows.push({ grupo: sp.grupo, total: sp.total, done: sp.done, offTrack: sp.offTrack, started: sp.started, isCurrent: si === curStepIdx, indent: true, units: sp.units });
    });
  });
  return rows;
}

/** Altura de fila según cuántas filas hay en total (con Fase 3 expandida
 *  pueden ser bastantes más de 5) — más filas, más compacta cada una, para
 *  que el reporte siga cabiendo en una sola hoja (ver comentario arriba del
 *  archivo). Con 5 filas (sin desglose) da lo mismo que antes (44px). */
function ganttRowHeight(n: number): number {
  if (n <= 5) return 44;
  if (n <= 8) return 32;
  if (n <= 12) return 24;
  if (n <= 18) return 18;
  return 14;
}

function ganttSectionHeight(rows: GanttRow[]): number {
  return GANTT_AXIS_H + Math.max(1, rows.length) * ganttRowHeight(rows.length);
}

function GanttSection({ rows, estimatedFinish, now }: { rows: GanttRow[]; estimatedFinish: Date | null; now: number }) {
  const height = ganttSectionHeight(rows);
  if (!rows.length) {
    return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontSize: 11 }}>Sin fases</div>;
  }
  const rowH = ganttRowHeight(rows.length);
  const ranges = rows.map((r) => {
    const dates: number[] = [];
    r.units.forEach((u) => {
      if (u.deadline) dates.push(u.deadline.getTime());
      if (u.actualEnd) dates.push(u.actualEnd.getTime());
    });
    return dates.length ? { start: Math.min(...dates), end: Math.max(...dates) } : null;
  });
  const allDates: number[] = [now];
  ranges.forEach((r) => { if (r) { allDates.push(r.start, r.end); } });
  if (estimatedFinish) allDates.push(estimatedFinish.getTime());
  const min = startOfMonth(new Date(Math.min(...allDates))).getTime();
  const max = addMonth(new Date(Math.max(...allDates))).getTime();
  const span = Math.max(max - min, 1);
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - min) / span) * 100));
  const ticks = monthTicks(new Date(min), new Date(max));
  const axisW = CONTENT_W - PHASE_COL_W;
  const estX = estimatedFinish ? pct(estimatedFinish.getTime()) : null;
  const todayX = pct(now);
  const fontScale = rowH < 24 ? 0.85 : 1;

  return (
    <div style={{ height, overflow: "hidden", border: `1px solid ${C.border}`, borderRadius: 8 }}>
      {/* Eje de meses */}
      <div style={{ display: "flex", height: GANTT_AXIS_H, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: PHASE_COL_W, flexShrink: 0 }} />
        <div style={{ position: "relative", width: axisW }}>
          {ticks.map((t, i) => (
            <span key={i} style={{ position: "absolute", left: `${pct(t.date.getTime())}%`, top: 1, fontSize: 7, lineHeight: 1.3, color: C.textMuted, whiteSpace: "nowrap" }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
      {/* Filas */}
      {rows.map((row, i) => {
        const cfg = row.indent && row.offTrack ? FASE3_LATE_PDF_CFG : PHASE_PDF_CFG[phaseState(row, row.isCurrent)];
        const label = phaseLabel(row, row.isCurrent);
        const r = ranges[i];
        const notDone = row.total === 0 || row.done < row.total;
        const overdueEnd = r && notDone && r.end < now ? now : null;
        return (
          <div key={`${row.grupo}-${i}`} style={{ display: "flex", height: rowH, borderBottom: i === rows.length - 1 ? "none" : `1px solid ${C.border}` }}>
            <div style={{ width: PHASE_COL_W, flexShrink: 0, background: cfg.bg, display: "flex", flexDirection: "column", justifyContent: "center", padding: row.indent ? "2px 8px 2px 18px" : "3px 8px", overflow: "hidden" }}>
              <div style={{ fontSize: (row.indent ? 8 : 9) * fontScale, fontWeight: row.indent ? 600 : 700, color: C.text, lineHeight: 1.2, whiteSpace: "normal", wordBreak: "break-word" }}>{row.grupo}</div>
              <div style={{ fontSize: 7 * fontScale, fontWeight: 600, color: cfg.color, lineHeight: 1.3, marginTop: 1 }}>{label} · {row.done}/{row.total}</div>
            </div>
            <div style={{ position: "relative", width: axisW }}>
              {estX != null && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${estX}%`, width: 1, background: C.warn, opacity: 0.6 }} />}
              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${todayX}%`, width: 1, background: C.accent, opacity: 0.6 }} />
              {r && (
                <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: 0, right: 0, height: 6 }}>
                  <div style={{ position: "absolute", height: 6, borderRadius: 3, left: `${pct(r.start)}%`, width: `${Math.max(pct(r.end) - pct(r.start), 0.8)}%`, background: "#fff", border: `1px solid ${cfg.color}` }} />
                  <div style={{ position: "absolute", height: 6, borderRadius: 3, left: `${pct(r.start)}%`, width: `${Math.max((pct(r.end) - pct(r.start)) * (row.total ? row.done / row.total : 0), row.done > 0 ? 0.8 : 0)}%`, background: cfg.color }} />
                  {overdueEnd != null && (
                    <div style={{ position: "absolute", height: 6, borderRadius: 3, left: `${pct(r.end)}%`, width: `${Math.max(pct(overdueEnd) - pct(r.end), 0.8)}%`, background: C.bad, opacity: 0.55 }} />
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── % de responsabilidad por rol (ver Responsabilidad en lib/projSummary.ts) —
// un solo color (rojo), a diferencia de la versión en pantalla que usa la
// paleta por rol: acá es solo un dato de apoyo, no hace falta diferenciar
// visualmente cada rol en un reporte de una página.
const RESP_H = 22;
function ResponsabilidadRow({ items }: { items: Responsabilidad[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ height: RESP_H, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, overflow: "hidden" }}>
      {items.map((r) => (
        <span
          key={r.label}
          style={{ fontSize: 8.5, fontWeight: 700, lineHeight: 1.3, color: C.bad, background: C.badBg, borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap" }}
        >
          {r.label} {r.pct}%
        </span>
      ))}
    </div>
  );
}

// ── Atrasos: solo fecha límite y responsable (sin la fase — acá todos son
// de Fase 3, es redundante repetirla en cada fila) ───────────────────────
// Filas en flujo de bloque simple (sin flexbox ni minHeight en la fila): el
// flexbox con centrado vertical + minHeight resultó NO confiable en
// html2canvas (mide línea/caja distinto al navegador y seguía recortando la
// segunda línea a la mitad). Apilar dos <div> normales, uno debajo del otro,
// es el modo de layout que html2canvas renderiza mejor — el badge de días se
// posiciona con position:absolute en vez de flex justify-content, y el
// padding-right de la fila le deja espacio para no encimarse con el texto.
const ATRASOS_ROW_H = 40; // estimado para el recorte de "+N más", no una altura real de CSS

function AtrasosSection({ rows, maxHeight }: { rows: StepAtraso[]; maxHeight: number }) {
  const maxRows = Math.max(1, Math.floor(maxHeight / ATRASOS_ROW_H));
  const shown = rows.length > maxRows ? rows.slice(0, maxRows - 1) : rows;
  const hiddenCount = rows.length - shown.length;
  if (rows.length === 0) {
    return <div style={{ height: 40, display: "flex", alignItems: "center", color: C.ok, fontSize: 11, fontWeight: 600 }}>Sin atrasos 🎉</div>;
  }
  return (
    // El límite de altura del BLOQUE completo (maxHeight+overflow) recorta
    // filas ENTERAS si de plano no caben todas — nunca a la mitad de una.
    <div style={{ maxHeight, overflow: "hidden" }}>
      {shown.map((a) => (
        <div key={a.id} style={{ position: "relative", borderBottom: `1px solid ${C.border}`, padding: "6px 62px 6px 0" }}>
          {/* SIN overflow:hidden en estas dos líneas: estuvo puesto acá desde el
              principio (salvaguarda horizontal, con whiteSpace:nowrap de sobra) y
              sobrevivió a los dos rediseños anteriores de la fila — era la causa
              real del recorte: html2canvas calcula el alto de esta caja con su
              propia métrica de línea, y si le queda corta, ese overflow corta el
              texto a la mitad verticalmente. Ya hay ancho de sobra (ver el padding
              derecho reservado para el badge), así que no hace falta. */}
          <div style={{ fontSize: 9.5, fontWeight: 600, color: C.text, lineHeight: 1.5, whiteSpace: "nowrap" }}>{a.name}</div>
          <div style={{ fontSize: 8, color: C.textMuted, lineHeight: 1.5, marginTop: 2, whiteSpace: "nowrap" }}>
            {fmtDate(a.deadline)}{a.responsible ? ` · A cargo: ${a.responsible}` : ""}
          </div>
          <span style={{ position: "absolute", top: 6, right: 0, fontSize: 8, fontWeight: 700, color: C.bad, background: C.badBg, borderRadius: 999, padding: "3px 8px", lineHeight: 1.3, whiteSpace: "nowrap" }}>
            {a.daysLate != null && a.daysLate > 0 ? `${a.daysLate}d` : a.stuck ? "Stuck" : "Atrasado"}
          </span>
        </div>
      ))}
      {hiddenCount > 0 && (
        <div style={{ fontSize: 8.5, color: C.textMuted, padding: "4px 0", fontStyle: "italic" }}>+{hiddenCount} más (ver el detalle en pantalla)</div>
      )}
    </div>
  );
}

// ── Reporte completo ──────────────────────────────────────────────────────
export interface ProjectPdfReportProps {
  board: ProjBoard;
  code: string;
  name: string;
  summary: ProjectSummary;
  health: BoardHealthData;
  healthLabel: string;
  healthColor?: string;
  atrasos: StepAtraso[];
  avancePlanificado: number;
  responsabilidadAtraso: Responsabilidad[];
  valorProyecto: number | null;
  roi: number | null;
  payback: number | null;
  estimateColor: string;
}

const ProjectPdfReport = forwardRef<HTMLDivElement, ProjectPdfReportProps>(function ProjectPdfReport(
  {
    board, code, name, summary, health, healthLabel, healthColor, atrasos, avancePlanificado,
    responsabilidadAtraso, valorProyecto, roi, payback, estimateColor,
  },
  ref,
) {
  const [now] = useState(() => Date.now()); // "hoy" fijado al montar (evita impureza en render)
  // SPI (simplificado): Avance real / Avance planificado — mismo criterio que
  // en pantalla (ver resumen-ejecutivo/page.tsx). Sin plan aún → null.
  const spi = avancePlanificado > 0 ? Math.round((summary.progress.pct / avancePlanificado) * 100) : null;
  // "Atraso actual" = la UNIÓN de días hábiles atrasados entre todos los
  // steps de `atrasos`, no la suma de sus daysLate — mismo criterio que la
  // tarjeta en pantalla (ver calcAtrasoActualDias en lib/projSummary.ts).
  const atrasoActualDias = calcAtrasoActualDias(atrasos, today());
  const kpis: Card[] = [
    {
      label: "Avance / Plan",
      value: (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span>{summary.progress.pct}% / {avancePlanificado}%</span>
          <span style={{ fontSize: 10, fontWeight: 800, lineHeight: 1.2, color: spi !== null ? (spi >= 90 ? C.ok : C.bad) : C.disabled }}>
            SPI {spi !== null ? `${spi}%` : "—"}
          </span>
        </div>
      ),
    },
    { value: healthLabel, label: `Salud${health.healthIndex !== null ? ` · EVM ${Math.round(health.healthIndex * 100)}%` : ""}`, color: healthColor },
    {
      value: atrasos.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span>{atrasoActualDias}d hábiles</span>
          <span style={{ fontSize: 10, fontWeight: 400, color: C.textMuted }}>
            {atrasos.length} step{atrasos.length === 1 ? "" : "s"} atrasado{atrasos.length === 1 ? "" : "s"}
          </span>
        </div>
      ) : "Sin atrasos",
      label: "Atraso actual",
      color: atrasos.length > 0 ? C.bad : C.ok,
    },
    { value: fmtDate(summary.completion.plannedFinish), label: "Fecha planificada" },
    { value: fmtDate(summary.completion.estimatedFinish), label: "Estimado de cierre", color: estimateColor },
    { value: fmtMoneyOrDash(valorProyecto), label: "Valor $", color: valorProyecto !== null && valorProyecto !== undefined ? (valorProyecto >= 0 ? C.ok : C.bad) : C.disabled },
    { value: roi !== null ? `${Math.round(roi)}%` : "—", label: "ROI", color: roi !== null ? (roi >= 0 ? C.ok : C.bad) : C.disabled },
    { value: payback !== null ? `${payback.toFixed(1)}m` : "—", label: "Payback" },
  ];

  // Fase 3 SIEMPRE expandida en sus steps/hitos (a diferencia de pantalla, el
  // PDF no tiene clic para expandir/colapsar) — ver buildGanttRows. El Gantt
  // crece según cuántas filas salgan, y el bloque de Atrasos se achica en la
  // misma medida (ver ganttSectionHeight) para seguir cabiendo en una hoja.
  const ganttRows = useMemo(() => buildGanttRows(summary.phases, summary.units), [summary.phases, summary.units]);
  const ganttH = ganttSectionHeight(ganttRows);

  const respH = responsabilidadAtraso.length > 0 ? RESP_H + 6 : 0;
  const atrasosMaxH = PAGE_H - MARGIN * 2 - 68 - (KPI_H + 16) - 24 - ganttH - 24 - respH - 16;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed", left: -10000, top: 0, width: PAGE_W, height: PAGE_H,
        background: "#ffffff", color: C.text, fontFamily: "Arial, Helvetica, sans-serif",
        padding: MARGIN, boxSizing: "border-box", overflow: "hidden",
      }}
    >
      {/* Encabezado */}
      <div style={{ height: 68 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {code && (
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", lineHeight: 1.3, color: C.textMuted, background: C.disabledBg, borderRadius: 999, padding: "3px 8px" }}>
              {code}
            </span>
          )}
          <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, color: C.text }}>{name}</span>
          {board.benefitType && (
            <span style={{ fontSize: 9, fontWeight: 600, lineHeight: 1.3, color: board.benefitType === "HardSaving" ? C.ok : C.accent, background: board.benefitType === "HardSaving" ? C.okBg : "#ede9fe", borderRadius: 999, padding: "2px 7px" }}>
              {board.benefitType}
            </span>
          )}
        </div>
        <div style={{ marginTop: 6, fontSize: 9.5, lineHeight: 1.4, color: C.textSecondary, display: "flex", gap: 14, flexWrap: "wrap" }}>
          {board.pm && <span>PM: <strong style={{ color: C.text }}>{board.pm}</strong></span>}
          {board.sponsor && <span>Sponsor: <strong style={{ color: C.text }}>{board.sponsor}</strong></span>}
          {board.cku && <span>CKU: <strong style={{ color: C.text }}>{board.cku}</strong></span>}
          {board.estrategia && <span>Estrategia: <strong style={{ color: C.text }}>{board.estrategia}</strong></span>}
        </div>
      </div>

      {/* KPIs — grid 4×2, no 8 en una fila (ver comentario en KPI_H) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gridTemplateRows: "repeat(2, 1fr)", gap: 6, height: KPI_H, marginTop: 8, marginBottom: 8 }}>
        {kpis.map((c, i) => <KpiCard key={i} {...c} />)}
      </div>

      {/* Gantt */}
      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, color: C.text, marginBottom: 6 }}>Línea de tiempo del proyecto</div>
      <GanttSection rows={ganttRows} estimatedFinish={summary.completion.estimatedFinish} now={now} />

      {/* Atrasos */}
      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, color: C.text, margin: "10px 0 6px" }}>Atrasos</div>
      {responsabilidadAtraso.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <ResponsabilidadRow items={responsabilidadAtraso} />
        </div>
      )}
      <AtrasosSection rows={atrasos} maxHeight={atrasosMaxH} />

      {/* Footer */}
      <div style={{ position: "absolute", left: MARGIN, right: MARGIN, bottom: 10, fontSize: 7.5, lineHeight: 1.3, color: C.textMuted, textAlign: "right" }}>
        Generado el {fmtDate(new Date())} · PMO Control Tower
      </div>
    </div>
  );
});

export default ProjectPdfReport;
