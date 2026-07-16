"use client";

import { kpiCompColor as compColor, type KpiComponent } from "@/lib/kpi";

export default function KpiModal({ title = "KPI PMO", pct, achievable, pendingWeight, color, components, onClose }: {
  title?: string; pct: number; achievable: number; pendingWeight: number; color: string;
  components: KpiComponent[]; onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
          <div>
            <div className="text-[0.68rem] uppercase tracking-widest text-[var(--text-muted)]">{title}</div>
            <div className="mt-0.5 leading-none">
              <span className="text-[2rem] font-extrabold" style={{ color }}>{pct}</span>
              <span className="text-[1.1rem] font-bold text-[var(--text-muted)]"> / 100</span>
            </div>
            <div className="mt-1 text-[0.72rem] font-semibold text-[var(--text-muted)]">
              máx. {achievable} hoy · faltan {pendingWeight} por definir
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            ✕
          </button>
        </div>

        {/* Componentes */}
        <div className="flex-1 space-y-3.5 overflow-y-auto px-6 py-5">
          {components.map((c) => {
            const cc = compColor(c);
            const aporta = c.logro * c.weight;
            return (
              <div key={c.key}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="text-[0.85rem] font-semibold text-[var(--text-primary)]">
                    {c.label}{c.pending && <span className="ml-1 text-[0.7rem] font-normal text-[var(--text-muted)]">(por definir)</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-[0.78rem] text-[var(--text-muted)]">
                    {c.real} <span className="text-[var(--text-disabled)]">/ {c.meta}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round(c.logro * 100)}%`, background: cc }} />
                  </div>
                  <span className="w-10 shrink-0 text-right tabular-nums text-[0.72rem] font-bold" style={{ color: cc }}>
                    {c.pending ? "—" : `${Math.round(c.logro * 100)}%`}
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums text-[0.72rem] font-semibold">
                    <span style={{ color: cc }}>{c.pending ? "0" : aporta.toFixed(1)}</span>
                    <span className="text-[var(--text-disabled)]"> / {c.weight}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t px-6 py-3.5" style={{ borderColor: "var(--border)", background: "var(--bg-hover)" }}>
          <span className="text-[0.82rem] font-bold text-[var(--text-primary)]">Total</span>
          <span className="tabular-nums text-[0.9rem] font-extrabold" style={{ color }}>{pct} <span className="text-[0.75rem] font-bold text-[var(--text-muted)]">/ 100</span></span>
        </div>
      </div>
    </div>
  );
}
