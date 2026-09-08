"use client";

// Resumen Ejecutivo — página única para C-Level/Directores: por defecto muestra
// el PORTAFOLIO completo (semáforo, KPIs de portafolio, tabla, riesgos y
// recomendaciones); al hacer clic en cualquier proyecto (fila de la tabla,
// tarjeta crítica o el selector rápido) carga el DETALLE de ese proyecto en la
// misma página, sin navegar a otra ruta — el estado vive en el query param
// ?board=, así que el botón atrás/adelante del navegador funciona como se
// espera. Toda la lógica de agregación vive en lib/portfolioSummary.ts y
// lib/projSummary.ts (puras, con tests) — esta página solo arma la presentación.

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useData } from "@/context/DataContext";
import { fmtDate, fmtMoney, today } from "@/lib/business";
import { calcBoardMetrics, deriveBoardHealth, splitBoardName } from "@/lib/proj";
import { isFase3, projStageAmounts } from "@/lib/dashboard";
import {
  buildProjectSummary, calcPlannedProgress, evaluarStepAtraso, flattenBoardUnits,
  type StepAtraso,
} from "@/lib/projSummary";
import { countByResponsible } from "@/lib/delay";
import {
  buildPortfolioRows, calcPortfolioTotals, topCriticalProjects, buildCrossRisks,
  type PortfolioProjectRow, type CrossRisk,
} from "@/lib/portfolioSummary";
import { HEALTH_CFG } from "@/lib/health";
import { GRID } from "@/lib/reportTheme";
import { buildStatusReportData } from "@/lib/statusReportData";
import { EmptyRow, ErrorBox, Loader, StatCard } from "@/components/ui";
import StatusReport, { SHEET_H, SHEET_W } from "@/components/StatusReport";
import { AtrasoMotivoInput, AtrasoRespSelect } from "@/components/AtrasoInlineEdit";
import type { ProjBoard, ProjItem, ProjItemBaseline } from "@/types";

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
function Breadcrumb({ projectName, allBoards, currentId, onBack, onSwitch, onPrint }: {
  projectName: string; allBoards: ProjBoard[]; currentId: string; onBack: () => void; onSwitch: (id: string) => void;
  onPrint: () => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
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
          onClick={onPrint}
          className="rounded-lg border px-3 py-1.5 text-[0.78rem] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
          style={{ borderColor: "var(--border)" }}
        >
          🖨 Imprimir / PDF
        </button>
      </div>
    </div>
  );
}

// ── Vista de detalle de un proyecto = el "Status Ejecutivo PMO" exacto ──
// (skill `/status-pdf`, ver components/StatusReport.tsx). En pantalla se
// escala al ancho del panel; el botón "Descargar PDF" captura el mismo
// componente montado 1:1 fuera de pantalla y lo empaqueta en A4 horizontal.
function ProjectDetailView({ board, items, projItemBaselines, allBoards, onBack, onSwitch }: {
  board: ProjBoard; items: ProjItem[]; projItemBaselines: Record<string, ProjItemBaseline>;
  allBoards: ProjBoard[]; onBack: () => void; onSwitch: (id: string) => void;
}) {
  const [now] = useState(() => Date.now());

  const summary = useMemo(() => buildProjectSummary(items), [items]);
  const health = useMemo(() => deriveBoardHealth(calcBoardMetrics(items, projItemBaselines)), [items, projItemBaselines]);
  // Beneficio $ / Costo $ (Validación / Aprobación / Confirmación) — misma
  // fuente que el modal de Costo/Beneficio por PM (projStageAmounts), acá
  // aplicada solo a los items de ESTE board. Acumulativa: Confirmación ⇒
  // también cuenta como Aprobación (a su valor aprobado / Business Case).
  const stageAmounts = useMemo(() => projStageAmounts(items), [items]);
  const costoProyecto = stageAmounts?.aprobacion?.cost ?? stageAmounts?.validacion?.cost;
  const beneficioParaRoi = stageAmounts?.confirmacion?.benefit ?? stageAmounts?.aprobacion?.benefit ?? stageAmounts?.validacion?.benefit;
  const valorProyecto = costoProyecto != null && beneficioParaRoi != null ? beneficioParaRoi - costoProyecto : null;
  const roi = costoProyecto && costoProyecto > 0 ? ((beneficioParaRoi ?? 0) - costoProyecto) / costoProyecto * 100 : null;
  const payback = costoProyecto && beneficioParaRoi && beneficioParaRoi > 0 ? costoProyecto / (beneficioParaRoi / 12) : null;
  // Avance planificado: % de hitos/steps que YA deberían estar Done según su
  // propio deadline. Comparado con el Avance real da la brecha física (SPI del reporte).
  const avancePlanificado = calcPlannedProgress(summary.units, summary.phases);
  const { code, name } = splitBoardName(board.name);

  // Atrasos: STEPS de Fase 3 (Launch/Lanzamiento) atrasados o en Stuck — una
  // fila por step, nunca una por hito (mismo criterio que WorkUnit).
  const atrasos = useMemo(() => {
    const t = today();
    return items
      .filter((it) => isFase3(it.grupo))
      .map((it) => evaluarStepAtraso(it, t))
      .filter((x): x is StepAtraso => x !== null)
      .sort((a, b) => (b.daysLate ?? 0) - (a.daysLate ?? 0));
  }, [items]);

  const { data } = useData();
  const atrasoDetalles = data?.atrasoDetalles;
  // % de responsabilidad del atraso (rol de "Responsable atraso") sobre el TOTAL.
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

  // Datos del "Status Ejecutivo" en el esquema de la skill `/status-pdf`
  // (ver lib/statusReportData.ts) — lo consume <StatusReport>.
  const reportData = useMemo(() => buildStatusReportData({
    board, code, name, summary, health, atrasos, atrasoDetalles,
    responsabilidadAtraso, avancePlanificado, valorProyecto, roi, payback, now,
  }), [board, code, name, summary, health, atrasos, atrasoDetalles, responsabilidadAtraso, avancePlanificado, valorProyecto, roi, payback, now]);

  // PDF / impresión: NO se rasteriza. Hay una copia 1:1 del reporte montada
  // fuera de pantalla (.status-print-sheet, sin los controles de edición); al
  // imprimir, globals.css la deja como única visible y usa @page A4 horizontal
  // sin margen → sale exactamente una hoja con el diseño intacto. La clase
  // print-status-report en <html> activa esas reglas solo con esta vista montada.
  useEffect(() => {
    document.documentElement.classList.add("print-status-report");
    return () => document.documentElement.classList.remove("print-status-report");
  }, []);
  const handlePrint = () => window.print();

  // En pantalla la hoja (1122×794 px) se escala al ancho disponible del panel.
  // Se mide el contenedor EXTERIOR (cuyo ancho no se toca); solo se ajusta su
  // alto y el `scale` de la hoja vía estado — sin loops de ResizeObserver.
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const compute = () => {
      const w = box.clientWidth;
      if (w > 0) setScale(Math.min(w / SHEET_W, 1.5));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  return (
    <div>
      <Breadcrumb
        projectName={name} allBoards={allBoards} currentId={board.id} onBack={onBack} onSwitch={onSwitch}
        onPrint={handlePrint}
      />

      {items.length === 0 ? (
        <EmptyRow msg="Este proyecto no tiene items en Monday." />
      ) : (
        <>
          {/* Copia 1:1 del reporte fuera de pantalla — la ÚNICA que se imprime
              (globals.css @media print). Sin los <select>/<input> de edición. */}
          <div className="status-print-sheet" aria-hidden>
            <StatusReport data={reportData} />
          </div>
          {/* En pantalla: la misma hoja escalada al ancho del panel, con
              Responsable/Motivo editables in-situ */}
          <div
            ref={boxRef}
            className="overflow-hidden rounded-xl print:hidden"
            style={{ border: `1px solid ${GRID}`, boxShadow: "0 2px 14px rgba(0,0,0,.10)", height: SHEET_H * scale }}
          >
            <div style={{ width: SHEET_W, height: SHEET_H, transformOrigin: "top left", transform: `scale(${scale})` }}>
              <StatusReport
                data={reportData}
                renderResp={(a) => <AtrasoRespSelect itemId={a.id} tone={a.resp_tone} />}
                renderMotivo={(a) => <AtrasoMotivoInput itemId={a.id} />}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
