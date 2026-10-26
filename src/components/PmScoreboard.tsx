"use client";

// Tabla de Players: scoreboard comparativo de PMs ordenado por KPI (desc).
// Compartida por el Control Tower (vista "Players") y la página /players.

import { useMemo, useState } from "react";
import { fmtMoney, fmtMoneyShort, today } from "@/lib/business";
import { calcPmMetrics, type ConfirmacionRoiPm } from "@/lib/dashboard";
import type { DelayMap } from "@/lib/delay";
import { healthStatusFromIndex, HEALTH_CFG } from "@/lib/health";
import { npsCfg } from "@/lib/nps";
import { kpiColorFor, metaConfirmacionAcumulada, ratioConfirmacion, KPI_W, type KpiWeights } from "@/lib/kpi";

// Meses YA terminados del año (el en curso no cuenta) — base de la meta del Confirmado.
const mesesTerminados = () => today().getMonth();

const POR_FUENTE_TIP = (medida: string) =>
  `Medido como el EVM: ${medida} de cada fuente por separado, combinadas Iniciativas 10% · PML 20% · Proyectos 70% (una fuente sin unidades no cuenta y su peso se reparte entre las demás)`;
import { pmLabel } from "@/lib/players";
import type { MetodologiaMap } from "@/lib/metodologia";
import type { BoardHealthData } from "@/lib/proj";
import type { CalMap, IniItem, NpsRecord, ProjBoard, ProjItem, ReqItem } from "@/types";
import KpiModal from "@/components/KpiModal";
import PMValueModal from "@/components/PMValueModal";

// Paleta por rangos para el número "Player" (KPI) del scoreboard — los mismos rangos
// que la tabla "Monto máximo de pago de BPP":
//  +100% y 99–90 verde · 89–80 amarillo · 79–70 rojo · −70 morado.
// `pct` es el KPI ya redondeado a entero (kpiPct), así que 89.6 se muestra como 90 y pinta verde.
export function playerPalette(pct: number): { bg: string; fg: string } {
  if (pct >= 90) return { bg: "#3ecf4a", fg: "#06230e" };  // 90 o más (incluye +100%)
  if (pct >= 80) return { bg: "#ffd400", fg: "#3a2e00" };  // 89–80
  if (pct >= 70) return { bg: "#ef4444", fg: "#ffffff" };  // 79–70
  return { bg: "#9b30d0", fg: "#ffffff" };                 // menos de 70
}

// Scoreboard comparativo de PMs: tabla ordenada por KPI (desc). KPI y $ abren su detalle.
type PmRow = ReturnType<typeof calcPmMetrics>;

export default function PmScoreboard({ pms, ini, req, proj, projBoards, boardHealthMap, calMap, npsRecords, delays, reproceso, metodologia, confirmacionRoiPm, getRow, nameHeader = "Portafolio · PM", label = pmLabel, subtitle, weights = KPI_W, ponderadoPorFuente = false }: {
  /** Calidad y Cumplimiento se midieron como el EVM (Iniciativas 10% · PML 20% · Proyectos 70%) — solo cambia el texto de ayuda. */
  ponderadoPorFuente?: boolean;
  /** Pesos del KPI que se muestran en los encabezados (los mismos con los que se calculó getRow). */
  weights?: KpiWeights;
  pms: string[]; ini: IniItem[]; req: ReqItem[]; proj: ProjItem[]; projBoards: ProjBoard[];
  boardHealthMap: Map<string, BoardHealthData>; calMap: CalMap; npsRecords: NpsRecord[]; delays: DelayMap; reproceso: DelayMap;
  /** Notas mensuales de Metodología VALOR (persona + mes → nota). */
  metodologia?: MetodologiaMap;
  /** Confirmación vía ROI de Luis (T0 + T4→T5) y David (T1→T3) — reemplaza la de Monday. */
  confirmacionRoiPm?: Record<string, ConfirmacionRoiPm>;
  /** Calcula la fila de un player con datos propios (p. ej. recortados por CKU). Por defecto: calcPmMetrics sobre los datos completos. */
  getRow?: (pm: string) => PmRow;
  nameHeader?: string;
  label?: (pm: string) => string;
  subtitle?: (pm: string) => string;
}) {
  const [kpiPm, setKpiPm] = useState<string | null>(null);
  const [valuePm, setValuePm] = useState<string | null>(null);

  const rows = useMemo(
    () => pms
      .map((pm) => (getRow ? getRow(pm) : calcPmMetrics(pm, ini, req, proj, projBoards, boardHealthMap, calMap, npsRecords, delays, reproceso, undefined, metodologia, confirmacionRoiPm)))
      .sort((a, b) => b.kpi.score - a.kpi.score),
    [pms, ini, req, proj, projBoards, boardHealthMap, calMap, npsRecords, delays, reproceso, metodologia, confirmacionRoiPm, getRow],
  );

  const openKpi = rows.find((r) => r.pm === kpiPm);
  const openValue = rows.find((r) => r.pm === valuePm);

  const th = "px-3 py-2.5 font-semibold text-[var(--text-secondary)]";
  const td = "px-3 py-2.5";

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <table className="w-full table-fixed text-[0.82rem]">
        <thead>
          <tr className="border-b" style={{ background: "var(--bg-hover)", borderColor: "var(--border)" }}>
            <th className={`${th} text-center w-12`}>#</th>
            <th className={`${th} text-left w-48`}>{nameHeader}</th>
            <th className={`${th} text-center w-32`}>Player</th>
            {/* Columnas ordenadas por peso del KPI (desc.): EVM/Beneficio 25 ·
                NPS/Metodología 15 · Calidad de Entregas/Cumplimiento de Entrega 10 (PM). */}
            <th className={`${th} text-center w-32`}>EVM<span className="block text-[0.6rem] font-normal text-[var(--text-muted)]">peso {weights.evm}</span></th>
            <th className={`${th} text-center w-32`}>Beneficio $<span className="block text-[0.6rem] font-normal text-[var(--text-muted)]">peso {weights.benefit}</span></th>
            <th className={`${th} text-center w-32`}>NPS<span className="block text-[0.6rem] font-normal text-[var(--text-muted)]">peso {weights.nps}</span></th>
            <th className={`${th} text-center w-32`}>Calidad de Entregas<span className="block text-[0.6rem] font-normal text-[var(--text-muted)]">peso {weights.reproceso}</span></th>
            <th className={`${th} text-center w-32`}>Cumplimiento de Entrega<span className="block text-[0.6rem] font-normal text-[var(--text-muted)]">peso {weights.entregas}</span></th>
            {weights.metodologia > 0 && (
              <th className={`${th} text-center w-32`}>Metodología VALOR<span className="block text-[0.6rem] font-normal text-[var(--text-muted)]">peso {weights.metodologia}</span></th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const player = playerPalette(r.kpiPct);
            const evmStatus = healthStatusFromIndex(r.evmRaw);
            const evmColor = evmStatus ? HEALTH_CFG[evmStatus].color : "#6b7280";
            const npsColor = npsCfg(r.nps.nps)?.color ?? "#6b7280";
            const entColor = r.entPct === null ? "#6b7280" : r.entPct >= 90 ? "var(--ok)" : r.entPct >= 75 ? "var(--warn)" : "var(--bad)";
            const repColor = r.reprocesoPct === null ? "#6b7280" : r.reprocesoPct >= 90 ? "var(--ok)" : r.reprocesoPct >= 75 ? "var(--warn)" : "var(--bad)";
            // Peso ganado por cada métrica = logro × peso (aporte al KPI del PM).
            const pts = (key: string) => {
              const c = r.kpi.components.find((x) => x.key === key);
              return c ? Math.round(c.logro * c.weight) : 0;
            };
            return (
              <tr key={r.pm} className="border-t transition-colors hover:bg-[var(--bg-hover)]" style={{ borderColor: "var(--border)" }}>
                <td className={`${td} text-center tabular-nums font-bold text-[var(--text-muted)]`}>{i + 1}</td>
                <td className={td}>
                  <div className="font-semibold text-[var(--text-primary)]">{label(r.pm)}</div>
                  <div className="text-[0.7rem] text-[var(--text-muted)]">{subtitle ? subtitle(r.pm) : r.pm}</div>
                </td>
                {/* Player (KPI) — número héroe, formato diferenciado (pill con borde) */}
                <td className={`${td} text-center`}>
                  <button
                    onClick={() => setKpiPm(r.pm)}
                    title={`KPI ${r.kpiPct}/100 · ver detalle`}
                    className="inline-flex items-center rounded-full px-3 py-1 text-[0.95rem] font-extrabold transition-transform hover:-translate-y-0.5"
                    style={{ color: player.fg, background: player.bg, boxShadow: "inset 0 0 0 1px rgba(128,128,128,0.35)" }}
                  >
                    {r.kpiPct}
                  </button>
                </td>
                {/* EVM (peso 25) */}
                <td className={`${td} text-center`}>
                  <div className="tabular-nums font-bold" style={{ color: evmColor }}>{r.evmPct !== null ? `${r.evmPct}%` : "—"}</div>
                  {r.evmPct !== null && <div className="text-[0.62rem] font-semibold text-[var(--text-muted)]">{pts("evm")} pts</div>}
                </td>
                {/* Beneficio HardSaving confirmado (peso 25) */}
                <td className={`${td} text-center`}>
                  <button
                    onClick={() => setValuePm(r.pm)}
                    title={`Validado (Aprobación VPB): ${fmtMoney(r.benefit)} · Confirmado (VPC${r.pmValueHard.confirmacionRoi ? `, ${r.pmValueHard.confirmacionRoi}` : ""}): ${fmtMoney(r.pmValueHard.confirmacionBenefit)} (${Math.round(ratioConfirmacion(r.pmValueHard.confirmacionBenefit) * 100)}% de la meta a ${mesesTerminados()} meses terminados, ${fmtMoney(metaConfirmacionAcumulada())}) · clic para ver el detalle`}
                    className="inline-flex flex-col items-center gap-0.5 text-[0.78rem] leading-none tabular-nums font-bold transition-colors hover:underline"
                  >
                    {/* Validado arriba (negro) y Confirmado abajo (semáforo vs. meta a meses terminados). */}
                    <span style={{ color: "var(--text-primary)" }}>{fmtMoneyShort(r.benefit)}</span>
                    <span style={{ color: kpiColorFor(ratioConfirmacion(r.pmValueHard.confirmacionBenefit)) }}>{fmtMoneyShort(r.pmValueHard.confirmacionBenefit)}</span>
                  </button>
                  <div className="text-[0.62rem] font-semibold text-[var(--text-muted)]">{pts("benefit")} pts</div>
                </td>
                {/* NPS (peso 15) */}
                <td className={`${td} text-center`}>
                  <div className="tabular-nums font-bold" style={{ color: npsColor }}>{r.nps.nps !== null ? r.nps.nps : "s/d"}</div>
                  {r.nps.nps !== null && <div className="text-[0.62rem] font-semibold text-[var(--text-muted)]">{pts("nps")} pts</div>}
                </td>
                {/* Calidad de Entregas — reproceso (peso 10) */}
                <td className={`${td} text-center`} title={r.reprocesoPct === null ? "Sin unidades en scope (no aplica)" : ponderadoPorFuente ? `${POR_FUENTE_TIP("nota promedio de Calidad")}. Cada unidad vale 100 si su responsable no es el CKU y 0 si lo es o no tiene` : "% de unidades limpias (PML cerrados + fases completadas) sin reproceso imputable al PM"}>
                  <div className="tabular-nums font-bold" style={{ color: repColor }}>{r.reprocesoPct !== null ? `${r.reprocesoPct}%` : "—"}</div>
                  {r.reprocesoPct !== null && <div className="text-[0.62rem] font-semibold text-[var(--text-muted)]">{pts("reproceso")} pts</div>}
                </td>
                {/* Cumplimiento de Entrega — % a tiempo (peso 10) */}
                <td className={`${td} text-center`} title={ponderadoPorFuente && r.entPct !== null ? `${POR_FUENTE_TIP("% a tiempo")}. En Proyectos solo cuenta la Fase 3 (Launch) de los proyectos con plantilla nueva` : undefined}>
                  <div className="tabular-nums font-bold" style={{ color: entColor }}>{r.entPct !== null ? `${r.entPct}%` : "—"}</div>
                  {r.entPct !== null && <div className="text-[0.62rem] font-semibold text-[var(--text-muted)]">{pts("entregas")} pts</div>}
                </td>
                {/* Cumplimiento Metodología VALOR — nota vigente del mes en curso (peso 15) */}
                {weights.metodologia > 0 && (
                  <td className={`${td} text-center`} title={r.metodologiaPct === null ? "Sin medición todavía" : "Nota de Metodología VALOR vigente (la del mes en curso)"}>
                    <div className="tabular-nums font-bold" style={{ color: r.metodologiaPct === null ? "#6b7280" : r.metodologiaPct >= 90 ? "var(--ok)" : r.metodologiaPct >= 75 ? "var(--warn)" : "var(--bad)" }}>{r.metodologiaPct !== null ? `${r.metodologiaPct}%` : "—"}</div>
                    {r.metodologiaPct !== null && <div className="text-[0.62rem] font-semibold text-[var(--text-muted)]">{pts("metodologia")} pts</div>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {openKpi && (
        <KpiModal title={`KPI · ${openKpi.pm}`} pct={openKpi.kpiPct} achievable={openKpi.kpi.achievable} pendingWeight={100 - openKpi.kpi.achievable} color={kpiColorFor(openKpi.kpi.ratio)} components={openKpi.kpi.components} onClose={() => setKpiPm(null)} />
      )}
      {openValue && (
        <PMValueModal pm={openValue.pm} valueAll={openValue.pmValueAll} valueHard={openValue.pmValueHard} initialHard={true} onClose={() => setValuePm(null)} weights={weights} />
      )}
    </div>
  );
}
