"use client";

// Resumen Ejecutivo — página única para C-Level/Directores: por defecto muestra
// el PORTAFOLIO completo como una "Carátula Light" (salud global, radar de
// atascos con el responsable del atraso de HOY, y la tabla de todos los
// proyectos — misma paleta/tipografía que el Status Card, ver reportTheme.ts);
// al hacer clic en cualquier proyecto (fila de cualquiera de las tablas o el
// selector rápido) carga el DETALLE de ese proyecto en la misma página, sin
// navegar a otra ruta — el estado vive en el query param ?board=, así que el
// botón atrás/adelante del navegador funciona como se espera. Toda la lógica
// de agregación vive en lib/portfolioSummary.ts y lib/projSummary.ts (puras,
// con tests) — esta página solo arma la presentación.

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useData } from "@/context/DataContext";
import { fmtDate, fmtMoney, today } from "@/lib/business";
import { calcBoardMetrics, deriveBoardHealth, splitBoardName } from "@/lib/proj";
import { isFase3, isDesarrolloPorIteracionesStep, projStageAmounts } from "@/lib/dashboard";
import {
  buildProjectSummary, calcPlannedProgress, evaluarHitosAtraso, evaluarStepAtraso,
  type StepAtraso,
} from "@/lib/projSummary";
import { atrasoReparto, RESPONSIBLE_COLOR } from "@/lib/delay";
import {
  buildPortfolioRows, calcPortfolioTotals, buildDelayRadar,
  type PortfolioProjectRow, type DelayRadarRow,
} from "@/lib/portfolioSummary";
import { HEALTH_CFG, type HealthStatus } from "@/lib/health";
import { GRID } from "@/lib/reportTheme";
import { buildStatusReportData } from "@/lib/statusReportData";
import { EmptyRow, ErrorBox, Loader } from "@/components/ui";
import StatusReport, { SHEET_H, SHEET_W } from "@/components/StatusReport";
import { AtrasoMotivoInput, AtrasoRespReparto } from "@/components/AtrasoInlineEdit";
import { AlcanceInput } from "@/components/AlcanceInlineEdit";
import type { BoardAlcance, ProjBoard, ProjItem, ProjItemBaseline } from "@/types";

/** Status en español, para la lectura de 3 segundos de la Carátula Light
 *  (el resto de la app usa las etiquetas en inglés de HEALTH_CFG — acá no se
 *  tocan, solo se relabela localmente). */
const STATUS_LABEL_ES: Record<HealthStatus, string> = { "on-track": "Sano", "in-risk": "En Riesgo", "off-track": "Crítico" };

/** "Alcance" de la tabla general = el campo editable del Status Card
 *  (Firestore `board_alcance`, ver components/AlcanceInlineEdit.tsx),
 *  recortado a `maxWords` para que quepa en la celda. Sin dato → "N/D"
 *  (regla: nunca inventar). */
function truncateWords(text: string | undefined, maxWords = 10): string {
  const clean = (text ?? "").trim();
  if (!clean) return "N/D";
  const words = clean.split(/\s+/);
  return words.length <= maxWords ? clean : `${words.slice(0, maxWords).join(" ")}…`;
}

// ── Transformadores puros para los 2 gráficos (no tocan portfolioSummary.ts:
// consumen su salida ya calculada — rows/delayRadar — y solo reagrupan) ────

/** Dona "Portfolio Status por Valor": suma de Valor del Proyecto por Status.
 *  Exactamente 3 categorías (Sano/En Riesgo/Crítico, pedidas por el usuario) —
 *  un proyecto Completado se cuenta como Sano (sin riesgo abierto, mismo
 *  criterio que `mainRisk` en portfolioSummary.ts); uno sin salud calculable
 *  (Monday sin costos/fechas) se excluye del todo — nunca se le asigna un
 *  status a ojo. */
interface StatusMoneySlice { key: HealthStatus; label: string; icon: string; color: string; value: number; pct: number }
function buildStatusMoneyBreakdown(rows: PortfolioProjectRow[]): { slices: StatusMoneySlice[]; sinClasificar: number } {
  const buckets: Record<HealthStatus, number> = { "on-track": 0, "in-risk": 0, "off-track": 0 };
  let sinClasificar = 0;
  for (const r of rows) {
    if (r.isComplete || r.healthStatus === "on-track") buckets["on-track"] += r.budgetApproved;
    else if (r.healthStatus === "in-risk") buckets["in-risk"] += r.budgetApproved;
    else if (r.healthStatus === "off-track") buckets["off-track"] += r.budgetApproved;
    else sinClasificar += r.budgetApproved;
  }
  const total = buckets["on-track"] + buckets["in-risk"] + buckets["off-track"];
  const order: HealthStatus[] = ["on-track", "in-risk", "off-track"];
  const slices = order.map((k) => ({
    key: k, label: STATUS_LABEL_ES[k], icon: HEALTH_CFG[k].icon, color: HEALTH_CFG[k].color,
    value: buckets[k], pct: total > 0 ? Math.round((buckets[k] / total) * 100) : 0,
  }));
  return { slices, sinClasificar };
}

/** Barras horizontales "Top Cuellos de Botella": Σ días de atraso del Radar
 *  de Atascos, agrupado por responsable (un mismo responsable puede aparecer
 *  en varios proyectos atrasados) — de mayor a menor, top N. Mismo cálculo
 *  que ya usaba la KpiTile "Cuello de Botella Principal" (ahora la consume
 *  de acá, en vez de duplicarlo). */
interface BottleneckSlice { label: string; dias: number; color: string }
function buildBottleneckRanking(delayRadar: DelayRadarRow[], top = 5): BottleneckSlice[] {
  const diasPorResponsable: Record<string, number> = {};
  for (const r of delayRadar) diasPorResponsable[r.responsable] = (diasPorResponsable[r.responsable] ?? 0) + r.diasAtraso;
  return Object.entries(diasPorResponsable)
    .map(([label, dias]) => ({ label, dias, color: RESPONSIBLE_COLOR[label] ?? "var(--text-muted)" }))
    .sort((a, b) => b.dias - a.dias)
    .slice(0, top);
}

/** Tooltip themed con variables CSS (respeta claro/oscuro sin JS de tema). */
function ChartTooltip({ active, payload }: { active?: boolean; payload?: { name?: string; value?: number; payload?: { label?: string; dias?: number } }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0];
  const label = p.payload?.label ?? p.name ?? "";
  const value = p.payload?.dias ?? p.value ?? 0;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-[0.75rem] shadow-lg"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
    >
      <div className="font-semibold">{label}</div>
      <div className="text-[var(--text-secondary)]">
        {typeof p.value === "number" && p.payload?.dias === undefined ? fmtMoney(value) : `${value} d hábiles`}
      </div>
    </div>
  );
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
  const delayRadar = useMemo(
    () => (data ? buildDelayRadar(rows, data.projBoards, data.proj, data.atrasoDetalles) : []),
    [rows, data],
  );

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
          boardAlcance={data.boardAlcance}
          delayRadar={delayRadar}
          onSelectProject={goToProject}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// VISTA 1 — Portafolio (Resumen Ejecutivo)
// ═══════════════════════════════════════════════════════════════════════
function PortfolioView({ fetchedAt, rows, totals, boardAlcance, delayRadar, onSelectProject }: {
  fetchedAt: Date;
  rows: PortfolioProjectRow[];
  totals: ReturnType<typeof calcPortfolioTotals>;
  boardAlcance: Record<string, BoardAlcance>;
  delayRadar: DelayRadarRow[];
  onSelectProject: (id: string) => void;
}) {
  // Radar de Atascos integrado como columnas extra de la tabla general — un
  // lookup por boardId en vez de una tabla aparte (buildDelayRadar solo trae
  // filas para proyectos con atraso activo).
  const delayByBoard = useMemo(() => new Map(delayRadar.map((r) => [r.boardId, r])), [delayRadar]);

  // Orden ascendente por PM ID (numérico, no alfabético — "PM-2" antes que
  // "PM-10"); boards sin código reconocible ("PM-XXX") quedan al final.
  const codeNum = (code: string) => {
    const m = code.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : Infinity;
  };
  const tableRows = [...rows].sort((a, b) => {
    const na = codeNum(a.code), nb = codeNum(b.code);
    return na !== nb ? na - nb : a.name.localeCompare(b.name);
  });

  // Bloque 1: "Días totales de atraso acumulado" = suma del peor atraso activo
  // de cada proyecto atrasado (mismo dato que la columna Atraso, ver
  // delayRadar); "Cuello de botella" = el responsable que acumula más de esos
  // días en todo el portafolio.
  const diasAtrasoTotal = delayRadar.reduce((s, r) => s + r.diasAtraso, 0);
  const enRiesgoOCritico = totals.inRisk + totals.offTrack;
  const bottleneckRanking = useMemo(() => buildBottleneckRanking(delayRadar), [delayRadar]);
  const bottleneck = bottleneckRanking[0] ?? null;
  const statusMoney = useMemo(() => buildStatusMoneyBreakdown(rows), [rows]);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Resumen Ejecutivo del Portafolio</h1>
      </div>
      <p className="mb-6 text-[0.82rem] text-[var(--text-muted)]">
        {totals.total} proyecto{totals.total === 1 ? "" : "s"} · datos al {fmtDate(fetchedAt)} · haz clic en cualquier proyecto para ver su Status Card.
      </p>

      {rows.length === 0 ? (
        <EmptyRow msg="No hay proyectos en el portafolio." />
      ) : (
        <>
          {/* ── 1. SALUD GLOBAL — la lectura de 3 segundos ── */}
          <BlockHeader title="Salud Global" />
          <div className="mb-8 flex flex-wrap gap-3">
            <KpiTile
              label="Valor Total del Portafolio"
              value={fmtMoney(totals.budgetApproved)}
              sub={`Presupuesto aprobado · ${totals.total} proyecto${totals.total === 1 ? "" : "s"}`}
              accent="var(--accent)"
            />
            <KpiTile
              label="Proyectos en Riesgo o Críticos"
              value={enRiesgoOCritico}
              sub={`${totals.offTrack} crítico${totals.offTrack === 1 ? "" : "s"} · ${totals.inRisk} en riesgo`}
              accent={enRiesgoOCritico > 0 ? "#ef4444" : "#10b981"}
            />
            <KpiTile
              label="Días Totales de Atraso Acumulado"
              value={`${diasAtrasoTotal} d`}
              sub={`${delayRadar.length} proyecto${delayRadar.length === 1 ? "" : "s"} con atraso activo`}
              accent={diasAtrasoTotal > 0 ? "#ef4444" : "#10b981"}
            />
            <KpiTile
              label="Cuello de Botella Principal"
              value={bottleneck ? bottleneck.label : "N/D"}
              sub={bottleneck ? `${bottleneck.dias} día${bottleneck.dias === 1 ? "" : "s"} acumulados` : "Sin atrasos activos"}
              accent={bottleneck ? "#c98500" : "#10b981"}
              valueSize="1.2rem"
            />
          </div>

          <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PortfolioStatusDonut data={statusMoney} />
            <TopBottlenecksBar data={bottleneckRanking} />
          </div>

          {/* ── 2. RESUMEN EJECUTIVO GENERAL — todos los proyectos, con el
              Radar de Atascos integrado como columnas (no como tabla aparte) ── */}
          <BlockHeader title="Resumen Ejecutivo General" hint="Alcance, valor, status y responsable del atraso — un proyecto por fila" />
          {delayRadar.length === 0 && (
            <p className="mb-3 text-[0.8rem] text-[var(--text-muted)]">🎉 Ningún proyecto tiene atraso activo hoy.</p>
          )}
          {/* Sin scroll propio (a diferencia de .table-wrap): se muestran todas las
              filas y columnas, la página completa hace el scroll si hace falta. */}
          <div className="mb-4 overflow-hidden rounded-[10px] border" style={{ borderColor: "var(--border)" }}>
            <table className="pmo">
              <thead>
                <tr>
                  <th>Proyecto</th>
                  <th>Alcance</th>
                  <th>Valor del proyecto</th>
                  <th>Status</th>
                  <th>Días de atraso</th>
                  <th>Responsable del atraso</th>
                  <th>¿Culpa del PM?</th>
                  <th>Action item de HOY</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => {
                  const cfg = r.isComplete
                    ? { color: "var(--text-secondary)", bg: "var(--bg-hover)", icon: "✓", label: "Completado" }
                    : r.healthStatus
                      ? { ...HEALTH_CFG[r.healthStatus], label: STATUS_LABEL_ES[r.healthStatus] }
                      : { color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "—", label: "N/D" };
                  const dr = delayByBoard.get(r.boardId);
                  return (
                    <tr
                      key={r.boardId}
                      onClick={() => onSelectProject(r.boardId)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectProject(r.boardId); } }}
                      tabIndex={0}
                      role="button"
                      className="cursor-pointer transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
                    >
                      <td className="ini-name">
                        <div className="flex flex-col gap-0.5" style={{ maxWidth: 200, wordBreak: "break-word" }}>
                          {r.code && <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{r.code}</span>}
                          <span>{r.name}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: ".75rem", color: "var(--text-secondary)", maxWidth: 200, wordBreak: "break-word" }}>{truncateWords(boardAlcance[r.boardId]?.alcance)}</td>
                      <td style={{ fontSize: ".75rem", fontWeight: 600, whiteSpace: "nowrap", color: "var(--text-primary)" }}>{fmtMoney(r.budgetApproved)}</td>
                      <td>
                        <span className="rounded-full px-2 py-0.5 text-[0.68rem] font-bold whitespace-nowrap" style={{ color: cfg.color, background: cfg.bg }}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td style={{ fontSize: ".75rem", fontWeight: dr ? 700 : 400, whiteSpace: "nowrap", color: dr ? "var(--bad)" : "var(--text-muted)" }}>
                        {dr ? `${dr.diasAtraso}d hábiles` : "En tiempo"}
                      </td>
                      <td style={{ fontSize: ".75rem", fontWeight: dr ? 700 : 400, whiteSpace: "nowrap", color: dr ? (RESPONSIBLE_COLOR[dr.responsable] ?? "var(--text-secondary)") : "var(--text-muted)" }}>
                        {dr?.responsable ?? "—"}
                      </td>
                      <td style={{ fontSize: ".75rem", fontWeight: 600, whiteSpace: "nowrap", color: !dr ? "var(--text-muted)" : dr.esCulpaPm === "Sí" ? "var(--bad)" : dr.esCulpaPm === "No" ? "var(--text-secondary)" : "var(--text-muted)" }}>
                        {dr?.esCulpaPm ?? "—"}
                      </td>
                      <td style={{ fontSize: ".75rem", color: "var(--text-secondary)", maxWidth: 260, wordBreak: "break-word" }}>{dr?.actionItem ?? "—"}</td>
                      <td className="whitespace-nowrap text-[0.72rem] font-semibold" style={{ color: "var(--accent-light)" }}>Ver Status Card →</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/** Título de bloque de la Carátula Light — misma gramática visual que
 *  `.section-title` del Status Card (título navy + regla horizontal), ver
 *  components/StatusReport.tsx. */
function BlockHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 mt-8 flex flex-wrap items-baseline gap-2.5 first:mt-0">
      <h2 className="text-[0.95rem] font-bold text-[var(--text-primary)]">{title}</h2>
      {hint && <span className="text-[0.72rem] text-[var(--text-muted)]">{hint}</span>}
      <span className="min-w-[24px] flex-1 border-b" style={{ borderColor: "var(--border)" }} />
    </div>
  );
}

/** Tarjeta KPI de la Carátula Light — misma gramática visual que `.kpi` del
 *  Status Card (barra de color arriba + etiqueta muted + valor grande), ver
 *  components/StatusReport.tsx `Kpis`. */
function KpiTile({ label, value, sub, accent, valueSize = "1.55rem" }: {
  label: string; value: ReactNode; sub?: string; accent: string; valueSize?: string;
}) {
  return (
    <div className="flex min-w-[190px] flex-1 flex-col overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      <div style={{ height: 4, background: accent }} />
      <div className="px-4 py-3.5">
        <div className="text-[0.62rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
        <div className="mt-1.5 truncate font-bold leading-tight" style={{ fontSize: valueSize, color: accent }} title={typeof value === "string" ? value : undefined}>
          {value}
        </div>
        {sub && <div className="mt-1 text-[0.72rem] font-medium text-[var(--text-secondary)]">{sub}</div>}
      </div>
    </div>
  );
}

/** Tarjeta contenedora de un gráfico — mismo borde/superficie que KpiTile y
 *  las tablas, para que los 2 gráficos se sientan parte del mismo sistema. */
function ChartCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      <div className="mb-1 text-[0.85rem] font-bold text-[var(--text-primary)]">{title}</div>
      {hint && <div className="mb-3 text-[0.72rem] text-[var(--text-muted)]">{hint}</div>}
      {children}
    </div>
  );
}

/** Dona "Portfolio Status por Valor" — qué % del dinero del portafolio está
 *  Sano vs. en Riesgo/Crítico, de un vistazo (el número grande al centro es
 *  la respuesta directa a esa pregunta; la tabla "Resumen Ejecutivo General"
 *  de abajo es el detalle proyecto por proyecto de esta misma data). */
function PortfolioStatusDonut({ data }: { data: { slices: StatusMoneySlice[]; sinClasificar: number } }) {
  const { slices, sinClasificar } = data;
  const total = slices.reduce((s, x) => s + x.value, 0);
  const enRiesgoPct = slices.filter((s) => s.key !== "on-track").reduce((s, x) => s + x.pct, 0);

  return (
    <ChartCard title="Portfolio Status por Valor" hint="Qué % del dinero del portafolio está en riesgo o crítico">
      {total === 0 ? (
        <p className="py-8 text-center text-[0.8rem] text-[var(--text-muted)]">Sin datos suficientes para clasificar el valor del portafolio.</p>
      ) : (
        <>
          <div className="relative" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="64%"
                  outerRadius="88%"
                  paddingAngle={slices.filter((s) => s.value > 0).length > 1 ? 3 : 0}
                  cornerRadius={4}
                  stroke="var(--bg-surface)"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {slices.map((s) => <Cell key={s.key} fill={s.color} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[1.6rem] font-bold leading-none" style={{ color: enRiesgoPct > 0 ? "#ef4444" : "#10b981" }}>
                {enRiesgoPct}%
              </div>
              <div className="mt-1 max-w-[110px] text-center text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                en riesgo o crítico
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {slices.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2 text-[0.75rem]">
                <span className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)]">
                  <span aria-hidden style={{ color: s.color }}>{s.icon}</span>
                  {s.label}
                </span>
                <span className="font-bold tabular-nums" style={{ color: s.color }}>
                  {fmtMoney(s.value)} · {s.pct}%
                </span>
              </div>
            ))}
          </div>
          {sinClasificar > 0 && (
            <p className="mt-2 text-[0.68rem] text-[var(--text-muted)]">
              ⓘ {fmtMoney(sinClasificar)} sin datos suficientes en Monday para clasificar — excluido del gráfico.
            </p>
          )}
        </>
      )}
    </ChartCard>
  );
}

/** Barras horizontales "Top Cuellos de Botella" — ¿quién acumula más días de
 *  atraso en todo el portafolio? Mismo color por responsable que el resto de
 *  la app (RESPONSIBLE_COLOR) y misma data que el Radar de Atascos de abajo
 *  (esa tabla es el detalle proyecto por proyecto de este ranking). */
function TopBottlenecksBar({ data }: { data: BottleneckSlice[] }) {
  return (
    <ChartCard title="Top Cuellos de Botella" hint="¿Quién nos está atascando más? (días de atraso acumulados)">
      {data.length === 0 ? (
        <p className="py-8 text-center text-[0.8rem] text-[var(--text-muted)]">🎉 Nadie acumula atraso activo hoy.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(data.length * 42, 130)}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 34, left: 4, bottom: 4 }}>
            <XAxis type="number" hide domain={[0, (max: number) => Math.ceil(max * 1.2)]} />
            <YAxis
              type="category"
              dataKey="label"
              width={100}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--bg-hover)" }} />
            <Bar dataKey="dias" barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.label} fill={d.color} />)}
              <LabelList
                dataKey="dias"
                position="right"
                formatter={(v: string | number | boolean | null | undefined) => (v == null || typeof v === "boolean" ? "" : `${v} d`)}
                style={{ fill: "var(--text-primary)", fontSize: 12, fontWeight: 700 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
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
  // Beneficio $ (Validación / Aprobación / Confirmación) — misma fuente que el
  // modal de Costo/Beneficio por PM (projStageAmounts), acá aplicada solo a
  // los items de ESTE board. Acumulativa: Confirmación ⇒ también cuenta como
  // Aprobación (a su valor aprobado / Business Case). Es un valor declarado
  // UNA sola vez (Business Case o medición real), no algo que se sume por item.
  //
  // Costo $ es lo opuesto: se acumula item por item, así que es la SUMA de la
  // columna "Cost $" de TODOS los items del board (mismo criterio que
  // ProjectReportModal.totalCost) — no el de un solo step/etapa (ese solo
  // traía el Cost $ del Business Case, que subestimaba el costo real acumulado).
  const stageAmounts = useMemo(() => projStageAmounts(items), [items]);
  const costoProyecto = items.reduce((s, it) => s + it.cost, 0);
  const beneficioParaRoi = stageAmounts?.confirmacion?.benefit ?? stageAmounts?.aprobacion?.benefit ?? stageAmounts?.validacion?.benefit;
  const valorProyecto = costoProyecto != null && beneficioParaRoi != null ? beneficioParaRoi - costoProyecto : null;
  const roi = costoProyecto && costoProyecto > 0 ? ((beneficioParaRoi ?? 0) - costoProyecto) / costoProyecto * 100 : null;
  const payback = costoProyecto && beneficioParaRoi && beneficioParaRoi > 0 ? costoProyecto / (beneficioParaRoi / 12) : null;
  // Avance planificado: % de hitos/steps que YA deberían estar Done según su
  // propio deadline. Comparado con el Avance real da la brecha física (SPI del reporte).
  const avancePlanificado = calcPlannedProgress(summary.units, summary.phases);
  const { code, name } = splitBoardName(board.name);

  // Atrasos de Fase 3 (Launch): plantilla NUEVA — una fila por STEP atrasado o
  // en Stuck, nunca una por hito (mismo criterio que WorkUnit). Plantilla
  // VIEJA (existe el step "Desarrollo por iteraciones...") — sus hitos SON los
  // entregables reales (ver evaluarHitosAtraso); una fila por hito atrasado,
  // ignorando los otros 3 checkpoints de esa fase (steps redundantes sobre los
  // mismos hitos, ver isDesarrolloPorIteracionesStep en lib/dashboard).
  const atrasos = useMemo(() => {
    const t = today();
    const fase3Items = items.filter((it) => isFase3(it.grupo));
    const desarrolloItem = fase3Items.find((it) => isDesarrolloPorIteracionesStep(it.name));
    const source = desarrolloItem
      ? evaluarHitosAtraso(desarrolloItem, t)
      : fase3Items.map((it) => evaluarStepAtraso(it, t)).filter((x): x is StepAtraso => x !== null);
    return source.sort((a, b) => (b.daysLate ?? 0) - (a.daysLate ?? 0));
  }, [items]);

  const { data } = useData();
  const atrasoDetalles = data?.atrasoDetalles;
  // Distribución de responsabilidad del atraso, PONDERADA POR DÍAS: suma de días
  // atribuidos a cada rol ÷ total de días repartidos. Si nadie tiene días
  // (todos "Stuck" sin días de atraso) cae a un conteo por # de tramos.
  const responsabilidadAtraso = useMemo(() => {
    if (atrasos.length === 0) return [];
    const dias: Record<string, number> = {};
    const cnt: Record<string, number> = {};
    let totalDias = 0;
    for (const a of atrasos) {
      const td = a.daysLate != null && a.daysLate > 0 ? a.daysLate : 0;
      for (const r of atrasoReparto(atrasoDetalles?.[a.id], td)) {
        dias[r.resp] = (dias[r.resp] ?? 0) + r.dias;
        cnt[r.resp] = (cnt[r.resp] ?? 0) + 1;
        totalDias += r.dias;
      }
    }
    const base = totalDias > 0 ? dias : cnt;
    const denom = totalDias > 0 ? totalDias : Object.values(cnt).reduce((s, n) => s + n, 0);
    return Object.entries(base)
      .map(([label, v]) => ({ label, pct: denom > 0 ? Math.round((v / denom) * 100) : 0 }))
      .sort((a, b) => b.pct - a.pct || a.label.localeCompare(b.label));
  }, [atrasos, atrasoDetalles]);

  const alcance = data?.boardAlcance[board.id]?.alcance ?? "";

  // Datos del "Status Ejecutivo" en el esquema de la skill `/status-pdf`
  // (ver lib/statusReportData.ts) — lo consume <StatusReport>.
  const reportData = useMemo(() => buildStatusReportData({
    board, code, name, summary, health, atrasos, atrasoDetalles,
    responsabilidadAtraso, avancePlanificado, valorProyecto, roi, payback, alcance, now,
  }), [board, code, name, summary, health, atrasos, atrasoDetalles, responsabilidadAtraso, avancePlanificado, valorProyecto, roi, payback, alcance, now]);

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
              Alcance/Responsable/Motivo editables in-situ */}
          <div
            ref={boxRef}
            className="overflow-hidden rounded-xl print:hidden"
            style={{ border: `1px solid ${GRID}`, boxShadow: "0 2px 14px rgba(0,0,0,.10)", height: SHEET_H * scale }}
          >
            <div style={{ width: SHEET_W, height: SHEET_H, transformOrigin: "top left", transform: `scale(${scale})` }}>
              <StatusReport
                data={reportData}
                renderAlcance={() => <AlcanceInput boardId={board.id} />}
                renderResp={(a) => <AtrasoRespReparto itemId={a.id} totalDias={a.diasNum} />}
                renderMotivo={(a) => <AtrasoMotivoInput itemId={a.id} totalDias={a.diasNum} />}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
