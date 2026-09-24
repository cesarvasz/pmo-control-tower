"use client";

// Vista gráfica de Calidad de Entregas + Cumplimiento de Entrega, para la
// pestaña "Calidad y Cumplimiento" de ProjectReportModal — a pedido del
// usuario, SIN fórmulas ni explicación de cómo se calcula cada número (eso
// vive en la pestaña "EVM"); solo tarjetas/barras de color para lectura
// rápida. Piezas visuales compartidas con EvmCharts en reportChartUI.tsx.

import type { ProjectMetrics } from "@/lib/projectMetrics";
import { BadgePill, CHART_BAD, CHART_OK, CHART_WARN, ScoreCard, SectionTitle, StackedBar, StatBox, pctOf, toneOfPct } from "@/components/reportChartUI";

export default function CalidadCumplimientoCharts({ m }: { m: ProjectMetrics }) {
  const { calidad, cumplimiento, responsabilidad } = m;

  const c100 = calidad.unidades.filter((u) => u.nota === 100).length;
  const c50 = calidad.unidades.filter((u) => u.nota === 50).length;
  const c0 = calidad.unidades.filter((u) => u.nota === 0).length;

  return (
    <div className="flex flex-col gap-7">
      {/* ── Calidad de Entregas ── */}
      <div>
        <SectionTitle>Calidad de Entregas · solo fase 3</SectionTitle>
        {calidad.total === 0 ? (
          <p className="text-[0.82rem] text-[var(--text-muted)]">Este proyecto todavía no tiene entregables medibles en la fase 3.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
              <ScoreCard
                value={calidad.pct === null ? "—" : `${calidad.pct}%`}
                label="Calidad"
                sub={`${calidad.total} entregable${calidad.total !== 1 ? "s" : ""}`}
                color={toneOfPct(calidad.pct)}
              />
              <div className="grid grid-cols-3 gap-3">
                <StatBox value={String(c100)} label="A tiempo" sub={`${pctOf(c100, calidad.total)}% · nota 100`} color={CHART_OK} />
                <StatBox value={String(c50)} label="Excusado / recuperable" sub={`${pctOf(c50, calidad.total)}% · nota 50`} color={CHART_WARN} />
                <StatBox value={String(c0)} label="Sin excusa" sub={`${pctOf(c0, calidad.total)}% · nota 0`} color={CHART_BAD} />
              </div>
            </div>
            <StackedBar segments={[
              { pct: pctOf(c100, calidad.total), color: CHART_OK },
              { pct: pctOf(c50, calidad.total), color: CHART_WARN },
              { pct: pctOf(c0, calidad.total), color: CHART_BAD },
            ]} />
            <div className="max-h-64 overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <table className="pmo w-full text-[0.74rem]">
                <thead><tr><th>Entregable</th><th>Nota</th><th>Responsable</th></tr></thead>
                <tbody>
                  {calidad.unidades.map((u) => (
                    <tr key={u.id}>
                      <td style={{ maxWidth: 320, wordBreak: "break-word" }}>{u.name}</td>
                      <td><BadgePill label={String(u.nota)} color={u.nota === 100 ? CHART_OK : u.nota === 50 ? CHART_WARN : CHART_BAD} /></td>
                      <td className="whitespace-nowrap text-[var(--text-secondary)]">
                        {u.responsable ?? "—"}
                        {u.heredada && <span className="ml-1 text-[0.62rem] text-[var(--text-muted)]">(heredado)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Cumplimiento de Entrega ── */}
      <div>
        <SectionTitle>Cumplimiento de Entrega</SectionTitle>
        {cumplimiento.total === 0 ? (
          <p className="text-[0.82rem] text-[var(--text-muted)]">Sin unidades evaluadas todavía.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
              <ScoreCard
                value={cumplimiento.pct === null ? "—" : `${cumplimiento.pct}%`}
                label="Cumplimiento"
                sub={`${cumplimiento.total} unidad${cumplimiento.total !== 1 ? "es" : ""}`}
                color={toneOfPct(cumplimiento.pct)}
              />
              <div className="grid grid-cols-2 gap-3">
                <StatBox value={String(cumplimiento.onTime)} label="A tiempo" sub={`${pctOf(cumplimiento.onTime, cumplimiento.total)}%`} color={CHART_OK} />
                <StatBox value={String(cumplimiento.late)} label="Con atraso" sub={`${pctOf(cumplimiento.late, cumplimiento.total)}%`} color={CHART_BAD} />
              </div>
            </div>
            <StackedBar segments={[
              { pct: pctOf(cumplimiento.onTime, cumplimiento.total), color: CHART_OK },
              { pct: pctOf(cumplimiento.late, cumplimiento.total), color: CHART_BAD },
            ]} />
            <div className="max-h-64 overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <table className="pmo w-full text-[0.74rem]">
                <thead><tr><th>Unidad</th><th>Tipo</th><th>Resultado</th><th>Responsable</th></tr></thead>
                <tbody>
                  {cumplimiento.filas.map((f) => (
                    <tr key={f.id}>
                      <td style={{ maxWidth: 300, wordBreak: "break-word" }}>{f.label}</td>
                      <td className="whitespace-nowrap text-[var(--text-secondary)]">{f.tipo}</td>
                      <td><BadgePill label={f.onTime ? "A tiempo" : `Atraso (${f.atrasados.length})`} color={f.onTime ? CHART_OK : CHART_BAD} /></td>
                      <td className="whitespace-nowrap text-[var(--text-secondary)]">{f.responsable ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Responsabilidad del atraso ── */}
      {responsabilidad.length > 0 && (
        <div>
          <SectionTitle>Responsabilidad del atraso (ponderada por días)</SectionTitle>
          <div className="flex flex-col gap-2">
            {responsabilidad.map((r) => (
              <div key={r.label} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-[0.78rem] text-[var(--text-secondary)]">{r.label}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                  <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.label === "PM" ? CHART_BAD : "var(--accent)" }} />
                </div>
                <span className="w-10 shrink-0 text-right text-[0.78rem] font-bold tabular-nums">{r.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
