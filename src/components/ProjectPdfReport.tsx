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

import { forwardRef, useState } from "react";
import { fmtDate, fmtMoney } from "@/lib/business";
import { addMonth, monthTicks, startOfMonth } from "@/lib/dateAxis";
import { phaseState, type PhaseSummary, type ProjectSummary, type StepAtraso, type WorkUnit } from "@/lib/projSummary";
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

const PHASE_PDF_CFG: Record<ReturnType<typeof phaseState>, { color: string; bg: string; label: string }> = {
  done:        { color: C.ok,   bg: C.okBg,       label: "Completada" },
  "off-track": { color: C.bad,  bg: C.badBg,      label: "Atrasada" },
  // "En curso" = la fase donde va el proyecto actualmente — ámbar suave, solo
  // para ubicarla (no es una alerta como "Atrasada").
  current:     { color: C.warn, bg: C.warnBg,     label: "En curso" },
  pending:     { color: C.textMuted, bg: C.disabledBg, label: "Pendiente" },
};

function fmtMoneyOrDash(n: number | null | undefined): string {
  return n ? fmtMoney(n) : "—";
}

// ── KPIs: grid de 4×2 (no 8 en una sola fila) — con 8 tarjetas en una fila
// de 730px cada una queda con ~70px de ancho, insuficiente para valores como
// "✕ Off Track" y es justo lo que producía el corte de texto reportado. En
// 4×2 cada tarjeta tiene más del doble de ancho.
const KPI_H = 104;

interface Card { value: string; label: string; color?: string }

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

// ── Gantt (línea de tiempo por fase) ────────────────────────────────────
const GANTT_H = 236;
const PHASE_COL_W = 190;

function phaseRange(phase: PhaseSummary, units: WorkUnit[]): { start: number; end: number } | null {
  const dates: number[] = [];
  units.filter((u) => u.grupo === phase.grupo).forEach((u) => {
    if (u.deadline) dates.push(u.deadline.getTime());
    if (u.actualEnd) dates.push(u.actualEnd.getTime());
  });
  return dates.length ? { start: Math.min(...dates), end: Math.max(...dates) } : null;
}

function GanttSection({ phases, units, estimatedFinish, now }: { phases: PhaseSummary[]; units: WorkUnit[]; estimatedFinish: Date | null; now: number }) {
  if (!phases.length) {
    return <div style={{ height: GANTT_H, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontSize: 11 }}>Sin fases</div>;
  }
  const ranges = phases.map((p) => phaseRange(p, units));
  const allDates: number[] = [now];
  ranges.forEach((r) => { if (r) { allDates.push(r.start, r.end); } });
  if (estimatedFinish) allDates.push(estimatedFinish.getTime());
  const min = startOfMonth(new Date(Math.min(...allDates))).getTime();
  const max = addMonth(new Date(Math.max(...allDates))).getTime();
  const span = Math.max(max - min, 1);
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - min) / span) * 100));
  const ticks = monthTicks(new Date(min), new Date(max));
  const labelStep = Math.max(1, Math.ceil(ticks.length / 6));
  const axisW = CONTENT_W - PHASE_COL_W;
  const rowH = Math.max(24, Math.min(48, (GANTT_H - 16) / phases.length));
  const estX = estimatedFinish ? pct(estimatedFinish.getTime()) : null;
  const todayX = pct(now);

  return (
    <div style={{ height: GANTT_H, overflow: "hidden", border: `1px solid ${C.border}`, borderRadius: 8 }}>
      {/* Eje de meses */}
      <div style={{ display: "flex", height: 16, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: PHASE_COL_W, flexShrink: 0 }} />
        <div style={{ position: "relative", width: axisW }}>
          {ticks.map((t, i) => (i % labelStep === 0 || i === ticks.length - 1) && (
            <span key={i} style={{ position: "absolute", left: `${pct(t.date.getTime())}%`, top: 1, fontSize: 7, lineHeight: 1.3, color: C.textMuted, whiteSpace: "nowrap" }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
      {/* Filas */}
      {phases.map((p, i) => {
        const st = phaseState(p);
        const cfg = PHASE_PDF_CFG[st];
        const r = ranges[i];
        const notDone = p.total === 0 || p.done < p.total;
        const overdueEnd = r && notDone && r.end < now ? now : null;
        return (
          <div key={`${p.grupo}-${i}`} style={{ display: "flex", height: rowH, borderBottom: i === phases.length - 1 ? "none" : `1px solid ${C.border}` }}>
            <div style={{ width: PHASE_COL_W, flexShrink: 0, background: cfg.bg, display: "flex", flexDirection: "column", justifyContent: "center", padding: "3px 8px", overflow: "hidden" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.text, lineHeight: 1.2, whiteSpace: "normal", wordBreak: "break-word" }}>{p.grupo || "Sin grupo"}</div>
              <div style={{ fontSize: 7, fontWeight: 600, color: cfg.color, lineHeight: 1.3, marginTop: 1 }}>{cfg.label} · {p.done}/{p.total}</div>
            </div>
            <div style={{ position: "relative", width: axisW }}>
              {estX != null && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${estX}%`, width: 1, background: C.warn, opacity: 0.6 }} />}
              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${todayX}%`, width: 1, background: C.accent, opacity: 0.6 }} />
              {r && (
                <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: 0, right: 0, height: 6 }}>
                  <div style={{ position: "absolute", height: 6, borderRadius: 3, left: `${pct(r.start)}%`, width: `${Math.max(pct(r.end) - pct(r.start), 0.8)}%`, background: "#fff", border: `1px solid ${cfg.color}` }} />
                  <div style={{ position: "absolute", height: 6, borderRadius: 3, left: `${pct(r.start)}%`, width: `${Math.max((pct(r.end) - pct(r.start)) * (p.total ? p.done / p.total : 0), p.done > 0 ? 0.8 : 0)}%`, background: cfg.color }} />
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

// ── Atrasos: solo fecha límite y responsable (sin la fase — acá todos son
// de Fase 3, es redundante repetirla en cada fila) ───────────────────────
const ATRASOS_ROW_H = 34;

function AtrasosSection({ rows, maxHeight }: { rows: StepAtraso[]; maxHeight: number }) {
  const maxRows = Math.max(1, Math.floor(maxHeight / ATRASOS_ROW_H));
  const shown = rows.length > maxRows ? rows.slice(0, maxRows - 1) : rows;
  const hiddenCount = rows.length - shown.length;
  if (rows.length === 0) {
    return <div style={{ height: 40, display: "flex", alignItems: "center", color: C.ok, fontSize: 11, fontWeight: 600 }}>Sin atrasos 🎉</div>;
  }
  return (
    // El límite de altura del BLOQUE completo (maxHeight+overflow) sí es
    // seguro — recorta filas enteras. Lo que NO debe recortarse es CADA fila
    // individualmente: html2canvas mide el alto de línea con su propia
    // métrica (distinta a la del navegador) y con una altura fija + overflow
    // por fila, esa segunda línea (fecha/responsable) quedaba más alta de lo
    // calculado y se cortaba a la mitad. minHeight (no height) deja que cada
    // fila crezca lo que su contenido realmente necesite.
    <div style={{ maxHeight, overflow: "hidden" }}>
      {shown.map((a) => (
        <div key={a.id} style={{ minHeight: ATRASOS_ROW_H, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottom: `1px solid ${C.border}`, padding: "4px 0" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: C.text, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden" }}>{a.name}</div>
            <div style={{ fontSize: 8, color: C.textMuted, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden" }}>
              {fmtDate(a.deadline)}{a.responsible ? ` · A cargo: ${a.responsible}` : ""}
            </div>
          </div>
          <span style={{ flexShrink: 0, fontSize: 8, fontWeight: 700, color: C.bad, background: C.badBg, borderRadius: 999, padding: "2px 7px", lineHeight: 1.4, whiteSpace: "nowrap" }}>
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
  totalDiasAtrasoFase3: number;
  valorProyecto: number | null;
  roi: number | null;
  payback: number | null;
  estimateColor: string;
}

const ProjectPdfReport = forwardRef<HTMLDivElement, ProjectPdfReportProps>(function ProjectPdfReport(
  { board, code, name, summary, health, healthLabel, healthColor, atrasos, totalDiasAtrasoFase3, valorProyecto, roi, payback, estimateColor },
  ref,
) {
  const [now] = useState(() => Date.now()); // "hoy" fijado al montar (evita impureza en render)
  const kpis: Card[] = [
    { value: `${summary.progress.pct}%`, label: "Avance" },
    { value: healthLabel, label: `Salud${health.healthIndex !== null ? ` · EVM ${Math.round(health.healthIndex * 100)}%` : ""}`, color: healthColor },
    { value: atrasos.length > 0 ? `${totalDiasAtrasoFase3}d` : "Sin atrasos", label: atrasos.length > 0 ? `Atraso actual · ${atrasos.length}` : "Atraso actual", color: atrasos.length > 0 ? C.bad : C.ok },
    { value: fmtDate(summary.completion.plannedFinish), label: "Fecha planificada" },
    { value: fmtDate(summary.completion.estimatedFinish), label: "Estimado de cierre", color: estimateColor },
    { value: fmtMoneyOrDash(valorProyecto), label: "Valor $", color: valorProyecto !== null && valorProyecto !== undefined ? (valorProyecto >= 0 ? C.ok : C.bad) : C.disabled },
    { value: roi !== null ? `${Math.round(roi)}%` : "—", label: "ROI", color: roi !== null ? (roi >= 0 ? C.ok : C.bad) : C.disabled },
    { value: payback !== null ? `${payback.toFixed(1)}m` : "—", label: "Payback" },
  ];

  const atrasosMaxH = PAGE_H - MARGIN * 2 - 68 - (KPI_H + 16) - 24 - GANTT_H - 24 - 16;

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
      <GanttSection phases={summary.phases} units={summary.units} estimatedFinish={summary.completion.estimatedFinish} now={now} />

      {/* Atrasos */}
      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, color: C.text, margin: "10px 0 6px" }}>Atrasos</div>
      <AtrasosSection rows={atrasos} maxHeight={atrasosMaxH} />

      {/* Footer */}
      <div style={{ position: "absolute", left: MARGIN, right: MARGIN, bottom: 10, fontSize: 7.5, lineHeight: 1.3, color: C.textMuted, textAlign: "right" }}>
        Generado el {fmtDate(new Date())} · PMO Control Tower
      </div>
    </div>
  );
});

export default ProjectPdfReport;
