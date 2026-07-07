"use client";

import { fmtMoney } from "@/lib/business";

export interface PmValue {
  reqCost: number; reqBenefit: number;
  aprobCost: number; aprobBenefit: number;
  ambosCost: number; ambosBenefit: number;
  projCost: number; projBenefit: number;
  totalCost: number; totalBenefit: number;
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

export default function PMValueModal({ pm, value, onClose }: { pm: string; value: PmValue; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border shadow-2xl"
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

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
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
            <Row label="REQ" c={value.reqCost} b={value.reqBenefit} />
            <div className="h-px" style={{ background: "var(--border)" }} />
            <Row label="Aprobación" c={value.aprobCost} b={value.aprobBenefit} />
            <Row label="Confirmado" c={value.ambosCost} b={value.ambosBenefit} />
            <div className="h-px" style={{ background: "var(--border)" }} />
            <Row label="Total" c={value.totalCost} b={value.totalBenefit} strong />
          </div>
        </div>
      </div>
    </div>
  );
}
