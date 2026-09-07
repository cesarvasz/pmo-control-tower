"use client";

// Resumen Ejecutivo — página única para C-Level/Directores: por defecto muestra
// el PORTAFOLIO completo (semáforo, KPIs de portafolio, tabla, riesgos y
// recomendaciones); al hacer clic en cualquier proyecto (fila de la tabla,
// tarjeta crítica o el selector rápido) carga el DETALLE de ese proyecto en la
// misma página, sin navegar a otra ruta — el estado vive en el query param
// ?board=, así que el botón atrás/adelante del navegador funciona como se
// espera. Toda la lógica de agregación vive en lib/portfolioSummary.ts y
// lib/projSummary.ts (puras, con tests) — esta página solo arma la presentación.

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useData } from "@/context/DataContext";
import { businessDays, fmtDate, fmtMoney, today } from "@/lib/business";
import { calcBoardMetrics, deriveBoardHealth, splitBoardName } from "@/lib/proj";
import { isFase3, isDesarrolloPorIteracionesStep, projStageAmounts } from "@/lib/dashboard";
import { classifyDev } from "@/lib/devTimeline";
import {
  buildProjectSummary, calcAtrasoActualDias, calcPlannedProgress, currentPhaseIndex, enScope, evaluarStepAtraso, flattenBoardUnits, groupFase3Units, phaseState,
  type PhaseSummary, type PhaseState, type Responsabilidad, type StepAtraso, type WorkUnit,
} from "@/lib/projSummary";
import { countByResponsible } from "@/lib/delay";
import {
  buildPortfolioRows, calcPortfolioTotals, topCriticalProjects, buildCrossRisks,
  type PortfolioProjectRow, type CrossRisk,
} from "@/lib/portfolioSummary";
import { HEALTH_CFG } from "@/lib/health";
import { VALOR_STAGES, valorLateStages, valorProgress } from "@/lib/valorStepper";
import {
  BOLT_PATH, CARD_BG, CRITICAL, CRITICAL_BG, GOOD, GOOD_BG, GRID, INK, INK_MUTED,
  INK_SEC, NAVY, NEUTRAL_BG, NEUTRAL_LINE, ROLE_PALETTE, SURFACE, TONE, WARNING,
  WARNING_BG, WARNING_FILL, spiTone, type Tone,
} from "@/lib/reportTheme";
import { addMonth, monthTicks, startOfMonth } from "@/lib/dateAxis";
import { EmptyRow, ErrorBox, Loader, StatCard } from "@/components/ui";
import AtrasoDetalleEditor from "@/components/AtrasoDetalleEditor";
import ProjectPdfReport from "@/components/ProjectPdfReport";
import { downloadElementAsPdf } from "@/lib/pdf";
import type { ProjBoard, ProjItem, ProjItemBaseline } from "@/types";

const fmtDays = (n: number) => `${n} día${Math.abs(n) === 1 ? "" : "s"}`;

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
function Breadcrumb({ projectName, allBoards, currentId, onBack, onSwitch, onDownloadPdf, downloadingPdf }: {
  projectName: string; allBoards: ProjBoard[]; currentId: string; onBack: () => void; onSwitch: (id: string) => void;
  onDownloadPdf: () => void; downloadingPdf: boolean;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <nav className="flex items-center gap-2 text-[0.82rem]" aria-label="Breadcrumb">
        <button type="button" onClick={onBack} className="font-semibold text-[var(--accent-light)] transition-colors hover:underline print:hidden">
          Resumen Ejecutivo
        </button>
        <span className="text-[var(--text-disabled)] print:hidden">/</span>
        <span className="font-semibold text-[var(--text-primary)]">{projectName}</span>
      </nav>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
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
        <button
          type="button"
          onClick={onDownloadPdf}
          disabled={downloadingPdf}
          className="rounded-lg border px-3 py-1.5 text-[0.78rem] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-60"
          style={{ borderColor: "var(--border)" }}
        >
          {downloadingPdf ? "Generando…" : "↓ Descargar PDF"}
        </button>
      </div>
    </div>
  );
}

// ── Estado de una fase (para el stepper) ────────────────────────────────
// 4 colores: verde (completada), ROJO (atrasada — cualquier fase, o cualquier
// step de Fase 3, con un item atrasado / en Stuck, mismo criterio que la tabla
// de Atrasos, ver enScope), ámbar (la fase actual que "bloquea" el avance, ver
// currentPhaseIndex) y gris (pendiente). El rojo tiene prioridad sobre el
// ámbar: si la fase actual además está atrasada, se pinta roja (ver buildRow).
// Colores del spec del "Status Ejecutivo" (ver lib/reportTheme.ts) — mismos
// que el PDF. `fill` = relleno de la barra de avance (la actual va ámbar
// sólido); `color` = trazo/etiqueta; `bg` = tinte de la celda de fase.
const PHASE_CFG: Record<PhaseState, { color: string; bg: string; fill: string; icon: string }> = {
  done:    { color: GOOD,          bg: GOOD_BG,     fill: GOOD,         icon: "✓" },
  current: { color: WARNING,       bg: WARNING_BG,  fill: WARNING_FILL, icon: "●" },
  pending: { color: INK_MUTED,     bg: NEUTRAL_BG,  fill: INK_MUTED,    icon: "○" },
};
/** Config roja para una fase (o step de Fase 3) con `offTrack` — se aplica en
 *  buildRow con prioridad sobre PHASE_CFG. */
const LATE_CFG = { color: CRITICAL, bg: CRITICAL_BG, fill: CRITICAL, icon: "⚠" };
/** Texto de estado de una fase — independiente del color (ver PHASE_CFG):
 *  "Atrasada" se muestra para CUALQUIER fase con offTrack, sea o no la actual. */
function phaseLabel(p: PhaseSummary, isCurrent: boolean): string {
  if (p.total > 0 && p.done === p.total) return "Completada";
  if (p.offTrack) return "Atrasada";
  return isCurrent ? "En curso" : "Pendiente";
}

function ProjectDetailView({ board, items, projItemBaselines, allBoards, onBack, onSwitch }: {
  board: ProjBoard; items: ProjItem[]; projItemBaselines: Record<string, ProjItemBaseline>;
  allBoards: ProjBoard[]; onBack: () => void; onSwitch: (id: string) => void;
}) {
  // Marca <html> mientras esta vista está montada: el CSS de impresión (ver
  // globals.css) solo encoge el reporte a una hoja A4 cuando esta clase está
  // presente — así no afecta el print de cualquier otra página de la app.
  useEffect(() => {
    document.documentElement.classList.add("print-report-active");
    return () => document.documentElement.classList.remove("print-report-active");
  }, []);

  const summary = useMemo(() => buildProjectSummary(items), [items]);
  const health = useMemo(() => deriveBoardHealth(calcBoardMetrics(items, projItemBaselines)), [items, projItemBaselines]);
  // Beneficio $ / Costo $ (Validación / Aprobación / Confirmación) — misma
  // fuente que el modal de Costo/Beneficio por PM (projStageAmounts), acá
  // aplicada solo a los items de ESTE board. Acumulativa: Confirmación ⇒
  // también cuenta como Aprobación (a su valor aprobado / Business Case).
  const stageAmounts = useMemo(() => projStageAmounts(items), [items]);
  // Costo del proyecto: el del Business Case (Aprobación), que se mantiene
  // aun confirmado — se completa hacia atrás con Validación si aún no se
  // aprueba, para que la tarjeta no quede vacía.
  const costoProyecto = stageAmounts?.aprobacion?.cost ?? stageAmounts?.validacion?.cost;
  // Beneficio $ (tarjeta) y base de ROI/Payback: el MEJOR beneficio conocido
  // (Confirmado > Aprobado > Validado) — mismas fórmulas que ProjectReportModal
  // (ROI %, Payback en meses).
  const beneficioParaRoi = stageAmounts?.confirmacion?.benefit ?? stageAmounts?.aprobacion?.benefit ?? stageAmounts?.validacion?.benefit;
  // Valor $ (tarjeta): Beneficio − Costo. Solo se muestra si se conocen AMBOS
  // (no se asume 0 en el que falte, para no inflar/deflar el neto).
  const valorProyecto = costoProyecto != null && beneficioParaRoi != null ? beneficioParaRoi - costoProyecto : null;
  const roi = costoProyecto && costoProyecto > 0 ? ((beneficioParaRoi ?? 0) - costoProyecto) / costoProyecto * 100 : null;
  const payback = costoProyecto && beneficioParaRoi && beneficioParaRoi > 0 ? costoProyecto / (beneficioParaRoi / 12) : null;
  // Avance planificado: % de hitos/steps que YA deberían estar Done según su
  // propio deadline (venció o es Done), sin importar si en verdad lo están —
  // lo que deberíamos llevar avanzado a la fecha según el plan, sin restarle
  // los atrasos actuales. Comparado con el Avance real da la brecha física.
  const avancePlanificado = calcPlannedProgress(summary.units, summary.phases);
  // SPI (simplificado): Avance real / Avance planificado — mide si vamos más
  // rápido o más lento que el plan, no en dólares (EV/PV) sino en % físico.
  // Sin plan aún (avancePlanificado=0) no hay contra qué comparar → null.
  const spi = avancePlanificado > 0 ? Math.round((summary.progress.pct / avancePlanificado) * 100) : null;
  const { code, name } = splitBoardName(board.name);
  const healthCfg = health.healthStatus ? HEALTH_CFG[health.healthStatus] : null;
  const healthTone: Tone = health.healthStatus === "off-track" ? "crit"
    : health.healthStatus === "in-risk" ? "warn"
    : health.healthStatus === "on-track" ? "good" : "neutral";
  // Etapa VALOR actual + bandas en atraso (stepper del encabezado, ver lib/valorStepper.ts).
  const valor = useMemo(() => valorProgress(summary.phases), [summary.phases]);
  const valorLate = useMemo(() => valorLateStages(summary.phases), [summary.phases]);
  // Días de deslizamiento del cierre estimado vs el plan (para la tarjeta
  // "Cierre estimado"): la diferencia real plan→estimado, o el atraso ya
  // vencido de Fase 4 si aún no hay estimado más allá del plan.
  const { plannedFinish, estimatedFinish } = summary.completion;
  const slipVsPlan = plannedFinish && estimatedFinish && estimatedFinish > plannedFinish
    ? businessDays(plannedFinish, estimatedFinish)
    : summary.completion.scheduleSlipDays;
  // Rango de meses del proyecto (subtítulo de la línea de tiempo).
  const mesesLabel = useMemo(() => {
    const ds = summary.units.flatMap((u) => [u.startDate, u.deadline, u.actualEnd]).filter((d): d is Date => d != null);
    if (!ds.length) return "";
    const f = (d: Date) => d.toLocaleDateString("es-GT", { month: "long", year: "numeric" });
    return `${f(new Date(Math.min(...ds.map((d) => d.getTime()))))} – ${f(new Date(Math.max(...ds.map((d) => d.getTime()))))}`;
  }, [summary.units]);

  // Atrasos: STEPS de Fase 3 (Launch/Desarrollo) atrasados o en Stuck — una
  // fila por step, nunca una por hito. Un step sin hitos usa su propio
  // Status/Deadline; un step CON hitos se marca atrasado si CUALQUIERA de sus
  // hitos lo está (los hitos son la fuente real de status cuando existen —
  // mismo criterio que WorkUnit en projSummary.ts), y se muestra con el peor
  // atraso entre ellos, sin desglosar cada hito en su propia fila.
  const atrasos = useMemo(() => {
    const t = today();
    return items
      .filter((it) => isFase3(it.grupo))
      .map((it) => evaluarStepAtraso(it, t))
      .filter((x): x is StepAtraso => x !== null)
      .sort((a, b) => (b.daysLate ?? 0) - (a.daysLate ?? 0));
  }, [items]);
  // "Atraso actual" (tarjeta) = la UNIÓN de días hábiles atrasados entre
  // todos los steps de `atrasos`, no la suma de sus daysLate — si dos steps
  // se atrasan en paralelo, los días en común solo cuentan una vez (ver
  // calcAtrasoActualDias en lib/projSummary.ts).
  const atrasoActualDias = calcAtrasoActualDias(atrasos, today());
  // % de responsabilidad del atraso (rol asignado en "Responsable atraso", ver
  // AtrasoDetalleEditor) sobre el TOTAL de atrasos actuales — uno sin asignar
  // cuenta como "Sin asignar". Calculado acá (no dentro de AtrasosList) para
  // reutilizarlo también en el PDF.
  const { data } = useData();
  const atrasoDetalles = data?.atrasoDetalles;
  const responsabilidadAtraso = useMemo(() => {
    if (atrasos.length === 0) return [];
    const counts: Record<string, number> = {};
    for (const a of atrasos) {
      const resp = atrasoDetalles?.[a.id]?.responsable || "Sin asignar";
      counts[resp] = (counts[resp] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([label, n]) => ({ label, pct: Math.round((n / atrasos.length) * 100) }))
      .sort((a, b) => b.pct - a.pct || a.label.localeCompare(b.label));
  }, [atrasos, atrasoDetalles]);

  // PDF: NO es un window.print() de la página — ProjectPdfReport (oculto,
  // fuera de pantalla) arma un layout propio a tamaño de hoja A4 vertical, que
  // se captura y empaqueta en un PDF real vía lib/pdf.ts (descarga directa).
  const pdfRef = useRef<HTMLDivElement>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const handleDownloadPdf = async () => {
    if (!pdfRef.current || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      await downloadElementAsPdf(pdfRef.current, `${code ? `${code}-` : ""}${name}.pdf`);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div>
      <Breadcrumb
        projectName={name} allBoards={allBoards} currentId={board.id} onBack={onBack} onSwitch={onSwitch}
        onDownloadPdf={handleDownloadPdf} downloadingPdf={downloadingPdf}
      />
      <ProjectPdfReport
        ref={pdfRef}
        board={board} code={code} name={name} summary={summary} health={health}
        healthLabel={healthCfg ? `${healthCfg.icon} ${healthCfg.label}` : "—"}
        atrasos={atrasos} avancePlanificado={avancePlanificado}
        responsabilidadAtraso={responsabilidadAtraso}
        atrasoDetalles={atrasoDetalles}
        valorProyecto={valorProyecto} roi={roi} payback={payback}
      />

      {items.length === 0 ? (
        <EmptyRow msg="Este proyecto no tiene items en Monday." />
      ) : (
        // Isla de tema CLARO fijo: el reporte en pantalla debe verse igual que
        // su PDF (paleta del spec `status-pdf`), sin importar el tema global.
        <div data-theme="light" className="rounded-2xl p-5 sm:p-7" style={{ background: SURFACE, color: INK, border: `1px solid ${GRID}` }}>
          {/* Encabezado tipo reporte ejecutivo (logo + stepper VALOR) */}
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b-2 pb-3" style={{ borderColor: NAVY }}>
            <div className="flex items-center gap-3">
              <img src="/pmo-logo.png" alt="PMO" className="h-9 w-auto" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="border-r pr-2 text-[0.62rem] font-bold uppercase tracking-[0.15em]" style={{ color: INK_MUTED, borderColor: GRID }}>Reporte Proyecto</span>
                  {code && <span className="text-[1.3rem] font-extrabold" style={{ color: NAVY }}>{code}</span>}
                  <h2 className="text-[1.3rem] font-extrabold" style={{ color: INK }}>{name}</h2>
                  <BoltIcon />
                  {board.benefitType && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[0.7rem] font-semibold"
                      style={{ color: board.benefitType === "HardSaving" ? "#10b981" : "#8b5cf6", background: (board.benefitType === "HardSaving" ? "#10b981" : "#8b5cf6") + "22" }}
                    >
                      {board.benefitType}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[0.72rem]" style={{ color: INK_MUTED }}>Generado el {fmtDate(today())}</div>
              </div>
            </div>
            <ValorStepperScreen current={valor.current} allDone={valor.allDone} lateStages={valorLate} />
          </div>
          <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1.5 text-[0.95rem] text-[var(--text-secondary)]">
            {board.pm && <span>PM: <strong className="text-[var(--text-primary)]">{board.pm}</strong></span>}
            {board.sponsor && <span>Sponsor: <strong className="text-[var(--text-primary)]">{board.sponsor}</strong></span>}
            {board.cku && <span>CKU: <strong className="text-[var(--text-primary)]">{board.cku}</strong></span>}
            {board.estrategia && <span>Estrategia: <strong className="text-[var(--text-primary)]">{board.estrategia}</strong></span>}
          </div>

          {/* KPIs — fila única de 8 tarjetas con color semántico (mismo diseño que el PDF) */}
          <div className="report-kpis mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 print:break-inside-avoid">
            <KpiTile
              label="Avance vs Plan"
              value={`${summary.progress.pct}% / ${avancePlanificado}%`}
              sub={`SPI ${spi !== null ? (spi / 100).toFixed(2) : "—"}`}
              tone={spiTone(spi === null ? null : spi / 100)}
            />
            <KpiTile
              label="Salud (EVM)"
              value={health.healthIndex !== null ? `${Math.round(health.healthIndex * 100)}%` : healthCfg ? `${healthCfg.icon} ${healthCfg.label}` : "—"}
              sub={health.healthIndex !== null && healthCfg ? `${healthCfg.icon} ${healthCfg.label}` : undefined}
              tone={healthTone}
              solid
            />
            <KpiTile
              label="Atraso actual"
              value={atrasos.length > 0 ? `${atrasoActualDias} d hábiles` : "Sin atrasos"}
              sub={atrasos.length > 0 ? `${atrasos.length} step${atrasos.length === 1 ? "" : "s"} atrasado${atrasos.length === 1 ? "" : "s"}` : undefined}
              tone={atrasos.length > 0 ? "crit" : "good"}
            />
            <KpiTile label="Fecha cierre plan" value={fmtDate(summary.completion.plannedFinish)} tone="neutral" />
            <KpiTile
              label="Cierre estimado"
              value={fmtDate(summary.completion.estimatedFinish)}
              sub={slipVsPlan > 0 ? `+${slipVsPlan} días vs plan` : summary.completion.plannedFinish ? "en fecha" : undefined}
              tone={slipVsPlan > 0 ? "warn" : summary.completion.plannedFinish ? "good" : "neutral"}
            />
            <KpiTile
              label="Valor generado"
              value={fmtMoney(valorProyecto)}
              tone={valorProyecto !== null ? (valorProyecto >= 0 ? "good" : "crit") : "neutral"}
            />
            <KpiTile
              label="ROI"
              value={roi !== null ? `${Math.round(roi).toLocaleString("en-US")}%` : "—"}
              sub={roi !== null ? "Retorno inversión" : undefined}
              tone={roi !== null ? (roi >= 0 ? "good" : "crit") : "neutral"}
            />
            <KpiTile
              label="Payback"
              value={payback !== null ? `${payback.toFixed(1)} meses` : "—"}
              tone="neutral"
            />
          </div>

          {/* Línea de tiempo del proyecto */}
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-[1.4rem] font-bold" style={{ color: NAVY }}>Línea de tiempo del proyecto</h3>
            {mesesLabel && <span className="text-[0.78rem] text-[var(--text-muted)]">Fases VALOR y entregables de Launch · {mesesLabel}</span>}
          </div>
          <GanttLegendScreen hoy={fmtDate(today())} />
          <PhaseTimeline phases={summary.phases} units={summary.units} estimatedFinish={summary.completion.estimatedFinish} />

          {/* Causas de atraso: steps de Fase 3 atrasados o Stuck (una fila por step) */}
          <CausasDeAtraso
            rows={atrasos.map((a) => ({
              id: a.id, name: a.name,
              sub: [
                a.nHitos > 0 ? `${a.nHitos} actividad${a.nHitos === 1 ? "" : "es"}` : null,
                a.stuck ? "Stuck" : null,
                `comprometido ${fmtDate(a.deadline)}`,
              ].filter(Boolean).join(" · "),
              responsible: a.responsible,
              badge: a.daysLate != null && a.daysLate > 0 ? `${a.daysLate} d` : a.stuck ? "Stuck" : "Atrasado",
            }))}
            responsabilidad={responsabilidadAtraso}
          />
        </div>
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
  label: string;
  hasDates: boolean;
  barStart: number | null; barEnd: number | null;
  overdueEnd: number | null; // fin del segmento de atraso (hasta hoy), si aplica
  milestones: { id: string; name: string; date: Date; isDone: boolean; isLate: boolean; responsible: string }[];
}

function PhaseTimeline({ phases, units, estimatedFinish }: { phases: PhaseSummary[]; units: WorkUnit[]; estimatedFinish: Date | null }) {
  const [nowMs] = useState(() => Date.now()); // "hoy" fijado al montar (evita impureza en render)
  // Fases 3 (por grupo) actualmente expandidas — set en vez de un solo booleano
  // por si un board llegara a tener más de un grupo "Launch" a la vez.
  const [openFase3, setOpenFase3] = useState<Set<string>>(new Set());
  const toggleFase3 = (grupo: string) => setOpenFase3((s) => {
    const n = new Set(s);
    if (n.has(grupo)) n.delete(grupo); else n.add(grupo);
    return n;
  });

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

  if (!phases.length) return <EmptyRow msg="Este proyecto no tiene fases." />;

  const buildRow = (phase: PhaseSummary, list: WorkUnit[], isCurrent: boolean): PhaseTimelineRow => {
    // Rojo si la fase (o step de Fase 3) tiene algún item atrasado / en Stuck
    // — prioridad sobre el ámbar de "en curso" (ver PHASE_CFG). offTrack ya
    // implica que no está completa (enScope exige status !== "Done").
    const cfg = phase.offTrack ? LATE_CFG : PHASE_CFG[phaseState(phase, isCurrent)];
    const label = phaseLabel(phase, isCurrent);
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
    const notDone = phase.total === 0 || phase.done < phase.total;
    const overdueEnd = hasDates && notDone && barEnd! < nowMs ? nowMs : null;
    return { phase, cfg, label, hasDates, barStart, barEnd, overdueEnd, milestones };
  };

  // Fase 3 (Launch): agrupamiento en steps/hitos vía groupFase3Units (projSummary.ts
  // — mismo criterio que ya usa Calidad, calidadUnits/stepsQueMidenCalidad, y
  // reutilizado también por calcProgress para el Avance global). Acá solo se arma
  // el renglón (bar/fechas) por grupo, ordenado ASCENDENTE por la fecha de inicio
  // del CPM propio de cada uno (Start Date del hito, o del step) — sin esa fecha,
  // al final. La fila resumen (colapsada) usa el rango agregado normal (`rows`),
  // igual que el resto de las fases.
  // Comparador explícito (no resta timestamps con Infinity: Infinity - Infinity
  // da NaN, que hace el orden entre "sin fecha" indefinido) — sin fecha, al final.
  const cmpStart = (a: Date | null, b: Date | null) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return a.getTime() - b.getTime();
  };
  // Fecha de inicio "propia" de un grupo: la del hito mismo (grupos de 1 unidad,
  // plantilla vieja) o la del step padre (grupos de varias, plantilla nueva).
  const startOfGroup = (g: { units: WorkUnit[] }) =>
    isDesarrolloPorIteracionesStep(g.units[0].stepName) ? g.units[0].startDate : g.units[0].stepStartDate;
  const fase3StepRowsFor = (grupo: string): PhaseTimelineRow[] => {
    const groups = groupFase3Units(units, grupo).sort((a, b) => cmpStart(startOfGroup(a), startOfGroup(b)));
    const stepPhases: PhaseSummary[] = groups.map((g) => ({
      grupo: g.name,
      total: g.units.length,
      done: g.units.filter((u) => u.status === "Done").length,
      // MISMO criterio que la tabla de Atrasos (enScope, ver projSummary.ts):
      // un step Future Steps sin CPM/deadline cae en estado "ATRASADO" por
      // defecto (no tiene fecha, no significa que ya venció) y NO debe
      // marcarse atrasado acá si tampoco aparece en esa tabla.
      offTrack: g.units.some((u) => enScope(u.status, u.estado, u.deadline)),
      started: g.units.some((u) => classifyDev(u.status) !== "future"),
    }));
    // El step "actual" dentro de Fase 3 se decide POR SEPARADO del resto de
    // fases de nivel superior (ver currentPhaseIndex) — es el primer step sin
    // terminar de ESTE grupo, no de las 5 fases del proyecto.
    const curStepIdx = currentPhaseIndex(stepPhases);
    // buildRow ya pinta de rojo cualquier step con offTrack (ver LATE_CFG).
    return groups.map((g, i) => buildRow(stepPhases[i], g.units, i === curStepIdx));
  };

  // Fases 1, 2, 4 y 5: una sola fila con SOLO su rango (inicio→fin planificado +
  // relleno de avance + atraso si sigue abierta) — sin diamantes por hito, para no
  // saturar el timeline. Fase 3: la fila resumen reemplaza los diamantes por un
  // mini-Gantt "dividido" (una línea fina por renglón — hito o step, según la
  // plantilla, ver fase3StepRowsFor); un click expande el detalle debajo.
  const curPhaseIdx = currentPhaseIndex(phases);
  const rows: PhaseTimelineRow[] = phases.map((p, i) => buildRow(p, units.filter((u) => u.grupo === p.grupo), i === curPhaseIdx));

  // Hover informativo (nativo, título de varias líneas — mismo patrón que ya usa
  // el resto de la página) para cualquier barra/línea del timeline: nombre, estado,
  // inicio y fin reales, y si sigue abierta pasado su rango, cuánto lleva de atraso.
  const rowTooltip = (r: PhaseTimelineRow): string => {
    const lines = [r.phase.grupo || "Sin grupo", `${r.cfg.icon} ${r.label} · ${r.phase.done}/${r.phase.total}`];
    if (r.hasDates) {
      lines.push(`Inicio: ${fmtDate(new Date(r.barStart!))}`);
      lines.push(`${r.overdueEnd != null ? "Fin planificado" : "Fin"}: ${fmtDate(new Date(r.barEnd!))}`);
      if (r.overdueEnd != null) {
        const dias = businessDays(new Date(r.barEnd!), new Date(r.overdueEnd));
        lines.push(`⚠ Sigue abierta, ${fmtDays(dias)} hábiles pasado su rango planificado`);
      }
    } else {
      lines.push("Sin fechas planificadas");
    }
    return lines.join("\n");
  };

  return (
    <div className="mb-8 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      <div className="w-full">
        {/* Eje — ocupa el ancho disponible; se muestran TODOS los meses (sin saltar
            etiquetas), aunque el proyecto sea largo. */}
        <div className="flex items-end border-b" style={{ borderColor: "var(--border)" }}>
          <div style={{ width: 290 }} className="gantt-phase-col shrink-0 px-3 py-2 text-[0.68rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Fase
          </div>
          <div className="relative h-6 flex-1">
            {ticks.map((t, i) => {
              const x = pct(t.date);
              // Cerca del borde derecho, la etiqueta crece hacia la IZQUIERDA del
              // trazo (no hacia la derecha) para que no quede cortada/fuera del
              // recuadro — el mes más reciente casi siempre cae en esa zona.
              const nearRightEdge = x > 88;
              return (
                <div key={i} className="absolute top-0 h-full" style={{ left: `${x}%` }}>
                  <div className="h-full w-px" style={{ background: "var(--border)" }} />
                  {/* Etiquetas de mes chicas a propósito: son solo referencia del eje,
                      así queda más espacio/peso visual para el contenido de cada fila
                      (nombre y estado), que es lo que de verdad hay que leer. */}
                  <span
                    className={`absolute top-0.5 whitespace-nowrap text-[0.56rem] text-[var(--text-muted)] ${nearRightEdge ? "right-1" : "left-1"}`}
                  >
                    {t.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Filas */}
        {rows.map((r, i) => {
          const isF3 = isFase3(r.phase.grupo);
          const steps = isF3 ? fase3StepRowsFor(r.phase.grupo) : [];
          // Plantilla vieja: cada renglón es un HITO (subitem de "Desarrollo por
          // iteraciones..."); plantilla nueva: cada renglón es un STEP (item).
          const stepsWord = isF3 && units.some((u) => u.grupo === r.phase.grupo && isDesarrolloPorIteracionesStep(u.stepName)) ? "hito" : "step";
          const isOpen = isF3 && openFase3.has(r.phase.grupo);
          return (
            <Fragment key={`${r.phase.grupo}-${i}`}>
              <div
                className={`flex items-stretch border-b transition-colors last:border-b-0 hover:bg-[var(--bg-hover)] ${isF3 ? "cursor-pointer select-none" : ""}`}
                style={{ borderColor: "var(--border)", minHeight: 66 }}
                onClick={isF3 ? () => toggleFase3(r.phase.grupo) : undefined}
              >
                <div style={{ width: 290, background: r.cfg.bg }} className="gantt-phase-col flex shrink-0 flex-col justify-center gap-1 px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {isF3 && (
                      <span
                        className="inline-block shrink-0 text-[0.6rem] text-[var(--accent)]"
                        style={{ transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : undefined }}
                      >▶</span>
                    )}
                    <div className="text-[1.05rem] font-semibold leading-snug text-[var(--text-primary)]" title={r.phase.grupo}>{r.phase.grupo || "Sin grupo"}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-1 text-[0.8rem] font-semibold leading-snug" style={{ color: r.cfg.color }}>
                    {r.cfg.icon} {r.label} <span className="font-normal text-[var(--text-muted)]">· {r.phase.done}/{r.phase.total}</span>
                    {isF3 && <span className="font-normal text-[var(--text-muted)]">· {steps.length} {stepsWord}{steps.length === 1 ? "" : "s"}</span>}
                  </div>
                </div>

                <div className="gantt-row-track relative flex-1" style={{ minHeight: 66 }}>
                  {ticks.map((t, i) => (
                    <div key={i} className="absolute top-0 bottom-0 w-px" style={{ left: `${pct(t.date)}%`, background: "var(--border)", opacity: 0.5 }} />
                  ))}
                  {estX != null && (
                    <div className="absolute top-0 bottom-0" title="Cierre estimado (predictivo)" style={{ left: `${estX}%`, width: 2, background: WARNING, opacity: 0.7 }} />
                  )}
                  <div className="absolute top-0 bottom-0" title="Hoy" style={{ left: `${todayX}%`, width: 2, background: NAVY, opacity: 0.85 }} />

                  {!r.hasDates ? (
                    <div className="flex h-full items-center pl-2 text-[0.72rem] italic text-[var(--text-disabled)]">— sin fechas —</div>
                  ) : (
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
                      {/* Rango planificado de la fase — también el área de hover
                          (inicio/fin/estado; ver rowTooltip). */}
                      <div
                        className="absolute h-2 rounded-full"
                        title={rowTooltip(r)}
                        style={{ left: `${pct(new Date(r.barStart!))}%`, width: `${Math.max(pct(new Date(r.barEnd!)) - pct(new Date(r.barStart!)), 0.6)}%`, background: "var(--bg-hover)", border: `1px solid ${r.cfg.color}` }}
                      />
                      {/* Relleno de avance (% de hitos Done) */}
                      <div
                        className="pointer-events-none absolute h-2 rounded-full"
                        style={{ left: `${pct(new Date(r.barStart!))}%`, width: `${Math.max((pct(new Date(r.barEnd!)) - pct(new Date(r.barStart!))) * (r.phase.total ? r.phase.done / r.phase.total : 0), r.phase.done > 0 ? 0.6 : 0)}%`, background: r.cfg.fill }}
                      />
                      {/* Atraso: fin de la fase → hoy */}
                      {r.overdueEnd != null && (
                        <div
                          className="absolute h-2 rounded-full"
                          title={rowTooltip(r)}
                          style={{ left: `${pct(new Date(r.barEnd!))}%`, width: `${Math.max(pct(new Date(r.overdueEnd))- pct(new Date(r.barEnd!)), 0.6)}%`, background: CRITICAL, opacity: 0.5 }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Detalle expandible de Fase 3: un renglón por step, con su propio
                  rango (inicio→fin) y si está atrasado o en tiempo — animación tipo
                  acordeón (CSS grid-template-rows 0fr↔1fr, se adapta a cualquier
                  cantidad de steps sin medir alturas a mano). print:hidden: en el
                  PDF de una hoja no cabe el desglose por hito — la fila resumen de
                  la fase ya lo dice (offTrack/done/total), sin importar si en
                  pantalla estaba expandido o no. */}
              {isF3 && (
                <div
                  className="grid transition-[grid-template-rows,opacity] duration-300 ease-in-out print:hidden"
                  style={{ gridTemplateRows: isOpen ? "1fr" : "0fr", opacity: isOpen ? 1 : 0 }}
                >
                  <div className="overflow-hidden" style={{ background: "var(--bg-hover)" }}>
                    {steps.map((sr, si) => (
                      <div key={`${sr.phase.grupo}-${si}`} className="flex items-stretch border-b last:border-b-0" style={{ borderColor: "var(--border-subtle)", minHeight: 50 }}>
                        <div style={{ width: 290, background: sr.cfg.bg }} className="gantt-phase-col flex shrink-0 flex-col justify-center gap-0.5 py-2 pl-7 pr-3">
                          <div className="text-[0.95rem] font-medium leading-snug text-[var(--text-secondary)]" title={sr.phase.grupo}>{sr.phase.grupo}</div>
                          <div className="flex flex-wrap items-center gap-x-1 text-[0.72rem] font-semibold leading-snug" style={{ color: sr.cfg.color }}>
                            {sr.cfg.icon} {sr.label} <span className="font-normal text-[var(--text-muted)]">· {sr.phase.done}/{sr.phase.total}</span>
                          </div>
                        </div>
                        <div className="gantt-subrow-track relative flex-1" style={{ minHeight: 50 }}>
                          {ticks.map((t, ti) => (
                            <div key={ti} className="absolute top-0 bottom-0 w-px" style={{ left: `${pct(t.date)}%`, background: "var(--border)", opacity: 0.35 }} />
                          ))}
                          {!sr.hasDates ? (
                            <div className="flex h-full items-center pl-2 text-[0.68rem] italic text-[var(--text-disabled)]">— sin fechas —</div>
                          ) : (
                            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
                              <div
                                className="absolute h-1.5 rounded-full"
                                title={rowTooltip(sr)}
                                style={{ left: `${pct(new Date(sr.barStart!))}%`, width: `${Math.max(pct(new Date(sr.barEnd!)) - pct(new Date(sr.barStart!)), 0.6)}%`, background: "var(--bg-surface)", border: `1px solid ${sr.cfg.color}` }}
                              />
                              <div
                                className="pointer-events-none absolute h-1.5 rounded-full"
                                style={{ left: `${pct(new Date(sr.barStart!))}%`, width: `${Math.max((pct(new Date(sr.barEnd!)) - pct(new Date(sr.barStart!))) * (sr.phase.total ? sr.phase.done / sr.phase.total : 0), sr.phase.done > 0 ? 0.6 : 0)}%`, background: sr.cfg.fill }}
                              />
                              {sr.overdueEnd != null && (
                                <div
                                  className="absolute h-1.5 rounded-full"
                                  title={rowTooltip(sr)}
                                  style={{ left: `${pct(new Date(sr.barEnd!))}%`, width: `${Math.max(pct(new Date(sr.overdueEnd)) - pct(new Date(sr.barEnd!)), 0.6)}%`, background: CRITICAL, opacity: 0.5 }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── Rayo del encabezado (mismo path que el PDF / la skill), relleno ámbar ──
function BoltIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={WARNING_FILL} aria-hidden style={{ flexShrink: 0 }}>
      <path d={BOLT_PATH} />
    </svg>
  );
}

// ── Encabezado: stepper VALOR (Valuación · Aprobación · Launch · Operación ·
// Revisión) — misma lógica y diseño fijo que el PDF (ver lib/valorStepper.ts y
// lib/reportTheme.ts): pasadas verde, la actual ámbar, futuras gris; una etapa
// con alguna fase atrasada (`lateStages`) se encierra en rojo. ──────
function ValorStepperScreen({ current, allDone, lateStages }: { current: number; allDone: boolean; lateStages: Set<number> }) {
  return (
    <div className="flex items-start print:scale-90 print:origin-top-right">
      {VALOR_STAGES.map((s, i) => {
        const passed = allDone || i < current;
        const active = !allDone && i === current;
        const late = lateStages.has(i);
        const dotBg = passed ? GOOD : active ? WARNING_FILL : NEUTRAL_LINE;
        return (
          <div key={s.key} className="flex items-start">
            <div className="flex w-[52px] flex-col items-center">
              {/* Círculo y letra en capas separadas: la letra (sin borde) se
                  centra con lineHeight = alto de la caja y nunca queda recortada. */}
              <div className="relative h-6 w-6">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ background: dotBg, border: late ? `2px solid ${CRITICAL}` : "none" }}
                />
                <div
                  className="absolute inset-0 text-center text-[0.62rem] font-bold"
                  style={{ lineHeight: "24px", color: "#fff" }}
                >
                  {s.key}
                </div>
              </div>
              <span
                className="mt-1 text-center text-[0.6rem] leading-tight"
                style={{ color: late ? CRITICAL : active ? INK : INK_MUTED, fontWeight: late || active ? 700 : 400 }}
              >
                {s.label}
              </span>
            </div>
            {i < VALOR_STAGES.length - 1 && (
              <div className="mt-3 h-0.5 w-4" style={{ background: i < current || allDone ? GOOD : GRID }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Tarjeta KPI del reporte: diseño fijo del "Status Ejecutivo" (mismo que el
// PDF, ver components/ProjectPdfReport.tsx) — barra de color ARRIBA + fondo
// tenue del tono; `solid` pinta la tarjeta llena (tarjeta "Salud (EVM)"). ──
function KpiTile({ label, value, sub, tone, solid }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; tone: Tone; solid?: boolean;
}) {
  const t = TONE[tone];
  if (solid) {
    return (
      <div className="flex flex-col justify-center gap-1 overflow-hidden rounded-xl p-3" style={{ background: t.fg }}>
        <div className="text-[0.62rem] font-bold uppercase tracking-wide" style={{ color: "#ffffffcc" }}>{label}</div>
        <div className="text-[1.15rem] font-extrabold leading-tight" style={{ color: "#fff" }}>{value}</div>
        {sub && <div className="text-[0.65rem] font-semibold" style={{ color: "#ffffffe0" }}>{sub}</div>}
      </div>
    );
  }
  return (
    <div className="flex flex-col overflow-hidden rounded-xl" style={{ border: `1px solid ${t.fg}55`, background: t.bg }}>
      <div className="h-1 w-full shrink-0" style={{ background: t.fg }} />
      <div className="flex flex-1 flex-col justify-center gap-1 p-3">
        <div className="text-[0.62rem] font-bold uppercase tracking-wide" style={{ color: INK_MUTED }}>{label}</div>
        <div className="text-[1.15rem] font-extrabold leading-tight" style={{ color: tone === "neutral" ? INK : t.fg }}>{value}</div>
        {sub && <div className="text-[0.65rem] font-semibold" style={{ color: INK_MUTED }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Leyenda de la línea de tiempo (colores fijos del spec) ─────────────
function GanttLegendScreen({ hoy }: { hoy: string }) {
  const item = (sw: React.ReactNode, txt: string) => (
    <span className="inline-flex items-center gap-1.5">{sw}<span>{txt}</span></span>
  );
  const bar = (style: React.CSSProperties) => <span className="inline-block h-2 w-3.5 rounded-sm" style={style} />;
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.68rem]" style={{ color: INK_SEC }}>
      {item(bar({ background: GOOD }), "Completada")}
      {item(bar({ background: WARNING_FILL }), "En curso")}
      {item(bar({ background: CRITICAL, opacity: 0.55 }), "Atrasada (sobretiempo)")}
      {item(bar({ border: `1px solid ${NEUTRAL_LINE}` }), "Pendiente")}
      {item(<span className="inline-block h-1.5 w-1.5 rotate-45 border" style={{ borderColor: NEUTRAL_LINE }} />, "Hito")}
      {item(<span className="inline-block h-3 w-0.5" style={{ background: NAVY }} />, `Hoy · ${hoy}`)}
      {item(<span className="inline-block h-3 w-0.5" style={{ background: WARNING }} />, "Cierre estimado")}
    </div>
  );
}

// ── Distribución de responsabilidad del atraso: barra apilada + leyenda ──
// "Sin asignar" siempre gris; el resto cicla la paleta categórica del spec.
const roleColor = (label: string, i: number) =>
  /sin asignar/i.test(label) ? INK_MUTED : ROLE_PALETTE[i % ROLE_PALETTE.length];

function ResponsabilidadDistScreen({ items }: { items: Responsabilidad[] }) {
  return (
    <div className="h-fit rounded-xl border p-4" style={{ borderColor: GRID, background: CARD_BG }}>
      <h4 className="mb-3 text-[0.9rem] font-bold" style={{ color: NAVY }}>Distribución de responsabilidad</h4>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: NEUTRAL_BG }}>
        {items.map((r, i) => (
          <div key={r.label} style={{ width: `${r.pct}%`, background: roleColor(r.label, i) }} />
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {items.map((r, i) => (
          <div key={r.label} className="flex items-center gap-2 text-[0.78rem]">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: roleColor(r.label, i) }} />
            <span style={{ color: INK_SEC }}>{r.label} · <strong style={{ color: INK }}>{r.pct}%</strong></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Causas de atraso: steps/hitos de Fase 3 atrasados o Stuck, en formato de
// tabla (Entregable · A cargo · Atraso · Responsable · Motivo). Responsable y
// Motivo siguen editables (Firestore, ver AtrasoDetalleEditor). ──────────────
interface CausaRow { id: string; name: string; sub: string; responsible?: string; badge: string }
function CausasDeAtraso({ rows, responsabilidad }: { rows: CausaRow[]; responsabilidad: Responsabilidad[] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_260px] print:grid-cols-[1fr_220px]">
      <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
        <h4 className="mb-3 text-[1.05rem] font-bold" style={{ color: NAVY }}>Causas de atraso</h4>
        {rows.length === 0 ? (
          <div className="py-4 text-center text-[0.9rem] text-[var(--text-muted)]">Sin atrasos. 🎉</div>
        ) : (
          <>
            <div
              className="hidden gap-3 border-b pb-2 text-[0.6rem] font-bold uppercase tracking-wide text-[var(--text-muted)] sm:grid sm:grid-cols-[1.6fr_0.9fr_auto]"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <span>Entregable</span><span>A cargo</span><span>Atraso</span>
            </div>
            <div className="flex flex-col">
              {rows.map((r) => (
                <div key={r.id} className="border-b py-3 last:border-b-0 last:pb-0" style={{ borderColor: "var(--border-subtle)" }}>
                  <div className="grid items-start gap-3 sm:grid-cols-[1.6fr_0.9fr_auto]">
                    <div className="min-w-0">
                      <div className="text-[0.95rem] font-semibold text-[var(--text-primary)]" title={r.name}>{r.name}</div>
                      <div className="text-[0.72rem] text-[var(--text-muted)]">{r.sub}</div>
                    </div>
                    <div className="text-[0.8rem] text-[var(--text-secondary)]">
                      <span className="text-[var(--text-muted)] sm:hidden">A cargo: </span>{r.responsible || "—"}
                    </div>
                    <span
                      className="justify-self-start rounded-full px-2.5 py-1 text-[0.75rem] font-bold"
                      style={{ color: CRITICAL, background: CRITICAL_BG }}
                    >
                      {r.badge}
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <AtrasoDetalleEditor itemId={r.id} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {responsabilidad.length > 0 && <ResponsabilidadDistScreen items={responsabilidad} />}
    </div>
  );
}
