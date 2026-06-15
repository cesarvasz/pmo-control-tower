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

type PhaseStatus = "done" | "late" | "active" | "pending";

interface Phase {
  name: string;
  status: PhaseStatus;
  done: number;
  total: number;
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
  totalCost: number;
  totalBenefit: number;
  roi: number | null;
  phases: Phase[];
  groupOrder: string[];
  groupMap: Map<string, ProjItem[]>;
  criticalItems: ProjItem[];
}

function phaseStatusOf(gItems: ProjItem[]): PhaseStatus {
  const done = gItems.filter((r) => r.status === "Done").length;
  if (done === gItems.length && gItems.length > 0) return "done";
  const late = gItems.some((r) => r.status !== "Done" && r.estado === "ATRASADO");
  if (late) return "late";
  const started = done > 0 || gItems.some((r) => r.status === "Working on it");
  return started ? "active" : "pending";
}

function computeMetrics(items: ProjItem[], spi: number | null, cpi: number | null, scope: number | null): Metrics {
  // scope viene en 0–100 → fracción 0–1 para el VEM (fuente única).
  const healthIndex = calcVem(spi, cpi, scope !== null ? scope / 100 : null);
  const healthStatus: Metrics["healthStatus"] = healthStatusFromIndex(healthIndex);

  const done    = items.filter((r) => r.status === "Done").length;
  const working = items.filter((r) => r.status === "Working on it").length;
  const future  = items.filter((r) => r.status === "Future Steps").length;
  const atrasados = items.filter((r) => r.status !== "Done" && r.estado === "ATRASADO").length;

  const totalCost    = items.reduce((s, r) => s + r.cost, 0);
  const totalBenefit = items.reduce((s, r) => s + r.benefit, 0);
  const roi = totalCost > 0 ? ((totalBenefit - totalCost) / totalCost) * 100 : null;

  // Cada grupo de Monday se trata como una fase del ciclo de vida del proyecto.
  const groupOrder: string[] = [];
  const groupMap = new Map<string, ProjItem[]>();
  items.forEach((r) => {
    if (!groupMap.has(r.grupo)) { groupOrder.push(r.grupo); groupMap.set(r.grupo, []); }
    groupMap.get(r.grupo)!.push(r);
  });
  const phases: Phase[] = groupOrder.map((g) => {
    const gItems = groupMap.get(g)!;
    return {
      name: g || "Sin grupo",
      status: phaseStatusOf(gItems),
      done: gItems.filter((r) => r.status === "Done").length,
      total: gItems.length,
    };
  });

  const criticalItems = items.filter(
    (r) =>
      (r.status === "Working on it" || r.status === "Future Steps") &&
      r.estado === "ATRASADO",
  );

  return { spi, cpi, scope, healthIndex, healthStatus, done, working, future, atrasados, totalCost, totalBenefit, roi, phases, groupOrder, groupMap, criticalItems };
}

const HC = {
  "on-track":  { color: "#10b981", label: "On Track",  icon: "✓", desc: "El proyecto avanza según lo planificado. SPI, CPI y el porcentaje de alcance (items + subitems On Track / total) se mantienen en rango óptimo." },
  "in-risk":   { color: "#f59e0b", label: "At Risk",   icon: "⚠", desc: "El proyecto presenta desviaciones menores en cronograma, costo o porcentaje de alcance. Se recomienda atención preventiva." },
  "off-track": { color: "#ef4444", label: "Off Track", icon: "✕", desc: "El proyecto tiene desviaciones significativas en SPI, CPI o alcance completado. Se requiere acción correctiva inmediata." },
} as const;

const PHASE_STYLE: Record<PhaseStatus, { chip: string; chipColor: string; border: string; bg: string; opacity: number }> = {
  done:    { chip: "✓ COMPLETADO",   chipColor: "#10b981", border: "#10b981", bg: "#10b98114", opacity: 1 },
  late:    { chip: "⚠ FALTA ACCIÓN", chipColor: "#d97706", border: "#f59e0b", bg: "#f59e0b1c", opacity: 1 },
  active:  { chip: "● EN CURSO",     chipColor: "#ea580c", border: "#f97316", bg: "#f9731622", opacity: 1 },
  pending: { chip: "PENDIENTE",      chipColor: "var(--text-muted)", border: "var(--border)", bg: "var(--bg-hover)", opacity: 0.55 },
};

const metricColor = (v: number | null) =>
  v === null ? "var(--text-muted)" : v >= 1 ? "#10b981" : v >= 0.85 ? "#f59e0b" : "#ef4444";

export default function ProjectReportModal({ board, items, ev, pv, ac, scope, spi, cpi, onClose }: Props) {
  const m   = computeMetrics(items, spi, cpi, scope);
  const hc  = m.healthStatus ? HC[m.healthStatus] : null;
  const today = new Date().toLocaleDateString("es-CR", { year: "numeric", month: "long", day: "numeric" });

  const handlePDF = () => {
    const html = buildPrintHTML(board, items, ev, pv, ac, m, today);
    const win = window.open("", "_blank", "width=980,height=750");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  const finCards = [
    { label: "Costo",      icon: "$", value: m.totalCost    ? fmtMoney(m.totalCost)    : "—", color: "#ef4444" },
    { label: "Beneficio",  icon: "↗", value: m.totalBenefit ? fmtMoney(m.totalBenefit) : "—", color: "#10b981" },
    { label: "ROI",        icon: "⇄", value: m.roi !== null ? `${Math.round(m.roi)}%`  : "—", color: "#0ea5e9" },
    {
      label: "Valor Neto", icon: "◆",
      value: m.totalCost || m.totalBenefit ? fmtMoney(m.totalBenefit - m.totalCost) : "—",
      color: m.totalBenefit - m.totalCost >= 0 ? "#8b5cf6" : "#ef4444",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="min-w-0">
            <div className="text-[0.63rem] uppercase tracking-widest text-[var(--text-muted)]">
              Informe de Proyecto · {today}
            </div>
            <div className="mt-0.5 truncate text-[1.25rem] font-extrabold text-[var(--text-primary)]">
              <span style={{ color: "var(--accent)" }}>⚡</span> {board.name}
            </div>
            {board.pm && (
              <div className="text-[0.78rem] text-[var(--text-secondary)]">
                PM: <span className="font-semibold">{board.pm}</span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hc && (
              <div
                className="rounded-xl px-4 py-2 text-right text-white"
                style={{ background: hc.color }}
              >
                <div className="text-[0.62rem] font-semibold uppercase tracking-wide opacity-90">Estado actual</div>
                <div className="text-[0.85rem] font-bold leading-tight">{hc.icon} {hc.label}</div>
              </div>
            )}
            <button
              onClick={handlePDF}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[0.73rem] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
              style={{ borderColor: "var(--border)", color: "var(--accent)" }}
            >
              ↓ PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-lg px-2 py-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">

          {/* Diagnóstico (barra estilo "estrategia") */}
          {hc && (
            <div
              className="flex items-center gap-3 rounded-lg py-2 pl-4 pr-3 text-[0.78rem]"
              style={{ borderLeft: `4px solid ${hc.color}`, background: "var(--bg-hover)" }}
            >
              <span className="shrink-0 text-[0.62rem] font-bold uppercase tracking-widest" style={{ color: hc.color }}>
                Diagnóstico
              </span>
              <span className="italic text-[var(--text-secondary)]">“{hc.desc}”</span>
            </div>
          )}

          {/* Ciclo de vida (grupos del board como fases) */}
          {m.phases.length > 0 && (
            <div>
              <SectionLabel>Ciclo de Vida del Proyecto</SectionLabel>
              <div className="flex items-stretch gap-1 overflow-x-auto pb-1 pt-3">
                {m.phases.map((ph, i) => {
                  const st = PHASE_STYLE[ph.status];
                  return (
                    <div key={ph.name + i} className="flex min-w-0 flex-1 items-center gap-1" style={{ minWidth: "8.5rem" }}>
                      <div
                        className="relative w-full rounded-xl border-2 px-3 pb-2.5 pt-4"
                        style={{ borderColor: st.border, background: st.bg, opacity: st.opacity }}
                      >
                        <span
                          className="absolute -top-2.5 left-2.5 rounded-full px-2 py-0.5 text-[0.56rem] font-bold tracking-wide text-white"
                          style={{ background: st.chipColor === "var(--text-muted)" ? "#9ca3af" : st.chipColor }}
                        >
                          {st.chip}
                        </span>
                        <div className="truncate text-[0.82rem] font-bold text-[var(--text-primary)]" title={ph.name}>
                          {ph.name}
                        </div>
                        <div className="text-[0.65rem] text-[var(--text-muted)]">
                          {ph.done}/{ph.total} tareas
                        </div>
                      </div>
                      {i < m.phases.length - 1 && (
                        <span className="shrink-0 text-[var(--text-muted)]">›</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Health Index + Resumen */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border px-5 py-4" style={{ borderColor: "var(--border)" }}>
              <div className="text-[0.63rem] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                ⚡ Health Index EVM
              </div>
              {hc && m.healthIndex !== null ? (
                <>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span className="text-[2.6rem] font-extrabold tabular-nums leading-none" style={{ color: hc.color }}>
                      {m.healthIndex.toFixed(2)}
                    </span>
                    <span
                      className="rounded-full px-3 py-0.5 text-[0.72rem] font-bold"
                      style={{ color: hc.color, background: hc.color + "22" }}
                    >
                      {hc.icon} {hc.label}
                    </span>
                  </div>
                  <div className="mt-2 text-[0.7rem] text-[var(--text-muted)]">
                    EV <b style={{ color: "#10b981" }}>{fmtMoney(ev)}</b> · PV{" "}
                    <b style={{ color: "#f59e0b" }}>{fmtMoney(pv)}</b> · AC{" "}
                    <b style={{ color: "#94a3b8" }}>{fmtMoney(ac)}</b>
                  </div>
                </>
              ) : (
                <div className="mt-2 text-[0.78rem] text-[var(--text-muted)]">
                  Sin datos EVM suficientes para calcular el índice de salud.
                </div>
              )}
            </div>

            <div className="rounded-xl border px-5 py-4" style={{ borderColor: "var(--border)" }}>
              <div className="text-[0.63rem] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                📋 {items.length} tareas · {m.phases.length} fases
              </div>
              <div className="mt-1.5 space-y-1 text-[0.78rem] text-[var(--text-secondary)]">
                <div>
                  <b className="text-[var(--text-primary)]">{m.done}</b> completadas ·{" "}
                  <b className="text-[var(--text-primary)]">{m.working}</b> en curso ·{" "}
                  <b className="text-[var(--text-primary)]">{m.future}</b> futuras
                </div>
                <div>
                  SPI: <b style={{ color: metricColor(m.spi) }}>{m.spi !== null ? m.spi.toFixed(2) : "—"}</b>{" "}
                  · CPI: <b style={{ color: metricColor(m.cpi) }}>{m.cpi !== null ? m.cpi.toFixed(2) : "—"}</b>{" "}
                  · Scope:{" "}
                  <b style={{ color: metricColor(m.scope !== null ? m.scope / 100 : null) }}>
                    {m.scope !== null ? `${Math.round(m.scope)}%` : "—"}
                  </b>
                </div>
                <div>
                  {m.criticalItems.length > 0 ? (
                    <span style={{ color: "#ef4444" }}>
                      ⚠ <b>{m.criticalItems.length}</b> tarea{m.criticalItems.length > 1 ? "s" : ""} crítica{m.criticalItems.length > 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span style={{ color: "#10b981" }}>✓ Sin tareas críticas</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Costo · Beneficio · ROI · Valor Neto */}
          <div className="grid grid-cols-4 gap-3">
            {finCards.map(({ label, icon, value, color }) => (
              <div
                key={label}
                className="rounded-xl border px-3 py-4 text-center"
                style={{ borderColor: "var(--border)" }}
              >
                <span
                  className="mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[0.8rem] font-bold"
                  style={{ color, background: color + "1e" }}
                >
                  {icon}
                </span>
                <div className="mt-1.5 text-[0.6rem] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  {label}
                </div>
                <div className="mt-0.5 text-[1.35rem] font-extrabold tabular-nums leading-none" style={{ color }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Tareas Críticas */}
          {m.criticalItems.length > 0 && (
            <div>
              <SectionLabel>Tareas Críticas</SectionLabel>
              <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
                {m.criticalItems.map((r, i) => {
                  const color = r.estado === "ATRASADO" ? "#ef4444" : "#f59e0b";
                  const offSubs = r.subitems.filter((s) => s.estado === "ATRASADO" && s.status !== "Done");
                  return (
                    <div
                      key={r.id}
                      className="px-4 py-2.5"
                      style={{
                        borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                        borderLeft: `3px solid ${color}`,
                      }}
                    >
                      <div className="flex items-center gap-3 text-[0.78rem]">
                        <span style={{ color, fontWeight: 700 }}>
                          {r.estado === "ATRASADO" ? "✕" : "⚠"}
                        </span>
                        <span className="flex-1 font-medium text-[var(--text-primary)]">{r.name}</span>
                        <span className="text-[0.67rem] text-[var(--text-muted)]">{r.grupo}</span>
                        {r.deadline && (
                          <span className="text-[0.67rem] font-semibold" style={{ color }}>
                            {fmtDate(r.deadline)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 pl-6 text-[0.8rem] text-[var(--text-muted)]">
                        Responsable: <span className="font-medium text-[var(--text-secondary)]">{r.resp || "Sin asignar"}</span>
                      </div>
                      {offSubs.length > 0 && (
                        <div className="mt-1.5 space-y-1 pl-6">
                          {offSubs.map((s) => (
                            <div key={s.id} className="flex items-center gap-2 text-[0.8rem]">
                              <span style={{ color: "#ef4444" }}>↳ ✕</span>
                              <span className="flex-1 text-[var(--text-primary)]">{s.name}</span>
                              <span className="text-[0.73rem] text-[var(--text-muted)]">{s.person || "Sin asignar"}</span>
                              {s.deadline && (
                                <span className="text-[0.73rem] font-semibold" style={{ color: "#ef4444" }}>
                                  {fmtDate(s.deadline)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Desglose por Grupo */}
          <div>
            <SectionLabel>Desglose por Grupo</SectionLabel>
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
              {m.groupOrder.map((grupo, i) => {
                const gItems = m.groupMap.get(grupo)!;
                const gDone  = gItems.filter((r) => r.status === "Done").length;
                const gLate  = gItems.filter((r) => r.status !== "Done" && r.estado === "ATRASADO").length;
                const pct    = Math.round((gDone / gItems.length) * 100);
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
                    {gLate > 0 && (
                      <span className="text-[0.68rem] font-semibold" style={{ color: "#ef4444" }}>✕ {gLate}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-[0.63rem] font-bold uppercase tracking-widest text-[var(--text-muted)]">
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
  m: Metrics,
  today: string,
): string {
  const hc = m.healthStatus ? HC[m.healthStatus] : null;
  const metric = (v: number | null) => (v !== null ? v.toFixed(2) : "—");
  const mColor = (v: number | null) =>
    v === null ? "#6b7280" : v >= 1 ? "#10b981" : v >= 0.85 ? "#f59e0b" : "#ef4444";

  const PHASE_PRINT: Record<PhaseStatus, { chip: string; chipBg: string; border: string; bg: string; opacity: string }> = {
    done:    { chip: "✓ COMPLETADO",   chipBg: "#10b981", border: "#10b981", bg: "#ecfdf5", opacity: "1" },
    late:    { chip: "⚠ FALTA ACCIÓN", chipBg: "#d97706", border: "#f59e0b", bg: "#fffbeb", opacity: "1" },
    active:  { chip: "● EN CURSO",     chipBg: "#ea580c", border: "#f97316", bg: "#fff7ed", opacity: "1" },
    pending: { chip: "PENDIENTE",      chipBg: "#9ca3af", border: "#e5e7eb", bg: "#f9fafb", opacity: "0.6" },
  };

  const phasesHtml = m.phases
    .map((ph, i) => {
      const st = PHASE_PRINT[ph.status];
      return `
      <div style="flex:1;min-width:110px;display:flex;align-items:center;gap:4px">
        <div style="position:relative;width:100%;border:2px solid ${st.border};background:${st.bg};border-radius:12px;padding:14px 10px 9px;opacity:${st.opacity}">
          <span style="position:absolute;top:-9px;left:10px;background:${st.chipBg};color:#fff;border-radius:999px;padding:2px 8px;font-size:8px;font-weight:700;letter-spacing:0.03em;white-space:nowrap">${st.chip}</span>
          <div style="font-size:12px;font-weight:700;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ph.name}</div>
          <div style="font-size:9px;color:#6b7280">${ph.done}/${ph.total} tareas</div>
        </div>
        ${i < m.phases.length - 1 ? `<span style="color:#9ca3af;flex-shrink:0">›</span>` : ""}
      </div>`;
    })
    .join("");

  const roiTxt = m.roi !== null ? `${Math.round(m.roi)}%` : "—";
  const net = m.totalBenefit - m.totalCost;
  const finCards = [
    { label: "Costo",      icon: "$", value: m.totalCost    ? fmtMoney(m.totalCost)    : "—", color: "#ef4444" },
    { label: "Beneficio",  icon: "↗", value: m.totalBenefit ? fmtMoney(m.totalBenefit) : "—", color: "#10b981" },
    { label: "ROI",        icon: "⇄", value: roiTxt,                                          color: "#0ea5e9" },
    { label: "Valor Neto", icon: "◆", value: m.totalCost || m.totalBenefit ? fmtMoney(net) : "—", color: net >= 0 ? "#8b5cf6" : "#ef4444" },
  ];

  const criticalRows = m.criticalItems
    .map((r) => {
      const color = r.estado === "ATRASADO" ? "#ef4444" : "#f59e0b";
      const offSubs = r.subitems.filter((s) => s.estado === "ATRASADO" && s.status !== "Done");
      const mainRow = `
      <tr>
        <td style="color:${color};font-weight:700;width:20px">
          ${r.estado === "ATRASADO" ? "✕" : "⚠"}
        </td>
        <td style="font-weight:500">${r.name}</td>
        <td style="color:#6b7280;font-size:11px">${r.resp || "Sin asignar"}</td>
        <td style="color:#6b7280;font-size:11px">${r.grupo}</td>
        <td style="color:${color};font-size:11px;white-space:nowrap">
          ${r.deadline ? fmtDate(r.deadline) : "—"}
        </td>
      </tr>`;
      const subRows = offSubs
        .map(
          (s) => `
      <tr>
        <td style="color:#ef4444;font-size:11px;text-align:right">↳</td>
        <td style="padding-left:18px;color:#374151;font-size:11px">${s.name}</td>
        <td style="color:#9ca3af;font-size:11px">${s.person || "Sin asignar"}</td>
        <td style="color:#9ca3af;font-size:11px;font-style:italic">subitem</td>
        <td style="color:#ef4444;font-size:11px;white-space:nowrap">
          ${s.deadline ? fmtDate(s.deadline) : "—"}
        </td>
      </tr>`,
        )
        .join("");
      return mainRow + subRows;
    })
    .join("");

  const groupRows = m.groupOrder
    .map((grupo) => {
      const gItems = m.groupMap.get(grupo)!;
      const gDone  = gItems.filter((r) => r.status === "Done").length;
      const gLate  = gItems.filter((r) => r.status !== "Done" && r.estado === "ATRASADO").length;
      const gpct   = Math.round((gDone / gItems.length) * 100);
      return `
      <tr>
        <td style="font-weight:500">${grupo || "Sin grupo"}</td>
        <td style="text-align:center;color:#6b7280">${gItems.length}</td>
        <td style="text-align:center;color:#10b981;font-weight:600">${gpct}%</td>
        <td style="text-align:center;color:${gLate > 0 ? "#ef4444" : "#d1d5db"};font-weight:600">${gLate > 0 ? `✕ ${gLate}` : "—"}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Informe – ${board.name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2937; background: #fff; padding: 28px 36px; font-size: 13px; }
  h1 { font-size: 21px; font-weight: 800; color: #111827; }
  h2 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 10px; margin-top: 22px; }
  .meta { color: #6b7280; font-size: 11px; margin-top: 2px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #f3f4f6; padding-bottom: 14px; }
  .estado { border-radius: 12px; padding: 8px 16px; color: #fff; text-align: right; }
  .estado .lbl { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.9; }
  .estado .val { font-size: 13px; font-weight: 800; }
  .diag { display: flex; align-items: center; gap: 10px; border-radius: 8px; background: #f9fafb; padding: 8px 12px; margin-top: 16px; font-size: 11px; }
  .diag .lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; flex-shrink: 0; }
  .grid2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 16px; }
  .card-label { font-size: 9px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 700; }
  .fin { text-align: center; padding: 14px 10px; }
  .fin .ic { display: inline-flex; width: 26px; height: 26px; border-radius: 999px; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; }
  .fin .val { font-size: 19px; font-weight: 800; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
  th { background: #f9fafb; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
  @media print {
    body { padding: 18px 24px; }
    @page { margin: 1.1cm; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div style="min-width:0">
    <div class="meta">Informe de Proyecto · ${today}</div>
    <h1>⚡ ${board.name}</h1>
    ${board.pm ? `<div class="meta" style="margin-top:3px">PM: <b>${board.pm}</b></div>` : ""}
  </div>
  ${hc ? `
  <div class="estado" style="background:${hc.color}">
    <div class="lbl">Estado actual</div>
    <div class="val">${hc.icon} ${hc.label}</div>
  </div>` : ""}
</div>

${hc ? `
<!-- Diagnóstico -->
<div class="diag" style="border-left:4px solid ${hc.color}">
  <span class="lbl" style="color:${hc.color}">Diagnóstico</span>
  <span style="color:#4b5563;font-style:italic">“${hc.desc}”</span>
</div>` : ""}

${m.phases.length > 0 ? `
<!-- Ciclo de vida -->
<h2>Ciclo de Vida del Proyecto</h2>
<div style="display:flex;gap:4px;align-items:stretch">${phasesHtml}</div>` : ""}

<!-- Health + Resumen -->
<h2>Salud del Proyecto</h2>
<div class="grid2">
  <div class="card">
    <div class="card-label">⚡ Health Index EVM</div>
    ${
      hc && m.healthIndex !== null
        ? `<div style="display:flex;align-items:baseline;gap:10px;margin-top:4px">
             <span style="font-size:36px;font-weight:900;line-height:1;color:${hc.color}">${m.healthIndex.toFixed(2)}</span>
             <span style="border-radius:999px;padding:3px 12px;font-size:11px;font-weight:700;color:${hc.color};background:${hc.color}22">${hc.icon} ${hc.label}</span>
           </div>
           <div style="margin-top:8px;font-size:10px;color:#6b7280">
             EV <b style="color:#10b981">${fmtMoney(ev)}</b> ·
             PV <b style="color:#f59e0b">${fmtMoney(pv)}</b> ·
             AC <b style="color:#94a3b8">${fmtMoney(ac)}</b>
           </div>`
        : `<div style="margin-top:8px;font-size:11px;color:#6b7280">Sin datos EVM suficientes para calcular el índice de salud.</div>`
    }
  </div>
  <div class="card">
    <div class="card-label">📋 ${items.length} tareas · ${m.phases.length} fases</div>
    <div style="margin-top:6px;font-size:11px;color:#4b5563;line-height:1.7">
      <div><b style="color:#111827">${m.done}</b> completadas · <b style="color:#111827">${m.working}</b> en curso · <b style="color:#111827">${m.future}</b> futuras</div>
      <div>
        SPI: <b style="color:${mColor(m.spi)}">${metric(m.spi)}</b> ·
        CPI: <b style="color:${mColor(m.cpi)}">${metric(m.cpi)}</b> ·
        Scope: <b style="color:${mColor(m.scope !== null ? m.scope / 100 : null)}">${m.scope !== null ? `${Math.round(m.scope)}%` : "—"}</b>
        <span style="color:#9ca3af;font-size:9px">(items + subitems On Track / total)</span>
      </div>
      <div>${
        m.criticalItems.length > 0
          ? `<span style="color:#ef4444">⚠ <b>${m.criticalItems.length}</b> tarea${m.criticalItems.length > 1 ? "s" : ""} crítica${m.criticalItems.length > 1 ? "s" : ""}</span>`
          : `<span style="color:#10b981">✓ Sin tareas críticas</span>`
      }</div>
    </div>
  </div>
</div>

<!-- Financiero -->
<h2>Situación Financiera</h2>
<div class="grid4">
  ${finCards.map(({ label, icon, value, color }) => `
  <div class="card fin">
    <span class="ic" style="color:${color};background:${color}1e">${icon}</span>
    <div class="card-label" style="margin-top:5px">${label}</div>
    <div class="val" style="color:${color}">${value}</div>
  </div>`).join("")}
</div>

${m.criticalItems.length > 0 ? `
<!-- Critical Items -->
<h2>Tareas Críticas</h2>
<table>
  <thead><tr><th></th><th>Tarea</th><th>Responsable</th><th>Grupo</th><th>Deadline</th></tr></thead>
  <tbody>${criticalRows}</tbody>
</table>` : ""}

<!-- Groups -->
<h2>Desglose por Grupo</h2>
<table>
  <thead>
    <tr><th>Grupo</th><th style="text-align:center">Tareas</th><th style="text-align:center">Done</th><th style="text-align:center">Atrasadas</th></tr>
  </thead>
  <tbody>${groupRows}</tbody>
</table>

<div style="height:1px;background:#f3f4f6;margin:20px 0"></div>
<div style="font-size:10px;color:#d1d5db;text-align:center">Generado por PMO Dashboard · ${today}</div>

</body>
</html>`;
}
