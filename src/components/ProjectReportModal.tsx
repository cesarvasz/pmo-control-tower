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
  payback: number | null;
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
  // Payback (meses) = costo / (beneficio / 12).
  const payback = totalBenefit > 0 ? totalCost / (totalBenefit / 12) : null;

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

  // Off Track = no completado y atrasado (mismo criterio que el resto de la app).
  const isOffTrack = (status: string, estado: string) => status !== "Done" && estado === "ATRASADO";
  // Tareas críticas: el item está off track, o tiene algún subitem off track.
  const criticalItems = items.filter(
    (r) => isOffTrack(r.status, r.estado) || r.subitems.some((s) => isOffTrack(s.status, s.estado)),
  );

  return { spi, cpi, scope, healthIndex, healthStatus, done, working, future, atrasados, totalCost, totalBenefit, roi, payback, phases, groupOrder, groupMap, criticalItems };
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

  const handlePDF = async () => {
    // Incrusta el logo como data-URI para que siempre se imprima (la ventana de print no tiene origen).
    let logo = "";
    try {
      const res = await fetch("/pmo-logo.png");
      const blob = await res.blob();
      logo = await new Promise<string>((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : "");
        fr.onerror = () => resolve("");
        fr.readAsDataURL(blob);
      });
    } catch { /* sin logo si no carga */ }

    const html = buildPrintHTML(board, items, ev, pv, ac, m, today, logo);
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
    { label: "ROI",        icon: "⇄", value: m.roi !== null     ? `${Math.round(m.roi)}%`        : "—", color: "#0ea5e9" },
    { label: "Payback",    icon: "⏱", value: m.payback !== null ? `${m.payback.toFixed(1)} meses` : "—", color: "#f59e0b" },
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
            {(board.pm || board.sponsor) && (
              <div className="text-[0.78rem] text-[var(--text-secondary)]">
                {board.pm && <>PM: <span className="font-semibold">{board.pm}</span></>}
                {board.pm && board.sponsor && <span className="text-[var(--text-muted)]"> · </span>}
                {board.sponsor && <>Sponsor: <span className="font-semibold">{board.sponsor}</span></>}
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

          {/* Estrategia (desde la Iniciativa) */}
          {board.estrategia && (
            <div
              className="flex items-center gap-3 rounded-lg py-2 pl-4 pr-3 text-[0.78rem]"
              style={{ borderLeft: "4px solid var(--accent)", background: "var(--bg-hover)" }}
            >
              <span className="shrink-0 text-[0.62rem] font-bold uppercase tracking-widest" style={{ color: "var(--accent)" }}>
                Estrategia
              </span>
              <span className="italic text-[var(--text-secondary)]">“{board.estrategia}”</span>
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

          {/* Costo · Beneficio · ROI · Valor Neto */}
          <div className="grid grid-cols-5 gap-3">
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

          {/* Fases del Proyecto */}
          <div>
            <SectionLabel>Fases del Proyecto</SectionLabel>
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
              {/* Encabezado */}
              <div
                className="flex items-center gap-3 px-4 py-2 text-[0.58rem] font-bold uppercase tracking-wider text-[var(--text-muted)]"
                style={{ background: "var(--bg-hover)" }}
              >
                <span className="flex-1">Fase</span>
                <span className="w-20 text-center">Steps Atrasados</span>
                <span className="w-20 text-center">Tareas Atrasadas</span>
                <span className="w-12 text-center">Avance</span>
              </div>
              {m.groupOrder.map((grupo) => {
                const gItems = m.groupMap.get(grupo)!;
                const gDone  = gItems.filter((r) => r.status === "Done").length;
                // Items atrasados ("Steps Atrasados") y subitems atrasados ("Tareas Atrasadas").
                const gLateItems = gItems.filter((r) => r.status !== "Done" && r.estado === "ATRASADO").length;
                const gLateSubs  = gItems.reduce(
                  (s, r) => s + r.subitems.filter((su) => su.status !== "Done" && su.estado === "ATRASADO").length,
                  0,
                );
                const pct    = Math.round((gDone / gItems.length) * 100);
                const pctColor = pct === 100 ? "#10b981" : pct === 0 ? "#9ca3af" : "#f97316";
                return (
                  <div
                    key={grupo}
                    className="flex items-center gap-3 px-4 py-2.5"
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <span className="flex-1 text-[0.78rem] font-medium text-[var(--text-primary)]">
                      {grupo || "Sin grupo"}
                    </span>
                    <span className="w-20 text-center text-[0.72rem] font-semibold" style={{ color: gLateItems > 0 ? "#ef4444" : "var(--text-muted)" }}>
                      {gLateItems}
                    </span>
                    <span className="w-20 text-center text-[0.72rem] font-semibold" style={{ color: gLateSubs > 0 ? "#ef4444" : "var(--text-muted)" }}>
                      {gLateSubs}
                    </span>
                    <span className="w-12 text-center text-[0.72rem] font-semibold" style={{ color: pctColor }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Acciones Críticas */}
          {m.criticalItems.length > 0 && (
            <div>
              <SectionLabel>Acciones Críticas</SectionLabel>
              <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
                {m.criticalItems.map((r, i) => {
                  const color = r.estado === "ATRASADO" ? "#ef4444" : "#f59e0b";
                  const offSubs = r.subitems.filter((s) => s.estado === "ATRASADO" && s.status !== "Done");
                  const { colResp, respLines, comment } = criticalMeta(r.name, r.resp, board.cku || "");
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
                        {r.deadline && (
                          <span className="text-[0.67rem] font-semibold" style={{ color }}>
                            {fmtDate(r.deadline)}
                          </span>
                        )}
                      </div>
                      {colResp && (
                        <div className="mt-1 pl-6 text-[0.8rem] text-[var(--text-muted)]">
                          Responsable: <span className="font-medium text-[var(--text-secondary)]">{colResp}</span>
                        </div>
                      )}
                      {comment && (
                        <div
                          className="mt-1.5 ml-6 space-y-0.5 rounded-md py-1.5 pl-3 pr-3 text-[0.76rem]"
                          style={{ background: "var(--bg-hover)", borderLeft: "3px solid #f59e0b", color: "var(--text-secondary)" }}
                        >
                          {respLines.map((l) => (
                            <div key={l.label}>
                              <b className="text-[var(--text-primary)]">{l.label}:</b> {l.value}
                            </div>
                          ))}
                          <div>
                            <b className="text-[var(--text-primary)]">Acción requerida:</b> {comment}
                          </div>
                        </div>
                      )}
                      {offSubs.length > 0 && (
                        <div className="mt-1.5 space-y-1 pl-6">
                          {offSubs.map((s) => (
                            <div key={s.id} className="flex items-center gap-2 text-[0.8rem]">
                              <span style={{ color: "#ef4444" }}>↳ ✕</span>
                              <span className="flex-1 text-[var(--text-primary)]">{s.name}</span>
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

// ── Comentario ejecutivo automático ─────────────────────────────────────────────
// Si una tarea crítica depende de roles del negocio (Sponsor + CKU), genera una nota
// para gerencia indicando qué se espera de cada rol. Devuelve HTML (con <b>) o null.
function criticalComment(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("sponsor") && n.includes("cku")) {
    return `Firma del CKU para los requerimientos de los siguientes hitos:`;
  }
  if (n.includes("agenda bat")) {
    return `No se puede agendar BAT porque las fechas de entrega de Desarrollo están pendientes para los siguientes hitos:`;
  }
  if (n.includes("fechas estimadas de desarrollo") || n.includes("costo dev")) {
    return `El equipo de Desarrollo está pendiente de entregar las fechas de desarrollo de los siguientes hitos:`;
  }
  return null;
}

/** Metadatos de una acción crítica: responsable de la columna, líneas del recuadro y comentario.
 *  - Costo DEV: la columna queda en blanco; el recuadro muestra "Responsable: Equipo de Desarrollo"
 *    y "Dará seguimiento: <responsable del item>".
 *  - Tareas con CKU: el responsable es el CKU de la Iniciativa, también restado en el recuadro. */
function criticalMeta(name: string, itemResp: string, cku: string): {
  colResp: string;
  respLines: { label: string; value: string }[];
  comment: string | null;
} {
  const n = name.toLowerCase();
  const comment = criticalComment(name);
  const isCostoDev = n.includes("fechas estimadas de desarrollo") || n.includes("costo dev");
  const isCku = n.includes("cku");
  const colResp = isCostoDev ? "" : isCku ? (cku || "CKU") : (itemResp || "Sin asignar");
  const respLines = !comment
    ? []
    : isCostoDev
      ? [
          { label: "Responsable", value: "Equipo de Desarrollo" },
          { label: "Dará seguimiento", value: itemResp || "—" },
        ]
      : [{ label: "Responsable", value: isCku ? (cku || "CKU") : (itemResp || "Sin asignar") }];
  return { colResp, respLines, comment };
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
  logo: string,
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
  const paybackTxt = m.payback !== null ? `${m.payback.toFixed(1)} meses` : "—";
  const net = m.totalBenefit - m.totalCost;
  const finCards = [
    { label: "Costo",      icon: "$", value: m.totalCost    ? fmtMoney(m.totalCost)    : "—", color: "#ef4444" },
    { label: "Beneficio",  icon: "↗", value: m.totalBenefit ? fmtMoney(m.totalBenefit) : "—", color: "#10b981" },
    { label: "ROI",        icon: "⇄", value: roiTxt,                                          color: "#0ea5e9" },
    { label: "Payback",    icon: "⏱", value: paybackTxt,                                      color: "#f59e0b" },
    { label: "Valor Neto", icon: "◆", value: m.totalCost || m.totalBenefit ? fmtMoney(net) : "—", color: net >= 0 ? "#8b5cf6" : "#ef4444" },
  ];

  const criticalRows = m.criticalItems
    .map((r) => {
      const color = r.estado === "ATRASADO" ? "#ef4444" : "#f59e0b";
      const offSubs = r.subitems.filter((s) => s.estado === "ATRASADO" && s.status !== "Done");
      const { colResp, respLines, comment } = criticalMeta(r.name, r.resp, board.cku || "");
      const mainRow = `
      <tr>
        <td style="color:${color};font-weight:700;width:20px">
          ${r.estado === "ATRASADO" ? "✕" : "⚠"}
        </td>
        <td style="font-weight:500">${r.name}</td>
        <td style="color:#6b7280;font-size:11px">${colResp}</td>
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
        <td></td>
        <td style="color:#ef4444;font-size:11px;white-space:nowrap">
          ${s.deadline ? fmtDate(s.deadline) : "—"}
        </td>
      </tr>`,
        )
        .join("");
      const respLinesHtml = respLines.map((l) => `<div><b>${l.label}:</b> ${l.value}</div>`).join("");
      const commentRow = comment
        ? `
      <tr>
        <td style="border-bottom:none"></td>
        <td colspan="3" style="border-bottom:none;padding-top:2px;padding-bottom:6px">
          <div style="background:#fffbeb;border-left:3px solid #f59e0b;border-radius:6px;padding:7px 11px;font-size:11px;color:#78350f;line-height:1.6">
            ${respLinesHtml}
            <div><b>Acción requerida:</b> ${comment}</div>
          </div>
        </td>
      </tr>`
        : "";
      // El comentario va debajo del nombre de la acción e introduce la lista de hitos (subitems).
      return mainRow + commentRow + subRows;
    })
    .join("");

  const groupRows = m.groupOrder
    .map((grupo) => {
      const gItems = m.groupMap.get(grupo)!;
      const gDone  = gItems.filter((r) => r.status === "Done").length;
      // Items atrasados de la fase ("Steps Atrasados").
      const gLateItems = gItems.filter((r) => r.status !== "Done" && r.estado === "ATRASADO").length;
      // Subitems atrasados de la fase ("Tareas Atrasadas").
      const gLateSubs  = gItems.reduce(
        (s, r) => s + r.subitems.filter((su) => su.status !== "Done" && su.estado === "ATRASADO").length,
        0,
      );
      const gpct   = Math.round((gDone / gItems.length) * 100);
      const gpctColor = gpct === 100 ? "#10b981" : gpct === 0 ? "#9ca3af" : "#f97316";
      return `
      <tr>
        <td style="font-weight:500">${grupo || "Sin grupo"}</td>
        <td style="text-align:center;color:${gLateItems > 0 ? "#ef4444" : "#d1d5db"};font-weight:600">${gLateItems}</td>
        <td style="text-align:center;color:${gLateSubs > 0 ? "#ef4444" : "#d1d5db"};font-weight:600">${gLateSubs}</td>
        <td style="text-align:center;color:${gpctColor};font-weight:600">${gpct}%</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Informe – ${board.name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
  .grid4 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
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
  <div style="display:flex;align-items:center;gap:14px;min-width:0">
    ${logo ? `<img src="${logo}" alt="PMO" style="height:54px;width:auto;flex-shrink:0" />` : ""}
    <div style="min-width:0">
      <div class="meta">Informe de Proyecto · ${today}</div>
      <h1>${board.name}</h1>
      ${board.pm || board.sponsor ? `<div class="meta" style="margin-top:3px">${board.pm ? `PM: <b>${board.pm}</b>` : ""}${board.pm && board.sponsor ? " · " : ""}${board.sponsor ? `Sponsor: <b>${board.sponsor}</b>` : ""}</div>` : ""}
    </div>
  </div>
  ${hc ? `
  <div class="estado" style="background:${hc.color}">
    <div class="lbl">Estado actual</div>
    <div class="val">${hc.icon} ${hc.label}</div>
  </div>` : ""}
</div>

${board.estrategia ? `
<!-- Estrategia -->
<div class="diag" style="border-left:4px solid #16a34a">
  <span class="lbl" style="color:#16a34a">Estrategia</span>
  <span style="color:#4b5563;font-style:italic">“${board.estrategia}”</span>
</div>` : ""}

${m.phases.length > 0 ? `
<!-- Ciclo de vida -->
<h2>Ciclo de Vida del Proyecto</h2>
<div style="display:flex;gap:4px;align-items:stretch">${phasesHtml}</div>` : ""}

<!-- Financiero -->
<div class="grid4" style="margin-top:18px">
  ${finCards.map(({ label, icon, value, color }) => `
  <div class="card fin">
    <span class="ic" style="color:${color};background:${color}1e">${icon}</span>
    <div class="card-label" style="margin-top:5px">${label}</div>
    <div class="val" style="color:${color}">${value}</div>
  </div>`).join("")}
</div>

<!-- Fases del Proyecto -->
<h2>Fases del Proyecto</h2>
<table>
  <thead>
    <tr><th style="text-align:left">Fase</th><th style="text-align:center">Steps Atrasados</th><th style="text-align:center">Tareas Atrasadas</th><th style="text-align:center">Avance</th></tr>
  </thead>
  <tbody>${groupRows}</tbody>
</table>

${m.criticalItems.length > 0 ? `
<!-- Critical Items -->
<h2>Acciones Críticas</h2>
<table>
  <thead><tr><th></th><th>Acción</th><th>Responsable</th><th>Deadline</th></tr></thead>
  <tbody>${criticalRows}</tbody>
</table>` : ""}

<div style="height:1px;background:#f3f4f6;margin:20px 0"></div>
<div style="font-size:10px;color:#d1d5db;text-align:center">Generado por PMO Dashboard · ${today}</div>

</body>
</html>`;
}
