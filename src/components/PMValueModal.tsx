"use client";

import { useState } from "react";
import { fmtMoney } from "@/lib/business";

export interface PmValueItem { name: string; cost: number; benefit: number; confirmed: boolean }

export interface PmValue {
  totalCost: number; totalBenefit: number;
  aprobCost: number; aprobBenefit: number;       // Aprobación: REQ en fase 2 + proyectos con solo gate Aprobación
  confirmCost: number; confirmBenefit: number;   // Confirmación: REQ que pasó fase 2 + proyectos con gate Launch firmado
  // Detalle de ítems (para la pestaña Detalle). confirmed=true → columna Confirmación, si no Aprobación.
  detail: {
    reqs: PmValueItem[];
    projects: PmValueItem[];
  };
}

const COST = "#0ea5e9";
const BEN = "#10b981";

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
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
                  ? { background: "#10b981", color: "#fff" }
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
                  <div className="text-[0.6rem] uppercase tracking-wide text-[var(--text-muted)]">Beneficio</div>
                  <div className="mt-1 text-[1.05rem] font-bold tabular-nums" style={{ color: BEN }}>{fmtMoney(value.totalBenefit)}</div>
                </div>
              </div>

              {/* Desglose */}
              <div className="space-y-2 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                <div className="mb-1 text-[0.62rem] uppercase tracking-widest text-[var(--text-muted)]">
                  Costo / Beneficio
                </div>
                <Row label="Aprobación" c={value.aprobCost} b={value.aprobBenefit} />
                <Row label="Confirmación" c={value.confirmCost} b={value.confirmBenefit} />
                <div className="h-px" style={{ background: "var(--border)" }} />
                <Row label="Total" c={value.totalCost} b={value.totalBenefit} strong />
              </div>
            </>
          ) : (
            <>
              <div className="text-[0.7rem] text-[var(--text-muted)]">
                Cada ítem muestra <span style={{ color: BEN }}>Beneficio</span> / <span style={{ color: COST }}>Costo</span> en su fase.
                En <b>Aprobación</b>: REQ que siguen en fase 2 y proyectos con solo el Value Gate de Aprobación.
                En <b>Confirmación</b>: REQ que ya pasaron la fase 2 y proyectos con el Value Gate de Launch firmado.
              </div>

              {!hasDetail ? (
                <div className="rounded-lg px-4 py-6 text-center text-[0.82rem] text-[var(--text-muted)]">
                  Este PM aún no tiene REQ (fase 2+) ni proyectos con Value Gate firmado.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
                  <table className="w-full text-[0.8rem]">
                    <thead>
                      <tr style={{ background: "var(--bg-hover)" }}>
                        <th className="px-3 py-2 text-left font-semibold text-[var(--text-secondary)]">Ítem</th>
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
                          <td className="px-3 py-2">{it.confirmed ? <div className="text-right"><Dash /></div> : <CB c={it.cost} b={it.benefit} />}</td>
                          <td className="px-3 py-2">{it.confirmed ? <CB c={it.cost} b={it.benefit} /> : <div className="text-right"><Dash /></div>}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2" style={{ borderColor: "var(--border)", background: "var(--bg-hover)" }}>
                        <td className="px-3 py-2 font-bold text-[var(--text-primary)]">Total</td>
                        <td className="px-3 py-2"><CB c={value.aprobCost} b={value.aprobBenefit} /></td>
                        <td className="px-3 py-2"><CB c={value.confirmCost} b={value.confirmBenefit} /></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
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
