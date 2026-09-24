"use client";

// Vista gráfica de SPI/CPI/Scope/EVM, para la pestaña "EVM" de ProjectReportModal
// — a pedido del usuario, SIN fórmulas ni explicación de cómo se calcula cada
// número; solo tarjetas/barras de color para lectura al golpe de vista. Mismas
// piezas compartidas que CalidadCumplimientoCharts (reportChartUI.tsx).

import { fmtMoney } from "@/lib/business";
import type { ProjectMetrics } from "@/lib/projectMetrics";
import {
  BadgePill, CHART_BAD, CHART_OK, CHART_WARN, CompareBars, ScoreCard, SectionTitle, StatBox, toneOfPct,
} from "@/components/reportChartUI";

export default function EvmCharts({ m }: { m: ProjectMetrics }) {
  const { evm, units } = m;
  const atrasadas = units.filter((u) => u.atrasada);

  return (
    <div className="flex flex-col gap-7">
      {/* ── EVM + SPI/CPI/Scope de un vistazo ── */}
      <div>
        <SectionTitle>Salud del proyecto (EVM)</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
          <ScoreCard
            value={evm.evm === null ? "—" : `${Math.round(evm.evm * 100)}%`}
            label={evm.estado ?? "Sin datos"}
            sub="EVM = (SPI + CPI + Scope) / 3"
            color={toneOfPct(evm.evm === null ? null : evm.evm * 100)}
          />
          <div className="grid grid-cols-3 gap-3">
            <StatBox value={evm.spi === null ? "—" : evm.spi.toFixed(2)} label="SPI" sub="avance vs plan" color={toneOfPct(evm.spi === null ? null : evm.spi * 100)} />
            <StatBox value={evm.cpi === null ? "—" : evm.cpi.toFixed(2)} label="CPI" sub="ganado vs planificado" color={toneOfPct(evm.cpi === null ? null : evm.cpi * 100)} />
            <StatBox value={evm.scope === null ? "—" : String(evm.scope)} label="Scope" sub={evm.scope === 1 ? "sin atrasos" : "con atraso"} color={evm.scope === 1 ? CHART_OK : evm.scope === 0 ? CHART_BAD : "var(--text-muted)"} />
          </div>
        </div>
      </div>

      {/* ── SPI: avance real vs plan ── */}
      <div>
        <SectionTitle>SPI · avance de entregas</SectionTitle>
        <div className="flex flex-col gap-4">
          <CompareBars rows={[
            { label: "Avance real", value: evm.avanceReal, display: `${Math.round(evm.avanceReal * 100)}%`, color: CHART_OK },
            { label: "Avance plan", value: evm.avancePlan, display: `${Math.round(evm.avancePlan * 100)}%`, color: CHART_WARN },
          ]} />
          <div className="grid grid-cols-3 gap-3">
            <StatBox value={String(evm.unidadesEntregadas)} label="Entregadas" sub={`de ${evm.unidadesTotal} unidades`} color={CHART_OK} />
            <StatBox value={String(evm.unidadesQueDeberian - evm.unidadesEntregadas)} label="Vencidas sin entregar" sub="ya deberían estar" color={CHART_BAD} />
            <StatBox value={String(evm.unidadesTotal - evm.unidadesQueDeberian)} label="Aún no vencen" sub="no cuentan todavía" color="var(--text-muted)" />
          </div>
          {units.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <table className="pmo w-full text-[0.74rem]">
                <thead><tr><th>Unidad</th><th>Fase</th><th>Estado</th></tr></thead>
                <tbody>
                  {units.map((u) => {
                    const label = u.entregada ? (u.atrasada ? "Entregada con atraso" : "Entregada") : u.atrasada ? "Atrasada" : "En plazo";
                    const color = u.entregada ? (u.atrasada ? CHART_WARN : CHART_OK) : u.atrasada ? CHART_BAD : "var(--text-muted)";
                    return (
                      <tr key={u.id}>
                        <td style={{ maxWidth: 320, wordBreak: "break-word" }}>{u.name}{u.kind === "hito" && <span className="ml-1 text-[var(--text-muted)]">· hito</span>}</td>
                        <td className="whitespace-nowrap text-[var(--text-secondary)]">{u.fase.split(" | ")[0]}</td>
                        <td><BadgePill label={label} color={color} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── CPI: valor ganado vs planificado ── */}
      <div>
        <SectionTitle>CPI · valor ganado</SectionTitle>
        <div className="flex flex-col gap-4">
          <CompareBars rows={[
            { label: "EV (ganado)", value: evm.ev, display: fmtMoney(evm.ev), color: CHART_OK },
            { label: "PV (planificado)", value: evm.pv, display: fmtMoney(evm.pv), color: CHART_WARN },
          ]} />
          {evm.costItems.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <table className="pmo w-full text-[0.74rem]">
                <thead><tr><th>Item</th><th>Fase</th><th>Costo baseline</th><th>Estado</th></tr></thead>
                <tbody>
                  {evm.costItems.map((r) => {
                    const label = r.enEv ? "En EV" : r.enPv ? "Solo en PV (vencido)" : "Aún no participa";
                    const color = r.enEv ? CHART_OK : r.enPv ? CHART_WARN : "var(--text-muted)";
                    return (
                      <tr key={r.id}>
                        <td style={{ maxWidth: 300, wordBreak: "break-word" }}>{r.name}</td>
                        <td className="whitespace-nowrap text-[var(--text-secondary)]">{r.fase.split(" | ")[0]}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">{fmtMoney(r.baseCost)}</td>
                        <td><BadgePill label={label} color={color} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Scope: ¿hay algún atraso? ── */}
      <div>
        <SectionTitle>Scope · ¿hay algún atraso?</SectionTitle>
        <div className="flex items-center gap-3">
          <BadgePill
            label={atrasadas.length === 0 ? "✓ Sin atrasos" : `✕ ${atrasadas.length} unidad${atrasadas.length !== 1 ? "es" : ""} atrasada${atrasadas.length !== 1 ? "s" : ""}`}
            color={atrasadas.length === 0 ? CHART_OK : CHART_BAD}
          />
          <span className="text-[0.74rem] text-[var(--text-muted)]">
            {atrasadas.length === 0 ? "Ninguna unidad atrasada." : "Basta una sola para que el Scope caiga a 0."}
          </span>
        </div>
        {atrasadas.length > 0 && (
          <div className="mt-3 max-h-64 overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <table className="pmo w-full text-[0.74rem]">
              <thead><tr><th>Unidad</th><th>Fase</th><th>Días de atraso</th></tr></thead>
              <tbody>
                {atrasadas.map((u) => (
                  <tr key={u.id}>
                    <td style={{ maxWidth: 320, wordBreak: "break-word" }}>{u.name}</td>
                    <td className="whitespace-nowrap text-[var(--text-secondary)]">{u.fase.split(" | ")[0]}</td>
                    <td className="whitespace-nowrap font-semibold" style={{ color: CHART_BAD }}>{u.stuck && !u.diasAtraso ? "Stuck" : `${u.diasAtraso} d`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
