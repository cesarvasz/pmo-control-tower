"use client";

import { fmtDate, fmtMoney } from "@/lib/business";
import { calcVem, healthStatusFromIndex } from "@/lib/process";
import type { ProjBoard, ProjItem } from "@/types";

interface Props {
  board: ProjBoard;
  items: ProjItem[];
  ev: number;
  pv: number;
  ac: number;
  scope: number | null;
  spi: number | null;
  cpi: number | null;
  onClose: () => void;
}

interface Metrics {
  spi: number | null;
  cpi: number | null;
  scope: number | null;
  healthIndex: number | null;
  healthStatus: "on-track" | "in-risk" | "off-track" | null;
  done: number;
  working: number;
  future: number;
  atrasados: number;
  paraHoy: number;
  totalCost: number;
  totalBenefit: number;
  groupOrder: string[];
  groupMap: Map<string, ProjItem[]>;
  criticalItems: ProjItem[];
}

function computeMetrics(items: ProjItem[], ev: number, pv: number, ac: number, scope: number | null, spi: number | null, cpi: number | null): Metrics {
  // scope viene en 0–100 → fracción 0–1 para el VEM (fuente única).
  const healthIndex = calcVem(spi, cpi, scope !== null ? scope / 100 : null);
  const healthStatus: Metrics["healthStatus"] = healthStatusFromIndex(healthIndex);

  const done    = items.filter((r) => r.status === "Done").length;
  const working = items.filter((r) => r.status === "Working on it").length;
  const future  = items.filter((r) => r.status === "Future Steps").length;
  const atrasados = items.filter((r) => r.estado === "ATRASADO").length;
  const paraHoy   = items.filter((r) => r.estado === "PARA HOY").length;

  const totalCost    = items.reduce((s, r) => s + r.cost, 0);
  const totalBenefit = items.reduce((s, r) => s + r.benefit, 0);

  const groupOrder: string[] = [];
  const groupMap = new Map<string, ProjItem[]>();
  items.forEach((r) => {
    if (!groupMap.has(r.grupo)) { groupOrder.push(r.grupo); groupMap.set(r.grupo, []); }
    groupMap.get(r.grupo)!.push(r);
  });

  const criticalItems = items
    .filter((r) => r.estado === "ATRASADO" || r.estado === "PARA HOY")
    .sort((a, b) => {
      if (a.estado === "ATRASADO" && b.estado !== "ATRASADO") return -1;
      if (b.estado === "ATRASADO" && a.estado !== "ATRASADO") return 1;
      return 0;
    });

  return { spi, cpi, scope, healthIndex, healthStatus, done, working, future, atrasados, paraHoy, totalCost, totalBenefit, groupOrder, groupMap, criticalItems };
}

const HC = {
  "on-track":  { color: "#10b981", label: "On Track",  icon: "✓", desc: "El proyecto está dentro de los parámetros esperados de tiempo y costo." },
  "in-risk":   { color: "#f59e0b", label: "In Risk",   icon: "⚠", desc: "El proyecto presenta desviaciones menores. Se recomienda atención preventiva." },
  "off-track": { color: "#ef4444", label: "Off Track", icon: "✕", desc: "El proyecto tiene desviaciones significativas. Se requiere acción correctiva inmediata." },
} as const;

export default function ProjectReportModal({ board, items, ev, pv, ac, scope, spi, cpi, onClose }: Props) {
  const m   = computeMetrics(items, ev, pv, ac, scope, spi, cpi);
  const hc  = m.healthStatus ? HC[m.healthStatus] : null;
  const today = new Date().toLocaleDateString("es-CR", { year: "numeric", month: "long", day: "numeric" });

  const handlePDF = () => {
    const html = buildPrintHTML(board, items, ev, pv, ac, scope, m, today);
    const win = window.open("", "_blank", "width=900,height=750");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="flex shrink-0 items-start justify-between border-b px-6 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <div className="text-[0.68rem] uppercase tracking-widest text-[var(--text-muted)]">
              Informe de Proyecto · {today}
            </div>
            <div className="mt-0.5 text-[1.1rem] font-bold text-[var(--text-primary)]">{board.name}</div>
            {board.pm && (
              <div className="text-[0.78rem] text-[var(--text-secondary)]">PM: {board.pm}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePDF}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[0.73rem] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
              style={{ borderColor: "var(--border)", color: "var(--accent)" }}
            >
              ↓ Descargar PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-lg px-2 py-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">

          {/* EVM Health Index */}
          <div className="rounded-xl p-5 text-center" style={{ background: "var(--bg-hover)" }}>
            {hc && m.healthIndex !== null ? (
              <>
                <div className="text-[0.63rem] uppercase tracking-widest text-[var(--text-muted)]">Health Index EVM</div>
                <div
                  className="mt-1 text-[3.2rem] font-extrabold tabular-nums leading-none"
                  style={{ color: hc.color }}
                >
                  {m.healthIndex.toFixed(2)}
                </div>
                <span
                  className="mt-2 inline-block rounded-full px-4 py-1 text-[0.83rem] font-bold"
                  style={{ color: hc.color, background: hc.color + "22" }}
                >
                  {hc.icon} {hc.label}
                </span>
                <div className="mt-2 text-[0.72rem] text-[var(--text-muted)]">{hc.desc}</div>
              </>
            ) : (
              <div className="text-[0.82rem] text-[var(--text-muted)]">
                Sin datos EVM suficientes para calcular el índice de salud.
              </div>
            )}
          </div>

          {/* SPI / CPI / Scope */}
          <div>
            <SectionLabel>Métricas EVM</SectionLabel>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  { label: "SPI", value: m.spi,                            fmt: (v: number) => v.toFixed(2) },
                  { label: "CPI", value: m.cpi,                            fmt: (v: number) => v.toFixed(2) },
                  { label: "Scope", value: m.scope !== null ? m.scope / 100 : null, fmt: (v: number) => `${Math.round(v * 100)}%` },
                ] as { label: string; value: number | null; fmt: (v: number) => string }[]
              ).map(({ label, value, fmt }) => {
                const color =
                  value === null ? "var(--text-muted)"
                  : value >= 1   ? "#10b981"
                  : value >= 0.85 ? "#f59e0b"
                  : "#ef4444";
                const sub =
                  value === null   ? "Sin datos"
                  : value >= 1     ? "Óptimo"
                  : value >= 0.85  ? "En riesgo"
                  : "Crítico";
                return (
                  <div key={label} className="rounded-lg p-3 text-center" style={{ background: "var(--bg-hover)" }}>
                    <div className="text-[0.63rem] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
                    <div className="mt-1 text-[1.65rem] font-bold tabular-nums leading-none" style={{ color }}>
                      {value !== null ? fmt(value) : "—"}
                    </div>
                    <div className="mt-0.5 text-[0.6rem]" style={{ color }}>{sub}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* EV / PV / AC */}
          <div>
            <SectionLabel>Valores EVM</SectionLabel>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "EV · Valor Ganado",   value: ev, color: "#10b981" },
                { label: "PV · Valor Planificado", value: pv, color: "#f59e0b" },
                { label: "AC · Costo Real",     value: ac, color: "#94a3b8" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg p-3" style={{ background: "var(--bg-hover)" }}>
                  <div className="text-[0.6rem] leading-tight text-[var(--text-muted)]">{label}</div>
                  <div className="mt-1 text-[0.92rem] font-bold tabular-nums" style={{ color }}>
                    {value ? fmtMoney(value) : "$0"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Task Summary */}
          <div>
            <SectionLabel>Resumen de Tareas</SectionLabel>
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
              <div className="grid grid-cols-4 divide-x" style={{ borderColor: "var(--border)" }}>
                {[
                  { label: "Total",       value: items.length, color: "var(--text-primary)" },
                  { label: "Completadas", value: m.done,       color: "#10b981" },
                  { label: "En Progreso", value: m.working,    color: "#f59e0b" },
                  { label: "Pendientes",  value: m.future,     color: "var(--text-muted)" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-3 text-center">
                    <div className="text-[0.6rem] text-[var(--text-muted)]">{label}</div>
                    <div className="text-[1.4rem] font-bold" style={{ color }}>{value}</div>
                  </div>
                ))}
              </div>
              {(m.atrasados > 0 || m.paraHoy > 0) && (
                <div
                  className="flex gap-4 border-t px-4 py-2 text-[0.73rem]"
                  style={{ borderColor: "var(--border)" }}
                >
                  {m.atrasados > 0 && <span style={{ color: "#ef4444" }}>✕ {m.atrasados} Off Track</span>}
                  {m.paraHoy   > 0 && <span style={{ color: "#f59e0b" }}>⚠ {m.paraHoy} In Risk</span>}
                </div>
              )}
            </div>
          </div>

          {/* Critical Items */}
          {m.criticalItems.length > 0 && (
            <div>
              <SectionLabel>Tareas Críticas</SectionLabel>
              <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
                {m.criticalItems.map((r, i) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 px-4 py-2.5 text-[0.78rem]"
                    style={{
                      borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                      borderLeft: `3px solid ${r.estado === "ATRASADO" ? "#ef4444" : "#f59e0b"}`,
                    }}
                  >
                    <span style={{ color: r.estado === "ATRASADO" ? "#ef4444" : "#f59e0b", fontWeight: 700 }}>
                      {r.estado === "ATRASADO" ? "✕" : "⚠"}
                    </span>
                    <span className="flex-1 font-medium text-[var(--text-primary)]">{r.name}</span>
                    <span className="text-[0.67rem] text-[var(--text-muted)]">{r.grupo}</span>
                    {r.deadline && (
                      <span
                        className="text-[0.67rem] font-semibold"
                        style={{ color: r.estado === "ATRASADO" ? "#ef4444" : "#f59e0b" }}
                      >
                        {fmtDate(r.deadline)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Groups Breakdown */}
          <div>
            <SectionLabel>Desglose por Grupo</SectionLabel>
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
              {m.groupOrder.map((grupo, i) => {
                const gItems     = m.groupMap.get(grupo)!;
                const gDone      = gItems.filter((r) => r.status === "Done").length;
                const gAtrasados = gItems.filter((r) => r.estado === "ATRASADO").length;
                const gParaHoy   = gItems.filter((r) => r.estado === "PARA HOY").length;
                const pct        = Math.round((gDone / gItems.length) * 100);
                return (
                  <div
                    key={grupo}
                    className="flex items-center gap-3 px-4 py-2.5"
                    style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}
                  >
                    <span className="flex-1 text-[0.78rem] font-medium text-[var(--text-primary)]">
                      {grupo || "Sin grupo"}
                    </span>
                    <span className="text-[0.68rem] text-[var(--text-muted)]">{gItems.length} tareas</span>
                    <span className="text-[0.68rem] font-semibold" style={{ color: "#10b981" }}>{pct}% done</span>
                    {gAtrasados > 0 && (
                      <span className="text-[0.68rem] font-semibold" style={{ color: "#ef4444" }}>✕ {gAtrasados}</span>
                    )}
                    {gParaHoy > 0 && (
                      <span className="text-[0.68rem] font-semibold" style={{ color: "#f59e0b" }}>⚠ {gParaHoy}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Financial */}
          <div>
            <SectionLabel>Situación Financiera</SectionLabel>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Costo Total",    value: m.totalCost,    color: "#ef4444" },
                { label: "Beneficio Total", value: m.totalBenefit, color: "#10b981" },
                {
                  label: "Valor Neto",
                  value: m.totalBenefit - m.totalCost,
                  color: m.totalBenefit - m.totalCost >= 0 ? "#10b981" : "#ef4444",
                },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg p-3 text-center" style={{ background: "var(--bg-hover)" }}>
                  <div className="text-[0.6rem] text-[var(--text-muted)]">{label}</div>
                  <div className="mt-1 text-[0.95rem] font-bold tabular-nums" style={{ color }}>
                    {value ? fmtMoney(value) : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[0.67rem] font-bold uppercase tracking-widest text-[var(--text-muted)]">
      {children}
    </div>
  );
}

// ── PDF / Print HTML ───────────────────────────────────────────────────────────

function buildPrintHTML(
  board: ProjBoard,
  items: ProjItem[],
  ev: number,
  pv: number,
  ac: number,
  scope: number | null,
  m: Metrics,
  today: string,
): string {
  const hc = m.healthStatus ? HC[m.healthStatus] : null;
  const pct = (v: number | null) => (v !== null ? `${Math.round(v * 100)}%` : "—");
  const metric = (v: number | null) => (v !== null ? v.toFixed(2) : "—");
  const metricColor = (v: number | null) =>
    v === null ? "#6b7280" : v >= 1 ? "#10b981" : v >= 0.85 ? "#f59e0b" : "#ef4444";

  const criticalRows = m.criticalItems
    .map(
      (r) => `
      <tr>
        <td style="color:${r.estado === "ATRASADO" ? "#ef4444" : "#f59e0b"};font-weight:700;width:20px">
          ${r.estado === "ATRASADO" ? "✕" : "⚠"}
        </td>
        <td style="font-weight:500">${r.name}</td>
        <td style="color:#6b7280;font-size:11px">${r.grupo}</td>
        <td style="color:${r.estado === "ATRASADO" ? "#ef4444" : "#f59e0b"};font-size:11px;white-space:nowrap">
          ${r.deadline ? fmtDate(r.deadline) : "—"}
        </td>
      </tr>`,
    )
    .join("");

  const groupRows = m.groupOrder
    .map((grupo) => {
      const gItems     = m.groupMap.get(grupo)!;
      const gDone      = gItems.filter((r) => r.status === "Done").length;
      const gAtrasados = gItems.filter((r) => r.estado === "ATRASADO").length;
      const gParaHoy   = gItems.filter((r) => r.estado === "PARA HOY").length;
      const gpct       = Math.round((gDone / gItems.length) * 100);
      return `
      <tr>
        <td style="font-weight:500">${grupo || "Sin grupo"}</td>
        <td style="text-align:center;color:#6b7280">${gItems.length}</td>
        <td style="text-align:center;color:#10b981;font-weight:600">${gpct}%</td>
        <td style="text-align:center;color:#ef4444;font-weight:600">${gAtrasados > 0 ? `✕ ${gAtrasados}` : "—"}</td>
        <td style="text-align:center;color:#f59e0b;font-weight:600">${gParaHoy > 0 ? `⚠ ${gParaHoy}` : "—"}</td>
      </tr>`;
    })
    .join("");

  const netColor = m.totalBenefit - m.totalCost >= 0 ? "#10b981" : "#ef4444";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Informe – ${board.name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2937; background: #fff; padding: 32px 40px; font-size: 13px; }
  h1 { font-size: 20px; font-weight: 800; color: #111827; }
  h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 10px; margin-top: 24px; }
  .meta { color: #6b7280; font-size: 11px; margin-top: 2px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #f3f4f6; padding-bottom: 14px; margin-bottom: 4px; }
  .badge { display: inline-block; border-radius: 999px; padding: 4px 14px; font-size: 13px; font-weight: 700; }
  .health-block { background: #f9fafb; border-radius: 12px; padding: 20px; text-align: center; margin-top: 16px; }
  .health-num { font-size: 52px; font-weight: 900; line-height: 1; }
  .health-desc { color: #6b7280; font-size: 11px; margin-top: 6px; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .card { background: #f9fafb; border-radius: 10px; padding: 12px; }
  .card-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; }
  .card-val { font-size: 22px; font-weight: 800; margin-top: 2px; }
  .card-sub { font-size: 10px; margin-top: 2px; }
  .card-sm .card-val { font-size: 15px; }
  table { width: 100%; border-collapse: collapse; margin-top: 0; }
  td, th { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
  th { background: #f9fafb; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
  .divider { height: 1px; background: #f3f4f6; margin: 20px 0; }
  @media print {
    body { padding: 20px 28px; }
    @page { margin: 1.2cm; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div>
    <div class="meta">Informe de Proyecto · ${today}</div>
    <h1>${board.name}</h1>
    ${board.pm ? `<div class="meta" style="margin-top:3px">PM: ${board.pm}</div>` : ""}
  </div>
  <div style="text-align:right">
    ${hc ? `<span class="badge" style="color:${hc.color};background:${hc.color}22">${hc.icon} ${hc.label}</span>` : ""}
    <div class="meta" style="margin-top:6px">${items.length} tareas · ${m.done} completadas</div>
  </div>
</div>

<!-- Health Index -->
<div class="health-block">
  <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af">Health Index EVM</div>
  ${
    hc && m.healthIndex !== null
      ? `<div class="health-num" style="color:${hc.color}">${m.healthIndex.toFixed(2)}</div>
         <span class="badge" style="color:${hc.color};background:${hc.color}22;margin-top:8px;display:inline-block">${hc.icon} ${hc.label}</span>
         <div class="health-desc">${hc.desc}</div>`
      : `<div class="health-desc" style="margin-top:10px">Sin datos EVM suficientes para calcular el índice de salud.</div>`
  }
</div>

<!-- EVM Metrics -->
<h2>Métricas EVM</h2>
<div class="grid3">
  ${[
    { label: "SPI · Índice de Desempeño del Cronograma", value: m.spi,  fmt: metric },
    { label: "CPI · Índice de Desempeño del Costo",      value: m.cpi,  fmt: metric },
    { label: "Scope · Avance del Alcance",                value: m.scope !== null ? m.scope / 100 : null, fmt: pct },
  ].map(({ label, value, fmt }) => {
    const c = metricColor(value);
    const sub = value === null ? "Sin datos" : value >= 1 ? "Óptimo" : value >= 0.85 ? "En riesgo" : "Crítico";
    return `<div class="card" style="text-align:center">
      <div class="card-label">${label}</div>
      <div class="card-val" style="color:${c}">${value !== null ? fmt(value) : "—"}</div>
      <div class="card-sub" style="color:${c}">${sub}</div>
    </div>`;
  }).join("")}
</div>

<!-- EVM Values -->
<h2>Valores EVM</h2>
<div class="grid3">
  ${[
    { label: "EV · Valor Ganado",        value: ev, color: "#10b981" },
    { label: "PV · Valor Planificado",   value: pv, color: "#f59e0b" },
    { label: "AC · Costo Real",          value: ac, color: "#94a3b8" },
  ].map(({ label, value, color }) => `
    <div class="card card-sm">
      <div class="card-label">${label}</div>
      <div class="card-val" style="color:${color}">${value ? fmtMoney(value) : "$0"}</div>
    </div>`).join("")}
</div>

<!-- Task Summary -->
<h2>Resumen de Tareas</h2>
<div class="grid4">
  ${[
    { label: "Total",       value: items.length, color: "#111827" },
    { label: "Completadas", value: m.done,       color: "#10b981" },
    { label: "En Progreso", value: m.working,    color: "#f59e0b" },
    { label: "Pendientes",  value: m.future,     color: "#6b7280" },
  ].map(({ label, value, color }) => `
    <div class="card" style="text-align:center">
      <div class="card-label">${label}</div>
      <div class="card-val" style="color:${color}">${value}</div>
    </div>`).join("")}
</div>
${(m.atrasados > 0 || m.paraHoy > 0) ? `
<div style="margin-top:8px;font-size:12px;display:flex;gap:16px">
  ${m.atrasados > 0 ? `<span style="color:#ef4444;font-weight:600">✕ ${m.atrasados} Off Track</span>` : ""}
  ${m.paraHoy   > 0 ? `<span style="color:#f59e0b;font-weight:600">⚠ ${m.paraHoy} In Risk</span>`   : ""}
</div>` : ""}

${m.criticalItems.length > 0 ? `
<!-- Critical Items -->
<h2>Tareas Críticas</h2>
<table>
  <thead><tr><th></th><th>Tarea</th><th>Grupo</th><th>Deadline</th></tr></thead>
  <tbody>${criticalRows}</tbody>
</table>` : ""}

<!-- Groups -->
<h2>Desglose por Grupo</h2>
<table>
  <thead>
    <tr><th>Grupo</th><th style="text-align:center">Tareas</th><th style="text-align:center">Done</th><th style="text-align:center">Off Track</th><th style="text-align:center">In Risk</th></tr>
  </thead>
  <tbody>${groupRows}</tbody>
</table>

<!-- Financial -->
<h2>Situación Financiera</h2>
<div class="grid3">
  ${[
    { label: "Costo Total",     value: m.totalCost,                      color: "#ef4444" },
    { label: "Beneficio Total", value: m.totalBenefit,                   color: "#10b981" },
    { label: "Valor Neto",      value: m.totalBenefit - m.totalCost,     color: netColor },
  ].map(({ label, value, color }) => `
    <div class="card card-sm" style="text-align:center">
      <div class="card-label">${label}</div>
      <div class="card-val" style="color:${color}">${value ? fmtMoney(value) : "—"}</div>
    </div>`).join("")}
</div>

<div class="divider"></div>
<div style="font-size:10px;color:#d1d5db;text-align:center">Generado por PMO Dashboard · ${today}</div>

</body>
</html>`;
}
