"use client";

// <StatusReport> — réplica EXACTA del "Status Ejecutivo PMO" (skill
// `/status-pdf`), portada del renderer HTML de referencia
// (.claude/statusPDF/pmo-status-ejecutivo.md → PMOReport). Una hoja A4
// horizontal (297×210 mm): header + stepper VALOR, 8 KPIs con semáforo, Gantt
// de fases/entregables y tabla de causas de atraso.
//
// Se usa en DOS lugares y en ambos se ve idéntico:
//  · impresión / "Guardar como PDF" → una copia 1:1 montada fuera de pantalla
//    (.status-print-sheet); al imprimir, globals.css la deja como única
//    visible con @page A4 horizontal sin margen (una sola hoja, diseño intacto)
//  · la vista de detalle en /resumen-ejecutivo → escalada al ancho del panel
//    (transform:scale, ver ProjectDetailView) con Responsable/Motivo editables
//
// El CONTENIDO viene del adaptador puro lib/statusReportData.ts (esquema
// data.json de la skill). Este archivo SOLO dibuja. La paleta sale de
// lib/reportTheme.ts (única fuente de verdad, espejo del .py de la skill) — no
// se hardcodean hex aquí.

import { forwardRef, Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  BLUE, BLUE_BG, BOLT_PATH, CARD_BG, CRITICAL, CRITICAL_BG, GOOD, GOOD_BG, GRID, INK, INK_MUTED,
  INK_SEC, NAVY, NEUTRAL, NEUTRAL_BG, NEUTRAL_LINE, SURFACE, TONE, VIOLET, WARNING,
  WARNING_BG, WARNING_FILL, spiTone,
} from "@/lib/reportTheme";
import type { StatusAtraso, StatusBand, StatusPhase, StatusPhaseStatus, StatusReportData } from "@/lib/statusReportData";

// Dimensiones de la hoja (A4 landscape @ 96dpi) — las usa el escalado en pantalla.
export const SHEET_W = (297 * 96) / 25.4; // 1122.52
export const SHEET_H = (210 * 96) / 25.4; //  793.70

// Alto útil para el cuerpo del reporte: 210mm − 9mm (padding sup.) − 7mm (zona
// del footer) − 2mm de aire. Si el contenido real supera esto (muchas fases /
// muchas causas de atraso), <StatusReport> lo reduce con un scale uniforme para
// que TODO quepa en la hoja sin pisar el footer.
const BODY_MAX_PX = (192 * 96) / 25.4; // ≈ 725.7

const RESP_TONE_COLOR: Record<string, string> = { violet: VIOLET, blue: BLUE, neutral: NEUTRAL };
const VALOR_NAMES: Record<StatusBand, string> = { V: "Valuación", A: "Aprobación", L: "Launch", O: "Operación", R: "Revisión" };
const BAND_COLOR: Record<StatusBand, string> = { V: GOOD, A: WARNING_FILL, L: CRITICAL, O: NEUTRAL, R: NEUTRAL };
const MESES_CAP = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_ABR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DAY = 86_400_000;

const parseDate = (s: string): number => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fmtEs = (t: number): string => { const d = new Date(t); return `${String(d.getUTCDate()).padStart(2, "0")} ${MESES_ABR[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const f3 = (n: number) => n.toFixed(3);

function statusColors(status: StatusPhaseStatus): { fill: string; edge: string; track: string } {
  return ({
    done:             { fill: GOOD,         edge: GOOD,         track: "#cdeccd" },
    current:          { fill: WARNING_FILL, edge: WARNING,      track: "#fbe2ad" },
    late:             { fill: CRITICAL,     edge: CRITICAL,     track: "#f3c9c9" },
    pending_progress: { fill: NEUTRAL,      edge: NEUTRAL_LINE, track: "#e6e5e0" },
    pending:          { fill: "none",       edge: NEUTRAL_LINE, track: "#eeeeee" },
    future:           { fill: "none",       edge: BLUE,         track: "#eeeeee" },
  } as const)[status];
}

// ── CSS (espejo exacto del HTML de referencia, scoped bajo .pmo-report) ──
const CSS = `
.pmo-report{
  --good:${GOOD}; --good-bg:${GOOD_BG};
  --warning:${WARNING}; --warning-fill:${WARNING_FILL}; --warning-bg:${WARNING_BG};
  --critical:${CRITICAL}; --critical-bg:${CRITICAL_BG};
  --neutral:${NEUTRAL}; --neutral-bg:${NEUTRAL_BG}; --neutral-line:${NEUTRAL_LINE};
  --future:${BLUE}; --future-bg:${BLUE_BG};
  --ink:${INK}; --ink-sec:${INK_SEC}; --ink-muted:${INK_MUTED};
  --grid:${GRID}; --surface:${SURFACE}; --navy:${NAVY};
  --font:var(--font-inter),'Inter','Helvetica Neue',Arial,sans-serif;
}
.pmo-fit{ width:100%; overflow:hidden; }
.pmo-fit > .pmo-report{ transform-origin:top left; }
.pmo-report{
  position:relative; box-sizing:border-box; overflow:hidden;
  width:297mm; height:210mm; padding:9mm 12mm 7mm 12mm;
  background:var(--surface); color:var(--ink); font-family:var(--font);
  font-size:8.5pt; line-height:normal; font-weight:400; text-align:left;
  hyphens:none; -webkit-font-smoothing:antialiased;
}
.pmo-report *{ box-sizing:border-box; margin:0; padding:0; border:0; font:inherit; color:inherit;
  background:none; list-style:none; text-decoration:none; letter-spacing:normal; }
.pmo-report img{ display:block; max-width:none; }
.pmo-report table{ border-spacing:0; }
/* cuerpo escalable: si el contenido no cabe en la hoja, JS le pone un scale<1 */
.pmo-report .pmo-body{ transform-origin:top center; }

.pmo-report .header{ display:flex; justify-content:space-between; align-items:flex-start;
  padding-bottom:4px; border-bottom:2px solid var(--navy); margin-bottom:12px; }
.pmo-report .header-left-group{ display:flex; align-items:center; gap:12px; }
.pmo-report .logo-pmo{ height:36px; width:auto; flex-shrink:0; }
.pmo-report .header-left{ display:flex; flex-direction:column; gap:0; min-width:0; }
.pmo-report .title-row{ display:flex; align-items:center; gap:9px; line-height:1.1; }
.pmo-report .report-kicker-inline{ font-size:7.6pt; font-weight:700; letter-spacing:1.1px;
  color:var(--ink-muted); text-transform:uppercase; padding-right:9px; border-right:1px solid var(--grid); }
.pmo-report .title-sep{ width:0; height:11.15px; border-left:1px solid var(--grid); flex-shrink:0; }
.pmo-report .proj-id{ font-size:15pt; font-weight:700; color:var(--navy); letter-spacing:.2px; }
.pmo-report .proj-name{ font-size:15pt; font-weight:700; color:var(--ink); }
.pmo-report .bolt{ display:inline-flex; align-items:center; }
.pmo-report .gen-date-inline{ font-size:8pt; color:var(--ink-sec); font-weight:500; margin-left:2px; white-space:nowrap; }
.pmo-report .meta-row{ display:flex; gap:18px; font-size:7.4pt; color:var(--ink-sec);
  margin-top:0; line-height:1.1; flex-wrap:nowrap; white-space:nowrap; }
.pmo-report .meta-row b{ color:var(--ink); font-weight:600; }
.pmo-report .header-right{ text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:3px; flex-shrink:0; }

.pmo-report .valor-steps{ display:flex; align-items:center; }
.pmo-report .vs-step{ display:flex; flex-direction:column; align-items:center; width:46px; }
.pmo-report .vs-dot{ width:16px; height:16px; border-radius:50%; color:#fff; font-weight:700;
  font-size:7pt; display:flex; align-items:center; justify-content:center; margin-bottom:1px; line-height:1; }
.pmo-report .vs-name{ font-size:6.6pt; color:var(--ink-sec); font-weight:600; text-align:center; }
.pmo-report .vs-connector{ height:2px; width:14px; margin:0 -2px 10px -2px; }

.pmo-report .kpi-grid{ display:grid; grid-template-columns:repeat(8,1fr); gap:5px; margin-bottom:11px; }
.pmo-report .kpi{ display:flex; flex-direction:column; background:${CARD_BG}; border:1px solid var(--grid);
  border-radius:7px; overflow:hidden; }
.pmo-report .kpi-bar{ width:100%; height:4px; flex-shrink:0; }
.pmo-report .kpi-body{ padding:6px 8px 7px 8px; flex:1; }
.pmo-report .kpi-label{ font-size:6.1pt; font-weight:700; letter-spacing:.3px; color:var(--ink-muted);
  text-transform:uppercase; margin-bottom:3px; line-height:1.15; }
.pmo-report .kpi-value{ font-size:10.5pt; font-weight:700; line-height:1.1; }
.pmo-report .kpi-sub{ font-size:6.6pt; color:var(--ink-sec); margin-top:3px; font-weight:500; line-height:1.2; }
.pmo-report .kpi-solid{ border:none; }

.pmo-report .section-title{ display:flex; align-items:baseline; gap:8px; margin:0 0 6px 0; }
.pmo-report .section-title h2{ font-size:11pt; font-weight:700; color:var(--navy); margin:0; }
.pmo-report .section-title .hint{ font-size:7.6pt; color:var(--ink-muted); font-weight:500; }
.pmo-report .section-title:after{ content:""; flex:1; border-bottom:1px solid var(--grid); margin-left:4px; }

.pmo-report .gantt{ margin-bottom:11px; border:1px solid var(--grid); border-radius:8px;
  padding:5px 12px 4px 12px; background:#fdfdfc; }
.pmo-report .g-months{ position:relative; height:12px; margin-left:280px; margin-bottom:1px; }
.pmo-report .g-month{ position:absolute; top:0; font-size:5.4pt; color:var(--ink-muted); font-weight:600;
  transform:translateX(1px); border-left:1px solid var(--grid); padding-left:2px; white-space:nowrap; }
.pmo-report .g-rows{ position:relative; }
.pmo-report .g-lines-overlay{ position:absolute; top:0; bottom:0; left:280px; right:0; pointer-events:none; }
.pmo-report .g-vline{ position:absolute; top:0; bottom:0; border-left:1px solid var(--grid); }
.pmo-report .g-todayline{ position:absolute; top:0; bottom:0; border-left:1.6px solid var(--navy); }
.pmo-report .g-planline{ position:absolute; top:0; bottom:0; border-left:1.6px dashed var(--warning); }
.pmo-report .g-row{ display:flex; align-items:center; min-height:13.5px; border-top:1px solid #f1f0ec; padding:1.5px 0; }
.pmo-report .g-row:first-child{ border-top:none; }
.pmo-report .g-label{ width:280px; flex-shrink:0; display:flex; align-items:center; gap:5px; padding-right:6px; }
.pmo-report .g-name{ font-size:7.9pt; line-height:1.15; white-space:normal; word-break:break-word; overflow:hidden;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; max-height:2.35em; min-width:0; }
.pmo-report .band-chip{ width:6px; height:6px; border-radius:2px; flex-shrink:0; margin-top:2px; align-self:flex-start; }
.pmo-report .g-state{ font-size:5.6pt; font-weight:700; padding:1px 7px; border-radius:7px;
  text-transform:uppercase; letter-spacing:.15px; margin-left:auto; margin-right:2px; white-space:nowrap; flex-shrink:0; }
.pmo-report .state-done{ background:var(--good-bg); color:var(--good); }
.pmo-report .state-current{ background:var(--warning-bg); color:var(--warning); }
.pmo-report .state-late{ background:var(--critical-bg); color:var(--critical); }
.pmo-report .state-pending{ background:var(--neutral-bg); color:var(--ink-muted); }
.pmo-report .state-future{ background:var(--future-bg); color:var(--future); }
.pmo-report .g-chart{ position:relative; flex:1; height:12px; }
.pmo-report .g-track{ position:absolute; left:0; right:0; top:50%; height:1px; background:var(--grid); }
.pmo-report .g-bar{ position:absolute; top:1px; height:10px; border-radius:5px; overflow:hidden; }
.pmo-report .g-fill{ height:100%; border-radius:5px 0 0 5px; }
.pmo-report .g-overdue{ position:absolute; top:1px; height:10px; border-radius:0 5px 5px 0;
  background:repeating-linear-gradient(45deg,${CRITICAL},${CRITICAL} 2.2px,#f7d2d2 2.2px,#f7d2d2 4.4px);
  border:1.4px solid var(--critical); border-left:none; }
.pmo-report .g-milestone{ position:absolute; top:-1px; width:12px; height:12px;
  border:2px solid var(--neutral-line); transform:rotate(45deg); border-radius:2px; }

.pmo-report .gantt-legend{ display:flex; gap:13px; margin-top:3px; padding-top:3px;
  border-top:1px solid var(--grid); flex-wrap:wrap; }
.pmo-report .legend-item{ display:flex; align-items:center; gap:5px; font-size:7.2pt;
  color:var(--ink-sec); font-weight:500; }
.pmo-report .legend-swatch{ width:11px; height:8px; border-radius:3px; flex-shrink:0; }
.pmo-report .legend-line{ width:14px; height:0; border-top:1.6px solid var(--navy); }
.pmo-report .legend-line-dashed{ width:14px; height:0; border-top:1.6px dashed var(--warning); }
.pmo-report .legend-diamond{ width:8px; height:8px; background:#fff; border:1.8px solid var(--neutral-line);
  transform:rotate(45deg); border-radius:1px; }

.pmo-report .bottom-grid{ display:grid; grid-template-columns:2.6fr 0.6fr; gap:16px; align-items:start; }
.pmo-report table.atrasos{ width:100%; border-collapse:collapse; }
.pmo-report table.atrasos thead th{ text-align:left; font-size:6.9pt; text-transform:uppercase;
  letter-spacing:.4px; color:var(--ink-muted); font-weight:700; padding:0 8px 6px 8px;
  border-bottom:1.4px solid var(--navy); }
.pmo-report table.atrasos tbody td{ padding:3px 8px; border-bottom:1px solid var(--grid);
  vertical-align:top; font-size:7.6pt; }
.pmo-report table.atrasos tbody tr:last-child td{ border-bottom:none; }
.pmo-report .hito-name{ font-weight:700; color:var(--ink); }
.pmo-report .hito-meta{ font-size:6.9pt; color:var(--ink-muted); margin-top:1px; }
.pmo-report .pill-dias{ background:var(--critical-bg); color:var(--critical); font-weight:700;
  font-size:7.6pt; padding:2px 8px; border-radius:10px; white-space:nowrap; display:inline-block; }
.pmo-report table.atrasos .c-dias{ white-space:nowrap; }
.pmo-report .pill-resp{ font-size:7.4pt; font-weight:700; padding:2px 8px; border-radius:10px; white-space:nowrap; display:inline-block; }
.pmo-report select.pill-resp{ cursor:pointer; -webkit-appearance:none; appearance:none; }
.pmo-report .resp-stack{ display:flex; flex-direction:column; gap:2px; align-items:flex-start; }
.pmo-report .reparto-edit{ display:flex; flex-direction:column; gap:2px; align-items:flex-start; }
.pmo-report .reparto-line{ display:flex; align-items:center; gap:3px; flex-wrap:nowrap; white-space:nowrap; }
.pmo-report .reparto-dias{ font:inherit; font-size:7.2pt; font-weight:700; padding:1px 3px 1px 5px;
  border:1px solid var(--neutral-line); border-radius:6px; background:#fff; color:var(--ink);
  cursor:pointer; -webkit-appearance:none; appearance:none; }
.pmo-report .reparto-x{ font-size:6.6pt; color:var(--ink-muted); }
.pmo-report .reparto-rm{ border:0; background:none; color:var(--ink-muted); font-size:9pt;
  line-height:1; padding:0 2px; cursor:pointer; }
.pmo-report .reparto-rm:hover{ color:var(--critical); }
.pmo-report .reparto-pending-role{ color:var(--ink-muted); font-weight:500;
  background:#fff; border:1px dashed var(--neutral-line); }
.pmo-report .reparto-foot{ font-size:6.4pt; font-weight:700; margin-top:1px; }
.pmo-report .reparto-foot.ok{ color:var(--good); }
.pmo-report .reparto-foot.rem{ color:var(--critical); }
.pmo-report .c-motivo{ color:var(--ink-sec); line-height:1.35; white-space:pre-wrap; word-break:break-word; }
.pmo-report .c-motivo-input{ display:block; width:100%; color:var(--ink-sec); line-height:1.35; font-size:7.6pt;
  background:none; border:0; outline:0; resize:none; font-family:inherit;
  white-space:pre-wrap; word-break:break-word; overflow:hidden; min-height:1.35em; }
.pmo-report .c-motivo-input:focus{ background:#fffdf3; box-shadow:0 0 0 1px var(--warning-fill); border-radius:3px; }
.pmo-report .c-acargo{ color:var(--ink-sec); white-space:nowrap; }
.pmo-report .side-card{ border:1px solid var(--grid); border-radius:8px; padding:6px 12px; background:${CARD_BG}; }
.pmo-report .side-card h3{ font-size:8.6pt; margin:0 0 8px 0; color:var(--navy); font-weight:700; }
.pmo-report .dist-legend{ display:flex; flex-direction:column; gap:6px; margin-top:2px; }
.pmo-report .dist-legend-item{ font-size:7.8pt; color:var(--ink-sec); font-weight:500;
  display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
.pmo-report .dist-legend-item b{ color:var(--critical); font-weight:700; font-size:8.4pt;
  font-variant-numeric:tabular-nums; }

.pmo-report .pmo-footer{ position:absolute; left:12mm; right:12mm; bottom:0; height:7mm;
  display:flex; align-items:center; justify-content:space-between;
  font-size:7.2pt; color:var(--ink-muted); }
`;

// ── sub-render ─────────────────────────────────────────────────────────
function ValorSteps({ data }: { data: StatusReportData }) {
  const order: StatusBand[] = ["V", "A", "L", "O", "R"];
  const late = new Set(data.late_bands);
  const idxCurrent = order.indexOf(data.current_band);
  return (
    <div className="valor-steps">
      {order.map((s, i) => {
        const done = i < idxCurrent;
        const current = i === idxCurrent;
        const bg = done ? GOOD : current ? WARNING_FILL : NEUTRAL_BG;
        const fg = done || current ? "#ffffff" : INK_MUTED;
        const isLate = late.has(s);
        const border = isLate ? `2.2px solid ${CRITICAL}` : !done && !current ? `1px solid ${NEUTRAL_LINE}` : undefined;
        return (
          <Fragment key={s}>
            <div className="vs-step">
              <div className="vs-dot" style={{ background: bg, color: fg, border }}>{s}</div>
              <div className="vs-name" style={isLate ? { color: CRITICAL, fontWeight: 700 } : undefined}>{VALOR_NAMES[s]}</div>
            </div>
            {i < order.length - 1 && (
              <div className="vs-connector" style={{ background: i < idxCurrent ? GOOD : NEUTRAL_LINE }} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function Kpis({ data }: { data: StatusReportData }) {
  const spi = data.spi;
  const cards = [
    { label: "AVANCE vs PLAN", value: `${data.avance_real} / ${data.avance_plan}`, sub: spi != null ? `SPI ${spi.toFixed(2)}` : "", tone: spiTone(spi) },
    { label: "SALUD (EVM)", value: data.salud_pct, sub: data.salud_estado, tone: data.salud_tone, solid: true },
    { label: "ATRASO ACTUAL", value: data.atraso_valor, sub: "", tone: data.atraso_tone },
    { label: "FECHA CIERRE PLAN", value: data.fecha_cierre_plan, sub: "", tone: "neutral" as const },
    { label: "CIERRE ESTIMADO", value: data.cierre_estimado, sub: data.cierre_estimado_sub, tone: data.cierre_estimado_tone },
    { label: "VALOR GENERADO", value: data.valor_generado, sub: "", tone: "good" as const },
    { label: "ROI", value: data.roi, sub: data.roi_sub, tone: "good" as const },
    { label: "PAYBACK", value: data.payback, sub: "", tone: "neutral" as const },
  ];
  return (
    <div className="kpi-grid">
      {cards.map((k, i) => {
        const t = TONE[k.tone];
        if ("solid" in k && k.solid) {
          return (
            <div key={i} className="kpi kpi-solid" style={{ background: t.fg }}>
              <div className="kpi-body">
                <div className="kpi-label" style={{ color: "#ffffffcc" }}>{k.label}</div>
                <div className="kpi-value" style={{ color: "#ffffff" }}>{k.value}</div>
                {k.sub && <div className="kpi-sub" style={{ color: "#ffffffe0" }}>{k.sub}</div>}
              </div>
            </div>
          );
        }
        return (
          <div key={i} className="kpi" style={{ background: t.bg, borderColor: `${t.fg}55` }}>
            <div className="kpi-bar" style={{ background: t.fg }} />
            <div className="kpi-body">
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value" style={{ color: k.tone !== "neutral" ? t.fg : INK }}>{k.value}</div>
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GanttRow({ r, pct, today }: { r: StatusPhase; pct: (t: number) => number; today: number }) {
  // Sangría reducida a propósito: el color/peso de fuente (nameStyle) ya
  // distingue entregable de fase, así que el "tab" solo necesita un guiño,
  // no 22px — se recupera ese ancho para el nombre.
  const indentPx = 10 * r.indent;
  const nameStyle: React.CSSProperties = r.bold ? { fontWeight: 600 } : { fontWeight: 400, color: INK_SEC };
  const stateCls = `state-${r.status.split("_")[0]}`;

  let chart: ReactNode;
  if (r.milestone) {
    const left = pct(parseDate(r.milestone));
    const col = statusColors(r.status);
    const filled = col.fill !== "none";
    chart = (
      <>
        <div className="g-track" />
        <div
          className="g-milestone"
          style={{ left: `calc(${f3(left)}% - 6px)`, background: filled ? col.fill : SURFACE, borderColor: col.edge }}
        />
      </>
    );
  } else {
    const start = parseDate(r.start!);
    const due = parseDate(r.due!);
    const left = pct(start);
    const width = Math.max(pct(due) - left, 0.6);
    const col = statusColors(r.status);
    const fillPct = width ? (width * Math.min(r.progress ?? 0, 1)) / width * 100 : 0;
    const overdue = r.status === "late" && today > due
      ? <div className="g-overdue" style={{ left: `${f3(pct(due))}%`, width: `${f3(Math.max(pct(today) - pct(due), 0.5))}%` }} />
      : null;
    chart = (
      <>
        <div className="g-track" />
        <div className="g-bar" style={{ left: `${f3(left)}%`, width: `${f3(width)}%`, background: col.track, border: col.edge === "none" ? "none" : `1.4px solid ${col.edge}` }}>
          <div className="g-fill" style={{ width: `${fillPct.toFixed(2)}%`, background: col.fill }} />
        </div>
        {overdue}
      </>
    );
  }

  return (
    <div className="g-row">
      <div className="g-label" style={{ paddingLeft: 10 + indentPx }}>
        {r.indent === 0 && r.band && <span className="band-chip" style={{ background: BAND_COLOR[r.band] }} />}
        <span className="g-name" style={nameStyle}>{r.name}</span>
        <span className={`g-state ${stateCls}`}>{r.state}</span>
      </div>
      <div className="g-chart">{chart}</div>
    </div>
  );
}

/** Celda "Responsable" estática (PDF / impresión): una pill por tramo del
 *  reparto, `N d · Rol`, apiladas. Sin tramos → "Sin asignar" en gris. */
function RepartoPills({ reparto }: { reparto: StatusAtraso["reparto"] }) {
  if (reparto.length === 0) {
    return <span className="pill-resp" style={{ background: `${NEUTRAL}15`, color: NEUTRAL, border: `1px solid ${NEUTRAL}55` }}>Sin asignar</span>;
  }
  return (
    <div className="resp-stack">
      {reparto.map((r, i) => {
        const c = RESP_TONE_COLOR[r.tone] ?? r.tone;
        return (
          <span key={i} className="pill-resp" style={{ background: `${c}15`, color: c, border: `1px solid ${c}55` }}>
            {r.dias > 0 ? `${r.dias} d · ${r.resp}` : r.resp}
          </span>
        );
      })}
    </div>
  );
}

function AtrasoRows({ data, renderResp, renderMotivo }: {
  data: StatusReportData;
  renderResp?: (a: StatusAtraso, i: number) => ReactNode;
  renderMotivo?: (a: StatusAtraso, i: number) => ReactNode;
}) {
  if (data.atrasos.length === 0) {
    return <tr><td colSpan={5} style={{ color: GOOD, fontWeight: 600 }}>Sin atrasos 🎉</td></tr>;
  }
  return (
    <>
      {data.atrasos.map((a, i) => (
        <tr key={a.id}>
          <td>
            <div className="hito-name">{a.hito}</div>
            <div className="hito-meta">{a.actividades} · comprometido {a.fecha}</div>
          </td>
          <td className="c-acargo">{a.acargo}</td>
          <td className="c-dias"><span className="pill-dias">{a.dias}</span></td>
          <td>{renderResp ? renderResp(a, i) : <RepartoPills reparto={a.reparto} />}</td>
          <td className="c-motivo">{renderMotivo ? renderMotivo(a, i) : a.motivo}</td>
        </tr>
      ))}
    </>
  );
}

// ── componente ────────────────────────────────────────────────────────
export interface StatusReportProps {
  data: StatusReportData;
  /** vista en pantalla: control editable en la celda "Responsable" de un atraso. */
  renderResp?: (atraso: StatusAtraso, index: number) => ReactNode;
  /** vista en pantalla: control editable en la celda "Motivo". */
  renderMotivo?: (atraso: StatusAtraso, index: number) => ReactNode;
}

const StatusReport = forwardRef<HTMLDivElement, StatusReportProps>(function StatusReport(
  { data, renderResp, renderMotivo }, ref,
) {
  // Auto-ajuste vertical: si el contenido (fases + causas de atraso) no cabe en
  // la hoja, se reduce con un scale uniforme para que TODO se vea y no pise el
  // footer. Se re-mide si el contenido cambia de alto (p. ej. al editar Motivo).
  const bodyRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      const h = el.scrollHeight; // alto de layout — el transform:scale no lo altera
      setFit(h > BODY_MAX_PX ? Math.max(BODY_MAX_PX / h, 0.62) : 1);
    };
    measure();
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); });
    ro.observe(el);
    const fonts = document.fonts;
    if (fonts && fonts.status !== "loaded") fonts.ready.then(measure).catch(() => {});
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [data]);

  const tlStart = parseDate(data.timeline_start);
  const tlEnd = parseDate(data.timeline_end);
  const tlDays = (tlEnd - tlStart) / DAY;
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - tlStart) / DAY) / tlDays * 100));
  const today = parseDate(data.today);
  const planDate = parseDate(data.plan_date);

  const months: { x: number; label: string }[] = [];
  let m = Date.UTC(new Date(tlStart).getUTCFullYear(), new Date(tlStart).getUTCMonth(), 1);
  while (m < tlEnd) {
    const md = new Date(m);
    months.push({ x: pct(m), label: `${MESES_CAP[md.getUTCMonth()]} ${String(md.getUTCFullYear()).slice(2)}` });
    m = md.getUTCMonth() === 11 ? Date.UTC(md.getUTCFullYear() + 1, 0, 1) : Date.UTC(md.getUTCFullYear(), md.getUTCMonth() + 1, 1);
  }

  return (
    <div className="pmo-report" ref={ref}>
      {/* React 19 hoista y deduplica <style> con href+precedence → un solo tag en <head> */}
      <style href="pmo-status-report" precedence="default">{CSS}</style>

      <div className="pmo-body" ref={bodyRef} style={fit < 1 ? { transform: `scale(${f3(fit)})` } : undefined}>
        <div className="header">
          <div className="header-left-group">
            <img className="logo-pmo" src="/pmo-logo.png" alt="PMO" crossOrigin="anonymous" />
            <div className="header-left">
              <div className="title-row">
                <span className="report-kicker-inline">Status Card</span>
                <span className="title-sep" />
                <span className="proj-id">{data.project.id}</span>
                <span className="proj-name">{data.project.name}</span>
                <span className="bolt">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill={WARNING_FILL} xmlns="http://www.w3.org/2000/svg"><path d={BOLT_PATH} /></svg>
                </span>
                <span className="gen-date-inline">Generado el {fmtEs(today)}</span>
              </div>
              <div className="meta-row">
                <span>PM: <b>{data.project.pm}</b></span>
                <span>Sponsor: <b>{data.project.sponsor}</b></span>
                <span>CKU: <b>{data.project.cku}</b></span>
                <span>Estrategia: <b>{data.project.estrategia}</b></span>
              </div>
            </div>
          </div>
          <div className="header-right"><ValorSteps data={data} /></div>
        </div>

        <Kpis data={data} />

        <div className="section-title"><h2>Línea de tiempo del proyecto</h2><span className="hint">{data.timeline_hint}</span></div>
        <div className="gantt">
          <div className="g-months">
            {months.map((mm, i) => <div key={i} className="g-month" style={{ left: `${f3(mm.x)}%` }}><span>{mm.label}</span></div>)}
          </div>
          <div className="g-rows">
            <div className="g-lines-overlay">
              {months.map((mm, i) => <div key={i} className="g-vline" style={{ left: `${f3(mm.x)}%` }} />)}
              <div className="g-todayline" style={{ left: `${f3(pct(today))}%` }} />
              <div className="g-planline" style={{ left: `${f3(pct(planDate))}%` }} />
            </div>
            {data.phases.map((r, i) => <GanttRow key={i} r={r} pct={pct} today={today} />)}
          </div>
          <div className="gantt-legend">
            <span className="legend-item"><span className="legend-swatch" style={{ background: GOOD }} />Completada</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: WARNING_FILL }} />En curso</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: CRITICAL }} />Atrasada (rayado = días de sobre-tiempo)</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: "#fff", border: `1.4px solid ${NEUTRAL_LINE}` }} />Pendiente</span>
            <span className="legend-item"><span className="legend-diamond" />Hito</span>
            <span className="legend-item"><span className="legend-line" />Hoy · {fmtEs(today)}</span>
            <span className="legend-item"><span className="legend-line-dashed" />Fecha planificada · {fmtEs(planDate)}</span>
          </div>
        </div>

        <div className="section-title"><h2>Causas de atraso</h2></div>
        <div className="bottom-grid">
          <table className="atrasos">
            <thead>
              <tr>
                <th style={{ width: "21%" }}>Entregable</th>
                <th style={{ width: "12%" }}>A cargo</th>
                <th style={{ width: "9%" }}>Atraso</th>
                <th style={{ width: "23%" }}>Responsable</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody><AtrasoRows data={data} renderResp={renderResp} renderMotivo={renderMotivo} /></tbody>
          </table>
          <div className="side-card">
            <h3>Distribución de responsabilidad</h3>
            <div className="dist-legend">
              {data.resp_dist.map((d, i) => (
                <span key={i} className="dist-legend-item"><span>{d.label}</span><b>{d.value}%</b></span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="pmo-footer"><span>{data.footer_left}</span><span>{data.footer_right}</span></div>
    </div>
  );
});

export default StatusReport;

/** Devuelve el color hex efectivo de un `resp_tone` (slot o hex directo) — para
 *  los controles editables de la vista en pantalla. */
export function respToneColor(tone: string): string {
  return RESP_TONE_COLOR[tone] ?? tone;
}
