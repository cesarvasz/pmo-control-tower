"use client";

import { useState } from "react";
import { fmtMoney } from "@/lib/business";
import { computeBenefitKpi, KPI_W } from "@/lib/kpi";
import Modal from "@/components/Modal";
import type { PmValue } from "@/lib/dashboard";

const COST = "var(--info)";
const BEN = "var(--ok)";
const MESES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function Row({ label, c, b, strong }: { label: string; c: number; b: number; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${strong ? "text-[0.85rem] font-bold" : "text-[0.8rem]"}`}>
      <span className={strong ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}>{label}</span>
      <span className="tabular-nums">
        <span style={{ color: COST }}>{fmtMoney(c)}</span>
        <span className="text-[var(--text-muted)]"> / </span>
        <span style={{ color: BEN }}>{fmtMoney(b)}</span>
      </span>
    </div>
  );
}

/** Celda de monto: Beneficio (destacado) sobre Costo (tenue). */
function CB({ c, b }: { c: number; b: number }) {
  return (
    <div className="text-right leading-tight">
      <div className="tabular-nums font-semibold" style={{ color: BEN }}>{fmtMoney(b)}</div>
      <div className="tabular-nums text-[0.66rem]" style={{ color: COST }}>{fmtMoney(c)}</div>
    </div>
  );
}

/** Fila de barra de progreso para una mitad del peso "Beneficio" del KPI (Aprobación/Confirmación). */
function KpiWeightRow({ label, weight, monto, meta, logro }: { label: string; weight: number; monto: number; meta: number; logro: number }) {
  const pct = Math.round(logro * 100);
  const pts = logro * weight;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-[0.78rem] font-semibold text-[var(--text-primary)]">{label}</span>
        <span className="shrink-0 tabular-nums text-[0.72rem] text-[var(--text-muted)]">
          {fmtMoney(monto)} <span className="text-[var(--text-disabled)]">/ {fmtMoney(meta)}</span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: BEN }} />
        </div>
        <span className="w-9 shrink-0 text-right tabular-nums text-[0.7rem] font-bold" style={{ color: BEN }}>{pct}%</span>
        <span className="w-16 shrink-0 text-right tabular-nums text-[0.7rem] font-semibold">
          <span style={{ color: BEN }}>{pts.toFixed(1)}</span>
          <span className="text-[var(--text-disabled)]"> / {weight}</span>
        </span>
      </div>
    </div>
  );
}

const Dash = () => <span className="text-[var(--text-disabled)]">—</span>;

export default function PMValueModal({ pm, valueAll, valueHard, initialHard, onClose }: {
  pm: string; valueAll: PmValue; valueHard: PmValue; initialHard: boolean; onClose: () => void;
}) {
  const [tab, setTab] = useState<"resumen" | "detalle">("resumen");
  const [hard, setHard] = useState(initialHard);
  const value = hard ? valueHard : valueAll;
  const d = value.detail;
  const hasDetail = d.reqs.length + d.projects.length > 0;

  return (
    <Modal open onClose={onClose} width={760}>
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
          <div>
            <div className="text-[0.68rem] uppercase tracking-widest text-[var(--text-muted)]">Costo &amp; Beneficio</div>
            <div className="mt-0.5 text-[1.1rem] font-bold text-[var(--text-primary)]">{pm}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            ✕
          </button>
        </div>

        {/* Tabs + interruptor Todo / HardSaving */}
        <div className="flex shrink-0 items-center justify-between border-b px-4 pt-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex gap-1">
            {(["resumen", "detalle"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="rounded-t-lg px-4 py-2 text-[0.8rem] font-semibold capitalize transition-colors"
                style={tab === t
                  ? { color: "var(--accent)", borderBottom: "2px solid var(--accent)" }
                  : { color: "var(--text-muted)" }}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="mb-1.5 flex items-center gap-0.5 rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
            {([["Todo", false], ["HardSaving", true]] as const).map(([label, val]) => (
              <button
                key={label}
                onClick={() => setHard(val)}
                className="rounded-md px-2.5 py-1 text-[0.68rem] font-bold transition-colors"
                style={hard === val
                  ? { background: "var(--ok)", color: "#fff" }
                  : { color: "var(--text-muted)" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {tab === "resumen" ? (
            <>
              {/* Totales */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg-hover)" }}>
                  <div className="text-[0.6rem] uppercase tracking-wide text-[var(--text-muted)]">Costo</div>
                  <div className="mt-1 text-[1.05rem] font-bold tabular-nums" style={{ color: COST }}>{fmtMoney(value.totalCost)}</div>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg-hover)" }}>
                  <div className="text-[0.6rem] uppercase tracking-wide text-[var(--text-muted)]">Beneficio (Aprobación VPB)</div>
                  <div className="mt-1 text-[1.05rem] font-bold tabular-nums" style={{ color: BEN }}>{fmtMoney(value.aprobacionBenefit)}</div>
                </div>
              </div>

              {/* Desglose */}
              <div className="space-y-2 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                <div className="mb-1 text-[0.62rem] uppercase tracking-widest text-[var(--text-muted)]">
                  Costo / Beneficio
                </div>
                <Row label="Validación VPA" c={value.validacionCost} b={value.validacionBenefit} />
                <Row label="Aprobación VPB" c={value.aprobacionCost} b={value.aprobacionBenefit} />
                <Row label="Confirmación VPC" c={value.confirmacionCost} b={value.confirmacionBenefit} />
                <div className="h-px" style={{ background: "var(--border)" }} />
                <Row label="Total" c={value.totalCost} b={value.totalBenefit} strong />
              </div>

              {/* Cómo pesa el Beneficio en el KPI (peso 25, siempre HardSaving) */}
              {(() => {
                const bk = computeBenefitKpi(valueHard.aprobacionBenefit, valueHard.confirmacionBenefit);
                return (
                  <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                    <div>
                      <div className="text-[0.62rem] uppercase tracking-widest text-[var(--text-muted)]">
                        Cómo pesa en tu KPI (peso {KPI_W.benefit})
                      </div>
                      <div className="mt-1 text-[0.72rem] leading-relaxed text-[var(--text-muted)]">
                        Meta anual {fmtMoney(bk.metaAnual)} ÷ 12 = {fmtMoney(bk.metaMensual)}/mes × mes {bk.month} ({MESES[bk.month]}) ={" "}
                        meta acumulada <b style={{ color: "var(--text-primary)" }}>{fmtMoney(bk.metaAcumulada)}</b>.
                        Siempre con Beneficio HardSaving, sin importar el filtro Todo/HardSaving de arriba.
                      </div>
                    </div>
                    <KpiWeightRow label="Aprobación VPB (70% del peso)" weight={bk.pesoAprobacion} monto={bk.benefitAprobado} meta={bk.metaAcumulada} logro={bk.logroAprobacion} />
                    <KpiWeightRow label="Confirmación VPC (30% del peso)" weight={bk.pesoConfirmacion} monto={bk.benefitConfirmado} meta={bk.metaAcumulada} logro={bk.logroConfirmacion} />
                    <div className="h-px" style={{ background: "var(--border)" }} />
                    <div className="flex items-center justify-between text-[0.8rem] font-bold text-[var(--text-primary)]">
                      <span>Total aportado al KPI</span>
                      <span className="tabular-nums" style={{ color: BEN }}>
                        {bk.total.toFixed(1)} <span className="text-[0.72rem] font-semibold text-[var(--text-muted)]">/ {KPI_W.benefit}</span>
                      </span>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <>
              <div className="text-[0.7rem] text-[var(--text-muted)]">
                Cada ítem muestra <span style={{ color: BEN }}>Beneficio</span> / <span style={{ color: COST }}>Costo</span> en su etapa,
                evaluada de forma descendente (Confirmación → Aprobación → Validación; se toma la primera que cumpla).
                <b> Validación VPA</b>: REQ en Valuación/Aprobación o proyecto con &quot;VPA valida Business Case&quot; Done.
                <b> Aprobación VPB</b>: REQ en Desarrollo/Operación/Cierre ROI o proyecto con &quot;Plan de beneficios CFO&quot; + Value Gate Aprobación + Value Gate Launch, los 3 Done.
                <b> Confirmación VPC</b>: REQ Cerrado o proyecto con el step &quot;VPA Recopila datos a 30/60/90 días&quot; más reciente Done.
              </div>

              {!hasDetail ? (
                <div className="rounded-lg px-4 py-6 text-center text-[0.82rem] text-[var(--text-muted)]">
                  Este PM aún no tiene REQ ni proyectos en ninguna de las 3 etapas.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
                  <table className="w-full text-[0.8rem]">
                    <thead>
                      <tr style={{ background: "var(--bg-hover)" }}>
                        <th className="px-3 py-2 text-left font-semibold text-[var(--text-secondary)]">Ítem</th>
                        <th className="px-3 py-2 text-right font-semibold text-[var(--text-secondary)]">Validación</th>
                        <th className="px-3 py-2 text-right font-semibold text-[var(--text-secondary)]">Aprobación</th>
                        <th className="px-3 py-2 text-right font-semibold text-[var(--text-secondary)]">Confirmación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...d.reqs.map((r) => ({ ...r, kind: "REQ" as const })),
                        ...d.projects.map((p) => ({ ...p, kind: "PM" as const })),
                      ].map((it, i) => (
                        <tr key={`${it.kind}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="px-3 py-2">
                            <Tag kind={it.kind} /> <span className="text-[var(--text-primary)]">{it.name}</span>
                          </td>
                          <td className="px-3 py-2">{it.stage === "validacion" ? <CB c={it.cost} b={it.benefit} /> : <div className="text-right"><Dash /></div>}</td>
                          <td className="px-3 py-2">{it.stage === "aprobacion" ? <CB c={it.cost} b={it.benefit} /> : <div className="text-right"><Dash /></div>}</td>
                          <td className="px-3 py-2">{it.stage === "confirmacion" ? <CB c={it.cost} b={it.benefit} /> : <div className="text-right"><Dash /></div>}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2" style={{ borderColor: "var(--border)", background: "var(--bg-hover)" }}>
                        <td className="px-3 py-2 font-bold text-[var(--text-primary)]">Total</td>
                        <td className="px-3 py-2"><CB c={value.validacionCost} b={value.validacionBenefit} /></td>
                        <td className="px-3 py-2"><CB c={value.aprobacionCost} b={value.aprobacionBenefit} /></td>
                        <td className="px-3 py-2"><CB c={value.confirmacionCost} b={value.confirmacionBenefit} /></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
    </Modal>
  );
}

function Tag({ kind }: { kind: "REQ" | "PM" }) {
  const c = kind === "REQ" ? "#0ea5e9" : "#8b5cf6";
  return (
    <span
      className="mr-1 inline-block rounded px-1.5 py-0.5 text-[0.6rem] font-bold align-middle"
      style={{ color: c, background: c + "22" }}
    >
      {kind}
    </span>
  );
}
