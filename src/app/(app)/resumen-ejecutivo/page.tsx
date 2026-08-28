"use client";

// Resumen Ejecutivo — página única para C-Level/Directores: por defecto muestra
// el PORTAFOLIO completo (semáforo, KPIs de portafolio, tabla, riesgos y
// recomendaciones); al hacer clic en cualquier proyecto (fila de la tabla,
// tarjeta crítica o el selector rápido) carga el DETALLE de ese proyecto en la
// misma página, sin navegar a otra ruta — el estado vive en el query param
// ?board=, así que el botón atrás/adelante del navegador funciona como se
// espera. Toda la lógica de agregación vive en lib/portfolioSummary.ts y
// lib/projSummary.ts (puras, con tests) — esta página solo arma la presentación.

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useData } from "@/context/DataContext";
import { businessDays, fmtDate, fmtMoney, today } from "@/lib/business";
import { calcBoardMetrics, deriveBoardHealth, splitBoardName } from "@/lib/proj";
import {
  buildProjectSummary, flattenBoardUnits, type PhaseSummary, type ProjectSummary, type WorkUnit,
} from "@/lib/projSummary";
import { countByResponsible } from "@/lib/delay";
import {
  buildPortfolioRows, calcPortfolioTotals, topCriticalProjects, buildCrossRisks,
  type PortfolioProjectRow, type CrossRisk,
} from "@/lib/portfolioSummary";
import { HEALTH_CFG } from "@/lib/health";
import { EmptyRow, ErrorBox, Loader, StatCard } from "@/components/ui";
import type { ProjBoard, ProjItem, ProjItemBaseline } from "@/types";

const fmtDays = (n: number) => `${n} día${Math.abs(n) === 1 ? "" : "s"}`;

// ── Eje de tiempo (compartido por PhaseTimeline) ──
const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
function monthTicks(min: Date, max: Date): { date: Date; label: string }[] {
  const ticks: { date: Date; label: string }[] = [];
  for (let d = startOfMonth(min); d <= max; d = addMonth(d)) {
    ticks.push({ date: new Date(d), label: `${MONTHS_ES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` });
  }
  return ticks;
}

const SEVERITY_CFG: Record<"high" | "medium" | "low", { color: string; bg: string; label: string }> = {
  high:   { color: "var(--bad)",  bg: "var(--bad-bg)",  label: "Crítico" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)", label: "Medio" },
  low:    { color: "var(--text-muted)", bg: "var(--bg-hover)", label: "Bajo" },
};

function buildRecommendations(critical: PortfolioProjectRow[], risks: CrossRisk[]): string[] {
  const recs: string[] = [];
  if (critical.length) {
    recs.push(`Intervenir esta semana en los proyectos críticos: ${critical.map((r) => r.name).join(", ")} — son los que más arrastran el VEM del portafolio hacia abajo.`);
  }
  risks.forEach((r) => recs.push(r.mitigation));
  if (recs.length === 0) {
    recs.push("Sin señales de riesgo sistémico esta semana: mantener el ritmo de seguimiento actual.");
  }
  return recs.slice(0, 3);
}

export default function ResumenEjecutivoPage() {
  return (
    <Suspense fallback={<Loader />}>
      <ResumenEjecutivoInner />
    </Suspense>
  );
}

function ResumenEjecutivoInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const { data, loading, error } = useData();
  const boardId = sp.get("board") ?? "";

  const goToProject = (id: string) => router.push(`/resumen-ejecutivo?board=${id}`, { scroll: false });
  const backToSummary = () => router.push("/resumen-ejecutivo", { scroll: false });

  const boardsSorted = useMemo(() => {
    if (!data) return [];
    return [...data.projBoards].sort((a, b) => splitBoardName(a.name).name.localeCompare(splitBoardName(b.name).name));
  }, [data]);

  const rows = useMemo(
    () => (data ? buildPortfolioRows(data.projBoards, data.proj, data.projItemBaselines) : []),
    [data],
  );
  const totals = useMemo(() => calcPortfolioTotals(rows), [rows]);
  const critical = useMemo(() => topCriticalProjects(rows, 3), [rows]);

  const responsibleCounts = useMemo(() => {
    if (!data) return {};
    const lateIds = flattenBoardUnits(data.proj)
      .filter((u) => u.entrega === "late" || (u.status !== "Done" && u.estado === "ATRASADO"))
      .map((u) => u.id);
    return countByResponsible(lateIds, data.delayAttributions);
  }, [data]);

  const crossRisks = useMemo(() => buildCrossRisks(rows, totals, responsibleCounts), [rows, totals, responsibleCounts]);
  const recommendations = useMemo(() => buildRecommendations(critical, crossRisks), [critical, crossRisks]);

  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const board = boardsSorted.find((b) => b.id === boardId) ?? null;
  const boardItems = board ? data.proj.filter((r) => r.boardId === board.id) : [];

  return (
    <div>
      {board ? (
        <ProjectDetailView
          board={board}
          items={boardItems}
          projItemBaselines={data.projItemBaselines}
          allBoards={boardsSorted}
          onBack={backToSummary}
          onSwitch={goToProject}
        />
      ) : (
        <PortfolioView
          fetchedAt={data.fetchedAt}
          rows={rows}
          totals={totals}
          critical={critical}
          crossRisks={crossRisks}
          recommendations={recommendations}
          onSelectProject={goToProject}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// VISTA 1 — Portafolio (Resumen Ejecutivo)
// ═══════════════════════════════════════════════════════════════════════
function PortfolioView({ fetchedAt, rows, totals, critical, crossRisks, recommendations, onSelectProject }: {
  fetchedAt: Date;
  rows: PortfolioProjectRow[];
  totals: ReturnType<typeof calcPortfolioTotals>;
  critical: PortfolioProjectRow[];
  crossRisks: CrossRisk[];
  recommendations: string[];
  onSelectProject: (id: string) => void;
}) {
  const tableRows = [...rows].sort((a, b) => {
    const order = { "off-track": 0, "in-risk": 1, "on-track": 2 } as const;
    const oa = a.isComplete ? 3 : a.healthStatus ? order[a.healthStatus] : 4;
    const ob = b.isComplete ? 3 : b.healthStatus ? order[b.healthStatus] : 4;
    return oa !== ob ? oa - ob : a.name.localeCompare(b.name);
  });

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Resumen Ejecutivo del Portafolio</h1>
      </div>
      <p className="mb-6 text-[0.82rem] text-[var(--text-muted)]">
        Vista consolidada de {totals.total} proyecto{totals.total === 1 ? "" : "s"} · datos al {fmtDate(fetchedAt)}.
        Haz clic en cualquier proyecto para ver su detalle.
      </p>

      {rows.length === 0 ? (
        <EmptyRow msg="No hay proyectos en el portafolio." />
      ) : (
        <>
          {/* ── 1. EXECUTIVE SUMMARY ── */}
          <SectionHeader n={1} title="Executive Summary" />
          <div className="mb-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard value={totals.total} label="Total proyectos" />
            <StatCard value={totals.onTrack} label="🟢 On Track" color="#10b981" borderColor="#10b981" />
            <StatCard value={totals.inRisk} label="🟡 En Riesgo" color="#f59e0b" borderColor="#f59e0b" />
            <StatCard value={totals.offTrack} label="🔴 Atrasados" color="#ef4444" borderColor="#ef4444" />
            <StatCard value={totals.completed} label="✓ Completados" color="var(--text-secondary)" />
          </div>
          {totals.noData > 0 && (
            <p className="mb-5 text-[0.72rem] text-[var(--text-muted)]">
              ⓘ {totals.noData} proyecto{totals.noData === 1 ? "" : "s"} sin costos/fechas suficientes en Monday para calcular salud — no se incluyen en el semáforo.
            </p>
          )}
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard value={fmtMoney(totals.budgetApproved)} label="Presupuesto Aprobado" valueSize="1.3rem" />
            <StatCard value={fmtMoney(totals.budgetSpent)} label={`Ejecutado · Burn Rate ${totals.burnRatePct ?? "—"}%`} valueSize="1.3rem" />
            <StatCard
              value={fmtMoney(totals.ev - totals.ac)}
              label="Desviación financiera (EV − AC)"
              color={totals.ev - totals.ac < 0 ? "var(--bad)" : "var(--ok)"}
              borderColor={totals.ev - totals.ac < 0 ? "var(--bad)" : undefined}
              valueSize="1.3rem"
            />
          </div>

          {/* ── 2. PORTFOLIO KPI BLOCK ── */}
          <SectionHeader n={2} title="Portfolio KPI Block" />
          <div className="mb-3 grid grid-cols-2 gap-4 sm:grid-cols-2">
            <StatCard
              value={totals.portfolioSpi !== null ? totals.portfolioSpi.toFixed(2) : "—"}
              label="SPI portafolio (ponderado por EV/PV)"
              color={totals.portfolioSpi === null ? undefined : totals.portfolioSpi >= 1 ? "#10b981" : totals.portfolioSpi >= 0.85 ? "#f59e0b" : "#ef4444"}
            />
            <StatCard
              value={totals.portfolioCpi !== null ? totals.portfolioCpi.toFixed(2) : "—"}
              label="CPI portafolio (ponderado por EV/AC)"
              color={totals.portfolioCpi === null ? undefined : totals.portfolioCpi >= 1 ? "#10b981" : totals.portfolioCpi >= 0.85 ? "#f59e0b" : "#ef4444"}
            />
          </div>
          <h3 className="mb-3 mt-6 text-[0.85rem] font-bold text-[var(--text-primary)]">Top 3 proyectos críticos</h3>
          {critical.length === 0 ? (
            <p className="mb-8 text-[0.8rem] text-[var(--text-muted)]">Ningún proyecto activo está En Riesgo u Off Track. 🎉</p>
          ) : (
            <div className="mb-8 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              {critical.map((r) => {
                const cfg = r.healthStatus ? HEALTH_CFG[r.healthStatus] : null;
                return (
                  <button
                    key={r.boardId}
                    type="button"
                    onClick={() => onSelectProject(r.boardId)}
                    className="flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-transform hover:-translate-y-0.5"
                    style={{ background: "var(--bg-surface)", borderColor: cfg?.color ?? "var(--border)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[0.85rem] font-bold text-[var(--text-primary)]">{r.name}</div>
                      {cfg && (
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold" style={{ color: cfg.color, background: cfg.bg }}>
                          {cfg.icon} {cfg.label}
                        </span>
                      )}
                    </div>
                    {r.pm && <div className="text-[0.72rem] text-[var(--text-secondary)]">PM: {r.pm}</div>}
                    <div className="text-[0.72rem]" style={{ color: SEVERITY_CFG[r.mainRisk.severity].color }}>{r.mainRisk.label}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── 3. PROJECT STATUS TABLE ── */}
          <SectionHeader n={3} title="Project Status Table" />
          <div className="table-wrap mb-8">
            <table className="pmo">
              <thead>
                <tr>
                  <th>Proyecto</th><th>PM</th><th>Salud</th>
                  <th>Avance (Físico/Plan)</th>
                  <th>Presupuesto (Aprob. / Gastado / %)</th>
                  <th>Atraso</th><th>Riesgo principal</th><th></th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => {
                  const cfg = r.isComplete
                    ? { color: "var(--text-secondary)", bg: "var(--bg-hover)", icon: "✓", label: "Completado" }
                    : r.healthStatus ? HEALTH_CFG[r.healthStatus] : { color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "—", label: "Sin datos" };
                  return (
                    <tr
                      key={r.boardId}
                      onClick={() => onSelectProject(r.boardId)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectProject(r.boardId); } }}
                      tabIndex={0}
                      role="button"
                      className="cursor-pointer transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
                    >
                      <td className="ini-name">{r.code && <span className="mr-1.5 text-[0.65rem] text-[var(--text-muted)]">{r.code}</span>}{r.name}</td>
                      <td style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>{r.pm || "—"}</td>
                      <td>
                        <span className="rounded-full px-2 py-0.5 text-[0.68rem] font-bold whitespace-nowrap" style={{ color: cfg.color, background: cfg.bg }}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td style={{ fontSize: ".75rem", whiteSpace: "nowrap" }}>
                        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{r.progressPct}%</span>
                        <span style={{ color: "var(--text-muted)" }}> / {r.plannedPct}%</span>
                      </td>
                      <td style={{ fontSize: ".75rem", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                        {fmtMoney(r.budgetApproved)} / {fmtMoney(r.budgetSpent)} / {r.pctConsumed !== null ? `${r.pctConsumed}%` : "—"}
                      </td>
                      <td style={{ fontSize: ".75rem", whiteSpace: "nowrap", color: r.worstOverdueDays > 0 ? "var(--bad)" : "var(--text-muted)", fontWeight: r.worstOverdueDays > 0 ? 600 : 400 }}>
                        {r.worstOverdueDays > 0 ? `${r.worstOverdueDays}d hábiles` : "En tiempo"}
                      </td>
                      <td style={{ fontSize: ".72rem", color: SEVERITY_CFG[r.mainRisk.severity].color, maxWidth: 220 }}>{r.mainRisk.label}</td>
                      <td className="whitespace-nowrap text-[0.72rem] font-semibold" style={{ color: "var(--accent-light)" }}>Ver detalle →</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── 4. TOP RISKS & BLOCKERS ── */}
          <SectionHeader n={4} title="Top Risks & Blockers" />
          {crossRisks.length === 0 ? (
            <p className="mb-8 text-[0.8rem] text-[var(--text-muted)]">No se detectaron riesgos que crucen varios proyectos esta semana.</p>
          ) : (
            <div className="mb-8 grid grid-cols-1 gap-3.5 lg:grid-cols-3">
              {crossRisks.map((r, i) => {
                const sev = SEVERITY_CFG[r.severity];
                return (
                  <div key={i} className="flex flex-col gap-2 rounded-xl border p-4" style={{ borderColor: sev.color, background: "var(--bg-surface)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full px-2 py-0.5 text-[0.65rem] font-bold" style={{ color: sev.color, background: sev.bg }}>{sev.label}</span>
                    </div>
                    <div className="text-[0.85rem] font-bold text-[var(--text-primary)]">{r.title}</div>
                    <div className="text-[0.78rem] text-[var(--text-secondary)]">{r.detail}</div>
                    <div className="mt-1 border-t pt-2 text-[0.75rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border-subtle)" }}>
                      <strong className="text-[var(--text-secondary)]">Mitigación:</strong> {r.mitigation}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 5. RECOMENDACIONES ESTRATÉGICAS ── */}
          <SectionHeader n={5} title="Recomendaciones Estratégicas" />
          <div className="mb-4 flex flex-col gap-2.5 rounded-xl border p-4" style={{ borderColor: "var(--accent)", background: "var(--bg-accent-soft)" }}>
            {recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2.5 text-[0.85rem] text-[var(--text-primary)]">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold" style={{ background: "var(--accent)", color: "#fff" }}>
                  {i + 1}
                </span>
                <span>{rec}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SectionHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-3 mt-8 flex items-center gap-2.5 first:mt-0">
      <span className="flex h-6 w-6 items-center justify-center rounded-full text-[0.7rem] font-bold" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
        {n}
      </span>
      <h2 className="text-base font-bold text-[var(--text-primary)]">{title}</h2>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// VISTA 2 — Detalle de proyecto
// ═══════════════════════════════════════════════════════════════════════
function Breadcrumb({ projectName, allBoards, currentId, onBack, onSwitch }: {
  projectName: string; allBoards: ProjBoard[]; currentId: string; onBack: () => void; onSwitch: (id: string) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <nav className="flex items-center gap-2 text-[0.82rem]" aria-label="Breadcrumb">
        <button type="button" onClick={onBack} className="font-semibold text-[var(--accent-light)] transition-colors hover:underline">
          Resumen Ejecutivo
        </button>
        <span className="text-[var(--text-disabled)]">/</span>
        <span className="font-semibold text-[var(--text-primary)]">{projectName}</span>
      </nav>
      <div className="flex items-center gap-2">
        <label htmlFor="project-switch" className="text-[0.68rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Cambiar proyecto</label>
        <select
          id="project-switch"
          value={currentId}
          onChange={(e) => onSwitch(e.target.value)}
          className="min-w-[220px] rounded-lg border px-2.5 py-1.5 text-[0.8rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
        >
          {allBoards.map((b) => {
            const { code, name } = splitBoardName(b.name);
            return <option key={b.id} value={b.id}>{code ? `${code} · ${name}` : name}</option>;
          })}
        </select>
      </div>
    </div>
  );
}

// ── Estado de una fase (para el stepper) ────────────────────────────────
type PhaseState = "done" | "off-track" | "current" | "pending";
function phaseState(p: PhaseSummary): PhaseState {
  if (p.total > 0 && p.done === p.total) return "done";
  if (p.offTrack) return "off-track";
  if (p.started) return "current";
  return "pending";
}
const PHASE_CFG: Record<PhaseState, { color: string; bg: string; icon: string; label: string }> = {
  done:        { color: "var(--ok)",           bg: "var(--health-on-track-bg)",  icon: "✓", label: "Completada" },
  "off-track": { color: "var(--bad)",          bg: "var(--health-off-track-bg)", icon: "✕", label: "Atrasada" },
  current:     { color: "var(--accent)",       bg: "var(--bg-accent-soft)",      icon: "●", label: "En curso" },
  pending:     { color: "var(--text-disabled)", bg: "var(--bg-hover)",           icon: "○", label: "Pendiente" },
};

// ── Mensaje explicativo del estimado (para que sea legible sin leer números) ──
function estimateMessage(summary: ProjectSummary): { icon: string; color: string; text: string } {
  const { completion, delay } = summary;
  if (completion.isComplete) {
    return { icon: "✅", color: "var(--ok)", text: `Proyecto completado el ${fmtDate(completion.actualFinish)}.` };
  }
  if (!completion.plannedFinish) {
    return { icon: "—", color: "var(--text-muted)", text: "No hay fechas planificadas suficientes en Monday para estimar un cierre." };
  }
  const base = completion.scheduleSlipDays > 0
    ? `El plan original vencía el ${fmtDate(completion.plannedFinish)} y ya acumula ${fmtDays(completion.scheduleSlipDays)} hábiles de atraso.`
    : `Según el plan, el hito más tardío vence el ${fmtDate(completion.plannedFinish)}.`;
  const hasTrend = delay.avgSlipDays > 0;
  const trend = hasTrend
    ? ` Este proyecto ya entregó ${delay.lateDoneCount} hito${delay.lateDoneCount === 1 ? "" : "s"} con atraso (promedio de ${fmtDays(delay.avgSlipDays)} hábiles). Si la tendencia se mantiene, el cierre proyectado es el ${fmtDate(completion.estimatedFinish)}.`
    : " Sin atrasos históricos registrados en este proyecto, así que el estimado coincide con el plan.";
  const warn = hasTrend || completion.scheduleSlipDays > 0;
  return { icon: warn ? "📈" : "🟢", color: warn ? "var(--warn)" : "var(--ok)", text: base + trend };
}

function ProjectDetailView({ board, items, projItemBaselines, allBoards, onBack, onSwitch }: {
  board: ProjBoard; items: ProjItem[]; projItemBaselines: Record<string, ProjItemBaseline>;
  allBoards: ProjBoard[]; onBack: () => void; onSwitch: (id: string) => void;
}) {
  const summary = useMemo(() => buildProjectSummary(items), [items]);
  const health = useMemo(() => deriveBoardHealth(calcBoardMetrics(items, projItemBaselines)), [items, projItemBaselines]);
  const { code, name } = splitBoardName(board.name);
  const healthCfg = health.healthStatus ? HEALTH_CFG[health.healthStatus] : null;
  const est = estimateMessage(summary);

  const overdue = useMemo(() => {
    const t = today();
    return summary.units
      .filter((u) => u.status !== "Done" && u.estado === "ATRASADO" && u.deadline)
      .map((u) => ({ u, daysLate: businessDays(u.deadline!, t) }))
      .sort((a, b) => b.daysLate - a.daysLate)
      .slice(0, 6);
  }, [summary.units]);

  return (
    <div>
      <Breadcrumb projectName={name} allBoards={allBoards} currentId={board.id} onBack={onBack} onSwitch={onSwitch} />

      {items.length === 0 ? (
        <EmptyRow msg="Este proyecto no tiene items en Monday." />
      ) : (
        <>
          {/* Encabezado del proyecto */}
          <div className="mb-5 flex flex-wrap items-center gap-2.5">
            {code && (
              <span className="rounded-full px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
                {code}
              </span>
            )}
            <h2 className="text-xl font-bold text-[var(--text-primary)]">{name}</h2>
            {board.benefitType && (
              <span
                className="rounded-full px-2 py-0.5 text-[0.7rem] font-semibold"
                style={{ color: board.benefitType === "HardSaving" ? "#10b981" : "#8b5cf6", background: (board.benefitType === "HardSaving" ? "#10b981" : "#8b5cf6") + "22" }}
              >
                {board.benefitType}
              </span>
            )}
          </div>
          <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1 text-[0.8rem] text-[var(--text-secondary)]">
            {board.pm && <span>PM: <strong className="text-[var(--text-primary)]">{board.pm}</strong></span>}
            {board.sponsor && <span>Sponsor: <strong className="text-[var(--text-primary)]">{board.sponsor}</strong></span>}
            {board.cku && <span>CKU: <strong className="text-[var(--text-primary)]">{board.cku}</strong></span>}
            {board.estrategia && <span>Estrategia: <strong className="text-[var(--text-primary)]">{board.estrategia}</strong></span>}
          </div>

          {/* KPIs */}
          <div className="mb-2 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard value={`${summary.progress.pct}%`} label="Avance" />
            <StatCard
              value={healthCfg ? `${healthCfg.icon} ${healthCfg.label}` : "—"}
              label={`Salud${health.healthIndex !== null ? ` · VEM ${Math.round(health.healthIndex * 100)}%` : ""}`}
              color={healthCfg?.color}
              borderColor={healthCfg?.color}
              valueSize="1.25rem"
            />
            <StatCard
              value={summary.delay.overdueCount > 0 ? fmtDays(summary.delay.worstOverdueDays) : "Sin atrasos"}
              label={summary.delay.overdueCount > 0 ? `Atraso actual · ${summary.delay.overdueCount} hito${summary.delay.overdueCount === 1 ? "" : "s"}` : "Atraso actual"}
              color={summary.delay.overdueCount > 0 ? "var(--bad)" : "var(--ok)"}
              borderColor={summary.delay.overdueCount > 0 ? "var(--bad)" : undefined}
              valueSize="1.4rem"
            />
            <StatCard value={fmtDate(summary.completion.plannedFinish)} label="Fecha planificada" valueSize="1.2rem" />
            <StatCard
              value={fmtDate(summary.completion.estimatedFinish)}
              label="Estimado de cierre (predictivo)"
              color={est.color}
              borderColor={est.color}
              valueSize="1.2rem"
            />
          </div>

          {/* Barra de avance global */}
          <div className="mb-6 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${summary.progress.pct}%`, background: healthCfg?.color ?? "var(--accent)" }} />
          </div>

          {/* Explicación del estimado */}
          <div className="mb-3 rounded-xl border p-4 text-[0.82rem] leading-relaxed" style={{ borderColor: est.color, background: "var(--bg-surface)", color: "var(--text-secondary)" }}>
            <span className="mr-1.5">{est.icon}</span>
            {est.text}
          </div>

          {/* Presupuesto (EVM), compacto */}
          <div className="mb-8 flex flex-wrap gap-x-6 gap-y-1.5 text-[0.75rem] text-[var(--text-muted)]">
            <span>EV: <strong style={{ color: "#10b981" }}>{health.ev ? fmtMoney(health.ev) : "$0"}</strong></span>
            <span>PV: <strong style={{ color: "#f59e0b" }}>{health.pv ? fmtMoney(health.pv) : "$0"}</strong></span>
            <span>AC: <strong style={{ color: "#94a3b8" }}>{health.ac ? fmtMoney(health.ac) : "$0"}</strong></span>
            <span>SPI: <strong className="text-[var(--text-secondary)]">{health.spi !== null ? health.spi.toFixed(2) : "—"}</strong></span>
            <span>CPI: <strong className="text-[var(--text-secondary)]">{health.cpi !== null ? health.cpi.toFixed(2) : "—"}</strong></span>
            <span>Scope: <strong className="text-[var(--text-secondary)]">{health.scope !== null ? `${health.scope.toFixed(0)}%` : "—"}</strong></span>
          </div>

          {/* Timeline por fase */}
          <h3 className="mb-3 text-[0.95rem] font-bold text-[var(--text-primary)]">Línea de tiempo del proyecto</h3>
          <PhaseTimeline phases={summary.phases} units={summary.units} estimatedFinish={summary.completion.estimatedFinish} />

          {/* Hitos atrasados */}
          <MilestoneList
            title="Hitos atrasados"
            empty="Sin hitos atrasados. 🎉"
            rows={overdue.map(({ u, daysLate }) => ({
              id: u.id, name: u.name, grupo: u.grupo,
              dateLabel: fmtDate(u.deadline),
              responsible: u.responsible,
              tag: `${fmtDays(daysLate)} de atraso`,
              tone: "bad" as const,
            }))}
          />
        </>
      )}
    </div>
  );
}

// ── Línea de tiempo gráfica por fase (Gantt compacto) ────────────────────
// Una fila por fase, en un único eje de calendario compartido: barra = rango
// de fechas de sus hitos, relleno = % avance, rombos = cada hito individual
// (verde=cumplido, rojo=atrasado, hueco=pendiente). Líneas verticales para
// "Hoy" y el cierre estimado (predictivo), para ver de un vistazo qué tan
// lejos está cada fase de la fecha proyectada de cierre.
interface PhaseTimelineRow {
  phase: PhaseSummary;
  cfg: (typeof PHASE_CFG)[PhaseState];
  hasDates: boolean;
  barStart: number | null; barEnd: number | null;
  overdueEnd: number | null; // fin del segmento de atraso (hasta hoy), si aplica
  milestones: { id: string; name: string; date: Date; isDone: boolean; isLate: boolean; responsible: string }[];
}

function PhaseTimeline({ phases, units, estimatedFinish }: { phases: PhaseSummary[]; units: WorkUnit[]; estimatedFinish: Date | null }) {
  const [nowMs] = useState(() => Date.now()); // "hoy" fijado al montar (evita impureza en render)

  const domain = useMemo(() => {
    const dates: number[] = [nowMs];
    units.forEach((u) => {
      if (u.deadline) dates.push(u.deadline.getTime());
      if (u.actualEnd) dates.push(u.actualEnd.getTime());
    });
    if (estimatedFinish) dates.push(estimatedFinish.getTime());
    const min = startOfMonth(new Date(Math.min(...dates)));
    const max = addMonth(new Date(Math.max(...dates)));
    return { min, max, span: Math.max(max.getTime() - min.getTime(), 1) };
  }, [units, estimatedFinish, nowMs]);

  const pct = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - domain.min.getTime()) / domain.span) * 100));
  const ticks = monthTicks(domain.min, domain.max);
  const todayX = pct(new Date(nowMs));
  const estX = estimatedFinish ? pct(estimatedFinish) : null;
  const chartMinWidth = 190 + Math.max(ticks.length, 3) * 92;

  if (!phases.length) return <EmptyRow msg="Este proyecto no tiene fases." />;

  const rows: PhaseTimelineRow[] = phases.map((p) => {
    const cfg = PHASE_CFG[phaseState(p)];
    const list = units.filter((u) => u.grupo === p.grupo);
    const barDates: number[] = [];
    const milestones: PhaseTimelineRow["milestones"] = [];
    list.forEach((u) => {
      const d = u.actualEnd ?? u.deadline;
      if (!d) return;
      if (u.deadline) barDates.push(u.deadline.getTime());
      if (u.actualEnd) barDates.push(u.actualEnd.getTime());
      milestones.push({ id: u.id, name: u.name, date: d, isDone: u.status === "Done", isLate: u.status !== "Done" && u.estado === "ATRASADO", responsible: u.responsible });
    });
    const hasDates = barDates.length > 0;
    const barStart = hasDates ? Math.min(...barDates) : null;
    const barEnd = hasDates ? Math.max(...barDates) : null;
    const notDone = p.total === 0 || p.done < p.total;
    const overdueEnd = hasDates && notDone && barEnd! < nowMs ? nowMs : null;
    return { phase: p, cfg, hasDates, barStart, barEnd, overdueEnd, milestones };
  });

  return (
    <div className="mb-8 overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      <div style={{ minWidth: chartMinWidth }}>
        {/* Eje */}
        <div className="flex items-end border-b" style={{ borderColor: "var(--border)" }}>
          <div style={{ width: 190 }} className="shrink-0 px-3 py-2 text-[0.68rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Fase
          </div>
          <div className="relative h-9 flex-1">
            {ticks.map((t, i) => (
              <div key={i} className="absolute top-0 h-full" style={{ left: `${pct(t.date)}%` }}>
                <div className="h-full w-px" style={{ background: "var(--border)" }} />
                <span className="absolute top-1 left-1 whitespace-nowrap text-[0.66rem] text-[var(--text-muted)]">{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Filas */}
        {rows.map((r) => (
          <div
            key={r.phase.grupo}
            className="flex items-stretch border-b transition-colors last:border-b-0 hover:bg-[var(--bg-hover)]"
            style={{ borderColor: "var(--border)" }}
          >
            <div style={{ width: 190 }} className="shrink-0 px-3 py-2.5">
              <div className="truncate text-[0.78rem] font-semibold text-[var(--text-primary)]" title={r.phase.grupo}>{r.phase.grupo || "Sin grupo"}</div>
              <div className="mt-0.5 flex items-center gap-1 text-[0.65rem] font-semibold" style={{ color: r.cfg.color }}>
                {r.cfg.icon} {r.cfg.label} <span className="font-normal text-[var(--text-muted)]">· {r.phase.done}/{r.phase.total}</span>
              </div>
            </div>

            <div className="relative flex-1" style={{ minHeight: 52 }}>
              {ticks.map((t, i) => (
                <div key={i} className="absolute top-0 bottom-0 w-px" style={{ left: `${pct(t.date)}%`, background: "var(--border)", opacity: 0.5 }} />
              ))}
              {estX != null && (
                <div className="absolute top-0 bottom-0" title="Cierre estimado (predictivo)" style={{ left: `${estX}%`, width: 2, background: "var(--warn)", opacity: 0.6 }} />
              )}
              <div className="absolute top-0 bottom-0" title="Hoy" style={{ left: `${todayX}%`, width: 2, background: "var(--accent)", opacity: 0.7 }} />

              {!r.hasDates ? (
                <div className="flex h-full items-center pl-2 text-[0.72rem] italic text-[var(--text-disabled)]">— sin fechas —</div>
              ) : (
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
                  {/* Rango planificado de la fase */}
                  <div
                    className="absolute h-2 rounded-full"
                    style={{ left: `${pct(new Date(r.barStart!))}%`, width: `${Math.max(pct(new Date(r.barEnd!)) - pct(new Date(r.barStart!)), 0.6)}%`, background: "var(--bg-hover)", border: `1px solid ${r.cfg.color}` }}
                  />
                  {/* Relleno de avance (% de hitos Done) */}
                  <div
                    className="absolute h-2 rounded-full"
                    style={{ left: `${pct(new Date(r.barStart!))}%`, width: `${Math.max((pct(new Date(r.barEnd!)) - pct(new Date(r.barStart!))) * (r.phase.total ? r.phase.done / r.phase.total : 0), r.phase.done > 0 ? 0.6 : 0)}%`, background: r.cfg.color }}
                  />
                  {/* Atraso: fin de la fase → hoy */}
                  {r.overdueEnd != null && (
                    <div
                      className="absolute h-2 rounded-full"
                      title="Sigue abierta, pasado su rango planificado"
                      style={{ left: `${pct(new Date(r.barEnd!))}%`, width: `${Math.max(pct(new Date(r.overdueEnd))- pct(new Date(r.barEnd!)), 0.6)}%`, background: "var(--bad)", opacity: 0.55 }}
                    />
                  )}
                  {/* Hitos individuales */}
                  {r.milestones.map((m) => {
                    const color = m.isDone ? "var(--ok)" : m.isLate ? "var(--bad)" : "var(--text-muted)";
                    return (
                      <div
                        key={m.id}
                        className="absolute rounded-[2px]"
                        title={`${m.name} · ${fmtDate(m.date)} · ${m.isDone ? "Cumplido" : m.isLate ? "Atrasado" : "Pendiente"}${m.responsible ? ` · A cargo: ${m.responsible}` : ""}`}
                        style={{
                          left: `${pct(m.date)}%`, top: -3, width: 9, height: 9, transform: "translateX(-4.5px) rotate(45deg)",
                          background: m.isDone || m.isLate ? color : "var(--bg-surface)",
                          border: `2px solid ${color}`, boxShadow: "0 0 0 2px var(--bg-surface)",
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Lista compacta de hitos (próximos / atrasados) ──────────────────────
interface MilestoneRow { id: string; name: string; grupo: string; dateLabel: string; responsible?: string; tag: string; tone: "neutral" | "bad" }
function MilestoneList({ title, empty, rows }: { title: string; empty: string; rows: MilestoneRow[] }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      <h4 className="mb-3 text-[0.85rem] font-bold text-[var(--text-primary)]">{title}</h4>
      {rows.length === 0 ? (
        <div className="py-4 text-center text-[0.78rem] text-[var(--text-muted)]">{empty}</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 border-b pb-2.5 last:border-b-0 last:pb-0" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="min-w-0">
                <div className="truncate text-[0.8rem] font-medium text-[var(--text-primary)]" title={r.name}>{r.name}</div>
                <div className="truncate text-[0.68rem] text-[var(--text-muted)]" title={r.grupo}>
                  {r.grupo} · {r.dateLabel}
                  {r.responsible && <> · A cargo: <span className="text-[var(--text-secondary)]">{r.responsible}</span></>}
                </div>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold"
                style={{ color: r.tone === "bad" ? "var(--bad)" : "var(--text-secondary)", background: r.tone === "bad" ? "var(--bad-bg)" : "var(--bg-hover)" }}
              >
                {r.tag}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
