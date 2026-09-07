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
// El layout sigue el diseño del "Status Ejecutivo" (ver el PDF de referencia):
// encabezado con logo + stepper VALOR, fila de 8 KPIs con color semántico,
// línea de tiempo por fase y "Causas de atraso" (tabla + distribución de
// responsabilidad). Cada sección tiene una altura acotada con overflow
// oculto — así SIEMPRE cabe en una sola hoja sin importar cuántas fases o
// atrasos tenga el proyecto (con listas largas se recorta y se indica
// "+N más"), en vez de depender de la paginación del motor de impresión.
// OJO: html2canvas dibuja el texto a mano y NO soporta `text-overflow:
// ellipsis` — con overflow:hidden corta el texto crudo sin puntos
// suspensivos. Por eso acá cada contenedor tiene ancho de sobra para el
// contenido esperado, o el texto puede pasar a una segunda línea con el
// contenedor recortando por altura si de plano no cabe — nunca a la mitad de
// una letra.

import { forwardRef, useMemo, useState, type ReactNode } from "react";
import { businessDays, fmtDate, fmtMoney, today } from "@/lib/business";
import { addMonth, monthTicks, startOfMonth } from "@/lib/dateAxis";
import { isFase3, isDesarrolloPorIteracionesStep } from "@/lib/dashboard";
import { classifyDev } from "@/lib/devTimeline";
import {
  calcAtrasoActualDias, currentPhaseIndex, enScope, groupFase3Units, phaseState,
  type PhaseSummary, type ProjectSummary, type Responsabilidad, type StepAtraso, type WorkUnit,
} from "@/lib/projSummary";
import { VALOR_STAGES, valorLateStages, valorProgress, valorStageOf } from "@/lib/valorStepper";
import {
  BAND_COLOR, BOLT_PATH, CARD_BG, CRITICAL, CRITICAL_BG, GOOD, GOOD_BG, GRID, INK,
  INK_MUTED, INK_SEC, NAVY, NEUTRAL, NEUTRAL_BG, NEUTRAL_LINE, ROLE_PALETTE, SURFACE,
  TONE, VIOLET, WARNING, WARNING_BG, WARNING_FILL, spiTone, type Tone,
} from "@/lib/reportTheme";
import type { BoardHealthData } from "@/lib/proj";
import type { AtrasoDetalle, ProjBoard } from "@/types";

const PAGE_W = 794;
const PAGE_H = 1123;
const MARGIN = 30;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Paleta FIJA del "Status Ejecutivo" — espejo de lib/reportTheme.ts (que a su
// vez copia la skill `status-pdf`). Los alias cortos (`C.text`, `C.ok`…) se
// mantienen para no reescribir cada sitio de uso; los valores ya son los del
// spec (dataviz).
const C = {
  text: INK,
  textSecondary: INK_SEC,
  textMuted: INK_MUTED,
  border: GRID,
  borderStrong: NEUTRAL_LINE,
  cardBg: CARD_BG,
  ok: GOOD,
  okBg: GOOD_BG,
  bad: CRITICAL,
  badBg: CRITICAL_BG,
  warn: WARNING,
  warnFill: WARNING_FILL,
  warnBg: WARNING_BG,
  accent: VIOLET,
  accentBg: "#ecebf7",
  disabled: NEUTRAL,
  disabledBg: NEUTRAL_BG,
  brand: GOOD,
  navy: NAVY,
};

// Colores del stacked bar de "Distribución de responsabilidad" — "Sin asignar"
// siempre gris; el resto cicla la paleta categórica del spec (violeta/azul…).
function roleColor(label: string, i: number): string {
  if (/sin asignar/i.test(label)) return C.textMuted;
  return ROLE_PALETTE[i % ROLE_PALETTE.length];
}

// Rayo del encabezado (mismo path que la skill), relleno ámbar.
function Bolt({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={WARNING_FILL} xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, display: "block" }}>
      <path d={BOLT_PATH} />
    </svg>
  );
}

const STAGE_LETTER = ["V", "A", "L", "O", "R"] as const;
function bandOf(grupo: string): (typeof STAGE_LETTER)[number] | null {
  const s = valorStageOf(grupo);
  return s >= 0 ? STAGE_LETTER[s] : null;
}

// 4 colores (mismo criterio que en pantalla, ver resumen-ejecutivo/page.tsx):
// verde completada, ROJO atrasada (cualquier fase o step de Fase 3 con un item
// atrasado / en Stuck), ámbar la fase actual, gris pendiente. El rojo tiene
// prioridad sobre el ámbar (ver el cfg de cada fila en GanttSection).
const PHASE_PDF_CFG: Record<ReturnType<typeof phaseState>, { color: string; bg: string; fill: string }> = {
  done:    { color: C.ok,   bg: C.okBg,   fill: C.ok },
  current: { color: C.warn, bg: C.warnBg, fill: C.warnFill },
  pending: { color: C.textMuted, bg: C.disabledBg, fill: C.textMuted },
};
// Rojo para cualquier fila (fase o step de Fase 3) con offTrack — mismo dato
// que la tabla de Atrasos (ver enScope). Se aplica con prioridad sobre PHASE_PDF_CFG.
const LATE_PDF_CFG = { color: C.bad, bg: C.badBg, fill: C.bad };
function phaseLabel(p: PhaseSummary, isCurrent: boolean): string {
  if (p.total > 0 && p.done === p.total) return "Completada";
  if (p.offTrack) return "Atrasada";
  return isCurrent ? "En curso" : "Pendiente";
}

function fmtMoneyOrDash(n: number | null | undefined): string {
  return n ? fmtMoney(n) : "—";
}

// ── Encabezado: stepper VALOR (5 etapas) ────────────────────────────────
// Diseño fijo (skill `status-pdf`): etapas pasadas verde, la actual ámbar,
// las futuras gris; una etapa con alguna fase atrasada (`lateStages`) se
// encierra en rojo y su nombre va rojo/negrita.
function ValorStepper({ current, allDone, lateStages }: { current: number; allDone: boolean; lateStages: Set<number> }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
      {VALOR_STAGES.map((s, i) => {
        const passed = allDone || i < current;
        const active = !allDone && i === current;
        const late = lateStages.has(i);
        const dotBg = passed ? C.ok : active ? C.warnFill : C.borderStrong;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 46 }}>
              {/* El círculo y la letra van en capas separadas: la letra no tiene
                  borde ni overflow, así html2canvas no la recorta aunque quede
                  1px descentrada. lineHeight = alto de la caja la centra vertical. */}
              <div style={{ position: "relative", width: 16, height: 16 }}>
                <div
                  style={{
                    position: "absolute", inset: 0, borderRadius: 999, boxSizing: "border-box",
                    background: dotBg, border: late ? `2px solid ${C.bad}` : "none",
                  }}
                />
                <div
                  style={{
                    position: "absolute", inset: 0, textAlign: "center",
                    fontSize: 8.5, fontWeight: 700, lineHeight: "16px", color: "#fff",
                  }}
                >
                  {s.key}
                </div>
              </div>
              <div style={{ fontSize: 6, lineHeight: 1.3, marginTop: 2, color: late ? C.bad : active ? C.text : C.textMuted, fontWeight: late || active ? 700 : 400, whiteSpace: "nowrap" }}>
                {s.label}
              </div>
            </div>
            {i < VALOR_STAGES.length - 1 && (
              <div style={{ width: 12, height: 1.5, marginTop: 7.5, background: i < current || allDone ? C.ok : C.border }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── KPI: fila única de 8 tarjetas con color semántico ───────────────────
// Diseño fijo (skill `status-pdf`): barra de color ARRIBA (ancho completo) +
// fondo tenue del tono; la tarjeta "Salud (EVM)" es la excepción — se pinta
// llena del color del estado, con texto blanco (`solid`).
const KPI_H = 76;

interface Card { value: ReactNode; sub?: string; label: string; tone: Tone; solid?: boolean }

function KpiCard({ value, sub, label, tone, solid }: Card) {
  const t = TONE[tone];
  if (solid) {
    return (
      <div style={{ minWidth: 0, borderRadius: 7, background: t.fg, padding: "8px 8px 9px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 3, overflow: "hidden" }}>
        <div style={{ fontSize: 6.1, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, color: "#ffffffcc", lineHeight: 1.2 }}>{label}</div>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: "#ffffff", lineHeight: 1.15 }}>{value}</div>
        {sub && <div style={{ fontSize: 6.5, fontWeight: 600, color: "#ffffffe0", lineHeight: 1.2 }}>{sub}</div>}
      </div>
    );
  }
  return (
    <div style={{ minWidth: 0, borderRadius: 7, border: `1px solid ${t.fg}55`, background: t.bg, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 4, flexShrink: 0, background: t.fg }} />
      <div style={{ flex: 1, padding: "6px 8px 7px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 }}>
        <div style={{ fontSize: 6.1, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, color: C.textMuted, lineHeight: 1.2 }}>{label}</div>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: tone === "neutral" ? C.text : t.fg, lineHeight: 1.15 }}>{value}</div>
        {sub && <div style={{ fontSize: 6.5, fontWeight: 600, color: C.textMuted, lineHeight: 1.2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Gantt (línea de tiempo por fase, con Fase 3 SIEMPRE expandida en sus
// steps/hitos — ver buildGanttRows) ─────────────────────────────────────
const GANTT_AXIS_H = 15;
const PHASE_COL_W = 168;

interface GanttRow { grupo: string; total: number; done: number; offTrack: boolean; started: boolean; isCurrent: boolean; indent: boolean; band: (typeof STAGE_LETTER)[number] | null; units: WorkUnit[] }

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
    rows.push({ grupo: p.grupo || "Sin grupo", total: p.total, done: p.done, offTrack: p.offTrack, started: p.started, isCurrent: i === curPhaseIdx, indent: false, band: bandOf(p.grupo), units: units.filter((u) => u.grupo === p.grupo) });
    if (!isFase3(p.grupo)) return;
    const groups = groupFase3Units(units, p.grupo).sort((a, b) => cmpStart(startOfGroup(a), startOfGroup(b)));
    if (groups.length <= 1) return;
    const stepPhases = groups.map((g) => ({
      grupo: g.name, total: g.units.length,
      done: g.units.filter((u) => u.status === "Done").length,
      offTrack: g.units.some((u) => enScope(u.status, u.estado, u.deadline)),
      started: g.units.some((u) => classifyDev(u.status) !== "future"),
      units: g.units,
    }));
    const curStepIdx = currentPhaseIndex(stepPhases);
    stepPhases.forEach((sp, si) => {
      rows.push({ grupo: sp.grupo, total: sp.total, done: sp.done, offTrack: sp.offTrack, started: sp.started, isCurrent: si === curStepIdx, indent: true, band: null, units: sp.units });
    });
  });
  return rows;
}

function ganttRowHeight(n: number): number {
  if (n <= 5) return 48;
  if (n <= 8) return 40;
  if (n <= 12) return 36;
  if (n <= 18) return 26;
  return 20;
}

function ganttSectionHeight(rows: GanttRow[]): number {
  return GANTT_AXIS_H + Math.max(1, rows.length) * ganttRowHeight(rows.length);
}

const HATCH = `repeating-linear-gradient(45deg, ${C.bad} 0, ${C.bad} 1.5px, transparent 1.5px, transparent 4px)`;

function GanttSection({ rows, estimatedFinish, plannedFinish, now }: {
  rows: GanttRow[]; estimatedFinish: Date | null; plannedFinish: Date | null; now: number;
}) {
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
  if (plannedFinish) allDates.push(plannedFinish.getTime());
  const min = startOfMonth(new Date(Math.min(...allDates))).getTime();
  const max = addMonth(new Date(Math.max(...allDates))).getTime();
  const span = Math.max(max - min, 1);
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - min) / span) * 100));
  const ticks = monthTicks(new Date(min), new Date(max));
  const axisW = CONTENT_W - PHASE_COL_W;
  const planX = plannedFinish ? pct(plannedFinish.getTime()) : null;
  const todayX = pct(now);
  const fontScale = rowH < 30 ? 0.85 : 1;
  const barH = rowH < 30 ? 5 : 6;
  const diaSize = rowH < 30 ? 5 : 6.5;

  return (
    <div style={{ height, overflow: "hidden", border: `1px solid ${C.border}`, borderRadius: 8 }}>
      {/* Eje de meses */}
      <div style={{ display: "flex", height: GANTT_AXIS_H, borderBottom: `1px solid ${C.border}`, background: C.cardBg }}>
        <div style={{ width: PHASE_COL_W, flexShrink: 0 }} />
        <div style={{ position: "relative", width: axisW }}>
          {ticks.map((t, i) => (
            <span key={i} style={{ position: "absolute", left: `${pct(t.date.getTime())}%`, top: 2, fontSize: 6.5, lineHeight: 1.2, color: C.textMuted, whiteSpace: "nowrap", paddingLeft: 2 }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
      {/* Filas */}
      {rows.map((row, i) => {
        const cfg = row.offTrack ? LATE_PDF_CFG : PHASE_PDF_CFG[phaseState(row, row.isCurrent)];
        const label = phaseLabel(row, row.isCurrent);
        const r = ranges[i];
        const notDone = row.total === 0 || row.done < row.total;
        const overdueEnd = r && notDone && r.end < now ? now : null;
        const isDone = row.total > 0 && row.done === row.total;
        return (
          <div key={`${row.grupo}-${i}`} style={{ display: "flex", height: rowH, borderBottom: i === rows.length - 1 ? "none" : `1px solid ${C.border}` }}>
            <div style={{ width: PHASE_COL_W, flexShrink: 0, background: cfg.bg, display: "flex", flexDirection: "column", justifyContent: "center", gap: 1, padding: row.indent ? "3px 8px 3px 18px" : "3px 8px", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {!row.indent && row.band && (
                  <span style={{ width: 6, height: 6, borderRadius: 2, background: BAND_COLOR[row.band], flexShrink: 0 }} />
                )}
                <div style={{ fontSize: (row.indent ? 8 : 9) * fontScale, fontWeight: row.indent ? 600 : 700, color: C.text, lineHeight: 1.12, whiteSpace: "normal", wordBreak: "break-word" }}>{row.grupo}</div>
              </div>
              <div style={{ fontSize: 6.5 * fontScale, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.2, color: cfg.color, lineHeight: 1.15 }}>
                {label} · {row.done}/{row.total}
              </div>
            </div>
            <div style={{ position: "relative", width: axisW }}>
              {ticks.map((t, ti) => (
                <div key={ti} style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(t.date.getTime())}%`, width: 1, background: C.border, opacity: 0.5 }} />
              ))}
              {planX != null && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${planX}%`, width: 1, background: HATCH, backgroundColor: C.warn, opacity: 0.8 }} />}
              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${todayX}%`, width: 1.5, background: C.navy, opacity: 0.85 }} />
              {r && (
                <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: 0, right: 0, height: barH }}>
                  <div style={{ position: "absolute", height: barH, borderRadius: 3, left: `${pct(r.start)}%`, width: `${Math.max(pct(r.end) - pct(r.start), 0.8)}%`, background: SURFACE, border: `1px solid ${cfg.color}` }} />
                  <div style={{ position: "absolute", height: barH, borderRadius: 3, left: `${pct(r.start)}%`, width: `${Math.max((pct(r.end) - pct(r.start)) * (row.total ? row.done / row.total : 0), row.done > 0 ? 0.8 : 0)}%`, background: cfg.fill }} />
                  {overdueEnd != null && (
                    <div style={{ position: "absolute", height: barH, borderRadius: 3, left: `${pct(r.end)}%`, width: `${Math.max(pct(overdueEnd) - pct(r.end), 0.8)}%`, background: HATCH, backgroundColor: C.badBg, border: `1px solid ${C.bad}` }} />
                  )}
                  {/* Hito de cierre de la fila (rombo en su fin planificado) */}
                  <div
                    style={{
                      position: "absolute", top: "50%", left: `${pct(r.end)}%`, width: diaSize, height: diaSize,
                      marginLeft: -diaSize / 2, marginTop: -diaSize / 2, transform: "rotate(45deg)",
                      background: isDone ? cfg.color : "#fff", border: `1px solid ${row.offTrack ? C.bad : cfg.color}`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Leyenda del Gantt ──────────────────────────────────────────────────
function legendItem(swatch: ReactNode, txt: string) {
  return (
    <span key={txt} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      {swatch}<span>{txt}</span>
    </span>
  );
}
const swatchStyle = (o: { bg?: string; border?: string; hatch?: boolean }): React.CSSProperties => ({
  display: "inline-block", width: 12, height: 7, borderRadius: 2,
  background: o.hatch ? HATCH : o.bg, backgroundColor: o.hatch ? C.badBg : o.bg,
  border: o.border ? `1px solid ${o.border}` : undefined, verticalAlign: "middle",
});
function GanttLegend({ hoy, plan }: { hoy: string; plan: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 6.5, color: C.textSecondary, lineHeight: 1.4, marginBottom: 4 }}>
      {legendItem(<span style={swatchStyle({ bg: C.ok })} />, "Completada")}
      {legendItem(<span style={swatchStyle({ bg: C.warnFill })} />, "En curso")}
      {legendItem(<span style={swatchStyle({ hatch: true, border: C.bad })} />, "Atrasada (rayado = sobretiempo)")}
      {legendItem(<span style={swatchStyle({ bg: SURFACE, border: C.borderStrong })} />, "Pendiente")}
      {legendItem(<span style={{ display: "inline-block", width: 6, height: 6, transform: "rotate(45deg)", border: `1px solid ${C.borderStrong}` }} />, "Hito")}
      {legendItem(<span style={{ display: "inline-block", width: 1.5, height: 8, background: C.navy }} />, `Hoy · ${hoy}`)}
      {legendItem(<span style={{ display: "inline-block", width: 1.5, height: 8, background: C.warn }} />, `Fecha planificada · ${plan}`)}
    </div>
  );
}

// ── Distribución de responsabilidad (stacked bar + leyenda) ─────────────
function ResponsabilidadDist({ items }: { items: Responsabilidad[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", background: C.cardBg }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, color: C.navy, marginBottom: 6 }}>Distribución de responsabilidad</div>
      <div style={{ display: "flex", width: "100%", height: 10, borderRadius: 999, overflow: "hidden", background: C.disabledBg }}>
        {items.map((r, i) => (
          <div key={r.label} style={{ width: `${r.pct}%`, background: roleColor(r.label, i) }} />
        ))}
      </div>
      <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 3 }}>
        {items.map((r, i) => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: roleColor(r.label, i), flexShrink: 0 }} />
            <span style={{ color: C.textSecondary }}>{r.label} · <strong style={{ color: C.text }}>{r.pct}%</strong></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Causas de atraso: tabla (Entregable · A cargo · Atraso · Responsable · Motivo) ──
const ATRASOS_ROW_H = 34;

function atrasoSubtext(a: StepAtraso): string {
  const parts: string[] = [];
  if (a.nHitos > 0) parts.push(`${a.nHitos} actividad${a.nHitos === 1 ? "" : "es"}`);
  if (a.stuck) parts.push("Stuck");
  parts.push(`comprometido ${fmtDate(a.deadline)}`);
  return parts.join(" · ");
}

function CausasTable({ rows, detalleDe, maxHeight }: {
  rows: StepAtraso[];
  detalleDe: (id: string) => AtrasoDetalle | undefined;
  maxHeight: number;
}) {
  if (rows.length === 0) {
    return <div style={{ height: 34, display: "flex", alignItems: "center", color: C.ok, fontSize: 11, fontWeight: 600 }}>Sin atrasos 🎉</div>;
  }
  const maxRows = Math.max(1, Math.floor((maxHeight - 16) / ATRASOS_ROW_H));
  const shown = rows.length > maxRows ? rows.slice(0, maxRows - 1) : rows;
  const hiddenCount = rows.length - shown.length;
  const cols = "1.7fr 0.9fr 0.5fr 0.8fr 1.9fr";

  return (
    <div style={{ maxHeight, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 6, fontSize: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, color: C.textMuted, padding: "0 0 4px", borderBottom: `1px solid ${C.borderStrong}` }}>
        <span>Entregable</span><span>A cargo</span><span>Atraso</span><span>Responsable</span><span>Motivo</span>
      </div>
      {shown.map((a) => {
        const d = detalleDe(a.id);
        return (
          <div key={a.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 6, padding: "5px 0", borderBottom: `1px solid ${C.border}`, alignItems: "start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 8.5, fontWeight: 700, color: C.text, lineHeight: 1.25 }}>{a.name}</div>
              <div style={{ fontSize: 6.5, color: C.textMuted, lineHeight: 1.3, marginTop: 1 }}>{atrasoSubtext(a)}</div>
            </div>
            <div style={{ fontSize: 7.5, color: C.textSecondary, lineHeight: 1.3 }}>{a.responsible || "—"}</div>
            <div>
              <span style={{ fontSize: 7, fontWeight: 700, color: C.bad, background: C.badBg, borderRadius: 999, padding: "2px 6px", whiteSpace: "nowrap" }}>
                {a.daysLate != null && a.daysLate > 0 ? `${a.daysLate} d` : a.stuck ? "Stuck" : "Atr."}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 7, fontWeight: 600, color: d?.responsable ? C.accent : C.textMuted, background: d?.responsable ? C.accentBg : C.disabledBg, borderRadius: 999, padding: "2px 6px", whiteSpace: "nowrap" }}>
                {d?.responsable || "Sin asignar"}
              </span>
            </div>
            <div style={{ fontSize: 7, color: C.textSecondary, lineHeight: 1.35 }}>{d?.motivo || "—"}</div>
          </div>
        );
      })}
      {hiddenCount > 0 && (
        <div style={{ fontSize: 7, color: C.textMuted, padding: "4px 0", fontStyle: "italic" }}>+{hiddenCount} más (ver el detalle en pantalla)</div>
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
  atrasos: StepAtraso[];
  avancePlanificado: number;
  responsabilidadAtraso: Responsabilidad[];
  atrasoDetalles?: Record<string, AtrasoDetalle>;
  valorProyecto: number | null;
  roi: number | null;
  payback: number | null;
}

const ProjectPdfReport = forwardRef<HTMLDivElement, ProjectPdfReportProps>(function ProjectPdfReport(
  {
    board, code, name, summary, health, healthLabel, atrasos, avancePlanificado,
    responsabilidadAtraso, atrasoDetalles, valorProyecto, roi, payback,
  },
  ref,
) {
  const [now] = useState(() => Date.now());
  // SPI (simplificado): Avance real / Avance planificado — se muestra como
  // razón (0.86), igual que en pantalla. Sin plan aún → null.
  const spi = avancePlanificado > 0 ? summary.progress.pct / avancePlanificado : null;
  const atrasoActualDias = calcAtrasoActualDias(atrasos, today());
  const { plannedFinish, estimatedFinish, scheduleSlipDays } = summary.completion;
  const slipVsPlan = plannedFinish && estimatedFinish && estimatedFinish > plannedFinish
    ? businessDays(plannedFinish, estimatedFinish) : scheduleSlipDays;
  const healthPct = health.healthIndex !== null ? `${Math.round(health.healthIndex * 100)}%` : null;
  const valor = valorProyecto;
  const valorProg = valorProgress(summary.phases);
  const valorLate = useMemo(() => valorLateStages(summary.phases), [summary.phases]);
  const healthTone: Tone = health.healthStatus === "off-track" ? "crit"
    : health.healthStatus === "in-risk" ? "warn"
    : health.healthStatus === "on-track" ? "good" : "neutral";

  const kpis: Card[] = [
    {
      label: "Avance vs Plan",
      value: `${summary.progress.pct}% / ${avancePlanificado}%`,
      sub: `SPI ${spi !== null ? spi.toFixed(2) : "—"}`,
      tone: spiTone(spi),
    },
    {
      label: "Salud (EVM)",
      value: healthPct ?? healthLabel,
      sub: healthPct ? healthLabel : undefined,
      tone: healthTone,
      solid: true,
    },
    {
      label: "Atraso actual",
      value: atrasos.length > 0 ? `${atrasoActualDias} d hábiles` : "Sin atrasos",
      sub: atrasos.length > 0 ? `${atrasos.length} step${atrasos.length === 1 ? "" : "s"} atrasado${atrasos.length === 1 ? "" : "s"}` : undefined,
      tone: atrasos.length > 0 ? "crit" : "good",
    },
    { label: "Fecha cierre plan", value: fmtDate(plannedFinish), tone: "neutral" },
    {
      label: "Cierre estimado",
      value: fmtDate(estimatedFinish),
      sub: slipVsPlan > 0 ? `+${slipVsPlan} días vs plan` : plannedFinish ? "en fecha" : undefined,
      tone: slipVsPlan > 0 ? "warn" : plannedFinish ? "good" : "neutral",
    },
    {
      label: "Valor generado",
      value: fmtMoneyOrDash(valor),
      tone: valor != null ? (valor >= 0 ? "good" : "crit") : "neutral",
    },
    {
      label: "ROI",
      value: roi !== null ? `${Math.round(roi).toLocaleString("en-US")}%` : "—",
      sub: roi !== null ? "Retorno inversión" : undefined,
      tone: roi !== null ? (roi >= 0 ? "good" : "crit") : "neutral",
    },
    { label: "Payback", value: payback !== null ? `${payback.toFixed(1)} meses` : "—", tone: "neutral" },
  ];

  const ganttRows = useMemo(() => buildGanttRows(summary.phases, summary.units), [summary.phases, summary.units]);
  const ganttH = ganttSectionHeight(ganttRows);

  // Rango de meses del proyecto (para el subtítulo del timeline).
  const mesesLabel = useMemo(() => {
    const ds = summary.units.flatMap((u) => [u.startDate, u.deadline, u.actualEnd]).filter((d): d is Date => d != null);
    if (!ds.length) return "";
    const min = new Date(Math.min(...ds.map((d) => d.getTime())));
    const max = new Date(Math.max(...ds.map((d) => d.getTime())));
    const f = (d: Date) => d.toLocaleDateString("es-GT", { month: "long", year: "numeric" });
    return `${f(min)} – ${f(max)}`;
  }, [summary.units]);

  const detalleDe = (id: string) => atrasoDetalles?.[id];

  // Altura disponible para "Causas de atraso" tras fijar el resto (encabezado,
  // KPIs, leyenda + Gantt). La distribución de responsabilidad va al lado, no
  // suma alto.
  const causasMaxH = PAGE_H - MARGIN * 2 - 62 - (KPI_H + 12) - 34 - ganttH - 26 - 24;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed", left: -10000, top: 0, width: PAGE_W, height: PAGE_H,
        background: SURFACE, color: C.text, fontFamily: "Arial, Helvetica, sans-serif",
        padding: MARGIN, boxSizing: "border-box", overflow: "hidden",
      }}
    >
      {/* Encabezado */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, paddingBottom: 8, borderBottom: `2px solid ${C.navy}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <img src="/pmo-logo.png" alt="" style={{ height: 30, width: "auto", flexShrink: 0 }} crossOrigin="anonymous" />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, lineHeight: 1.1, flexWrap: "wrap" }}>
              <span style={{ fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.1, color: C.textMuted, paddingRight: 8, borderRight: `1px solid ${C.border}` }}>Reporte Proyecto</span>
              {code && <span style={{ fontSize: 15, fontWeight: 800, color: C.navy, letterSpacing: 0.2 }}>{code}</span>}
              <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{name}</span>
              <Bolt />
              <span style={{ fontSize: 8, color: C.textSecondary, fontWeight: 500 }}>Generado el {fmtDate(new Date())}</span>
            </div>
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <ValorStepper current={valorProg.current} allDone={valorProg.allDone} lateStages={valorLate} />
        </div>
      </div>
      <div style={{ marginTop: 6, fontSize: 8.5, lineHeight: 1.4, color: C.textSecondary, display: "flex", gap: 14, flexWrap: "wrap" }}>
        {board.pm && <span>PM: <strong style={{ color: C.text }}>{board.pm}</strong></span>}
        {board.sponsor && <span>Sponsor: <strong style={{ color: C.text }}>{board.sponsor}</strong></span>}
        {board.cku && <span>CKU: <strong style={{ color: C.text }}>{board.cku}</strong></span>}
        {board.estrategia && <span>Estrategia: <strong style={{ color: C.text }}>{board.estrategia}</strong></span>}
      </div>

      {/* KPIs — fila única de 8 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 5, height: KPI_H, marginTop: 12, marginBottom: 12 }}>
        {kpis.map((c, i) => <KpiCard key={i} {...c} />)}
      </div>

      {/* Timeline */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.navy }}>Línea de tiempo del proyecto</div>
        {mesesLabel && <div style={{ fontSize: 7.5, color: C.textMuted }}>Fases VALOR y entregables de Launch · {mesesLabel}</div>}
      </div>
      <GanttLegend hoy={fmtDate(new Date(now))} plan={fmtDate(plannedFinish)} />
      <GanttSection rows={ganttRows} estimatedFinish={estimatedFinish} plannedFinish={plannedFinish} now={now} />

      {/* Causas de atraso */}
      <div style={{ fontSize: 12, fontWeight: 800, color: C.navy, margin: "12px 0 6px" }}>Causas de atraso</div>
      <div style={{ display: "grid", gridTemplateColumns: responsabilidadAtraso.length > 0 ? "1fr 200px" : "1fr", gap: 14, alignItems: "start" }}>
        <CausasTable rows={atrasos} detalleDe={detalleDe} maxHeight={Math.max(causasMaxH, 80)} />
        <ResponsabilidadDist items={responsabilidadAtraso} />
      </div>

      {/* Footer */}
      <div style={{ position: "absolute", left: MARGIN, right: MARGIN, bottom: 12, display: "flex", justifyContent: "space-between", fontSize: 7, color: C.textMuted, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
        <span>{code ? `${code} ` : ""}{name} · Reporte Ejecutivo PMO</span>
        <span>Confidencial · Uso interno</span>
      </div>
    </div>
  );
});

export default ProjectPdfReport;
