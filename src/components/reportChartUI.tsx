"use client";

// Piezas visuales compartidas por las pestañas "gráficas" de ProjectReportModal
// (EvmCharts, CalidadCumplimientoCharts, NpsDetail) — score grande, tarjetas de
// stat, barra apilada, badge de color, barra de comparación. Sin fórmulas ni
// texto explicativo: solo números y color para lectura al golpe de vista.

export const CHART_OK = "var(--ok)", CHART_WARN = "var(--warn)", CHART_BAD = "var(--bad)";

/** Color por % contra dos umbrales (90/75 por default, mismo criterio visual
 *  en toda la app: verde ≥ okAt, ámbar ≥ warnAt, rojo debajo). */
export function toneOfPct(v: number | null, okAt = 90, warnAt = 75): string {
  if (v === null) return "var(--text-muted)";
  return v >= okAt ? CHART_OK : v >= warnAt ? CHART_WARN : CHART_BAD;
}

export const pctOf = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

export function ScoreCard({ value, label, sub, color }: { value: string; label: string; sub?: string; color: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-xl border p-5 text-center" style={{ background: "var(--bg-hover)", borderColor: `${color}33` }}>
      <div className="text-[2.6rem] font-extrabold leading-none" style={{ color }}>{value}</div>
      <div className="mt-1.5 text-[0.8rem] font-bold uppercase tracking-wide" style={{ color }}>{label}</div>
      {sub && <div className="mt-1 text-[0.7rem] text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}

export function StatBox({ value, label, sub, color }: { value: string; label: string; sub: string; color: string }) {
  return (
    <div className="rounded-xl border px-3 py-3.5 text-center" style={{ background: "var(--bg-hover)", borderColor: "var(--border)" }}>
      <div className="text-[1.5rem] font-extrabold leading-none" style={{ color }}>{value}</div>
      <div className="mt-1 text-[0.76rem] font-semibold text-[var(--text-primary)]">{label}</div>
      <div className="text-[0.66rem] text-[var(--text-muted)]">{sub}</div>
    </div>
  );
}

export function StackedBar({ segments }: { segments: { pct: number; color: string }[] }) {
  return (
    <div className="flex h-3 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
      {segments.map((s, i) => <div key={i} style={{ width: `${s.pct}%`, background: s.color }} />)}
    </div>
  );
}

export function BadgePill({ label, color }: { label: string; color: string }) {
  return (
    <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-bold" style={{ color, background: `${color}18` }}>
      {label}
    </span>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 text-[0.7rem] font-bold uppercase tracking-widest text-[var(--text-muted)]">{children}</div>;
}

/** Barra horizontal de comparación (ej. Avance real vs Avance plan, EV vs PV) —
 *  cada renglón escalado contra el máximo del set, con su valor ya formateado. */
export function CompareBars({ rows }: { rows: { label: string; value: number; display: string; color: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="w-32 shrink-0 text-[0.78rem] text-[var(--text-secondary)]">{r.label}</span>
          <div className="h-5 flex-1 overflow-hidden rounded-md" style={{ background: "var(--border)" }}>
            <div className="h-full rounded-md transition-[width]" style={{ width: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%`, background: r.color }} />
          </div>
          <span className="w-24 shrink-0 text-right text-[0.8rem] font-bold tabular-nums">{r.display}</span>
        </div>
      ))}
    </div>
  );
}
