"use client";

// Una sola tarjeta de tiempo para la pestaña "Digitalización OCR". Un selector
// Promedio / Mediana gobierna estos números Y la línea de tiempo de abajo
// (el estado vive en ReporteOcr). Todo en horas hábiles L–V 08:00–18:00.

import type { KpisOcr, StatSel } from "@/lib/digitalizacion";
import { fmtDur, nEs } from "./fmt";

const SEG: readonly (readonly [StatSel, string])[] = [["prom", "Promedio"], ["mediana", "Mediana"]];

export default function ResumenTiempoOcr({ k, stat, onStat }: {
  k: KpisOcr; stat: StatSel; onStat: (s: StatSel) => void;
}) {
  const pick = (s: { prom: number | null; mediana: number | null }) => (stat === "prom" ? s.prom : s.mediana);
  const cols = [
    { label: "T1", cap: "Creación → documentos", stat: k.t1, color: "var(--etapa-1)" },
    { label: "T2", cap: "documentos → carta de licencia", stat: k.t2, color: "var(--etapa-3)" },
    { label: "Total", cap: "T1 + T2 · files completos", stat: k.total, color: "var(--card-value-total)" },
  ];

  return (
    <div className="rounded-xl border p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[0.8rem] font-bold text-[var(--text-primary)]">
          Tiempo de digitalización <span className="font-medium text-[var(--text-muted)]">· horas hábiles</span>
        </span>
        <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
          {SEG.map(([v, l]) => (
            <button key={v} onClick={() => onStat(v)}
              className="px-4 py-1.5 text-[0.78rem] font-semibold transition-colors"
              style={{
                background: stat === v ? "var(--bg-accent-soft)" : "var(--bg-surface)",
                color: stat === v ? "var(--accent-light)" : "var(--text-secondary)",
              }}>{l}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {cols.map((c) => (
          <div key={c.label} className="flex flex-col">
            <div className="text-[0.64rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{c.label}</div>
            <div className="mt-1 tabular-nums text-[1.75rem] font-extrabold leading-none" style={{ color: c.color }}>
              {fmtDur(pick(c.stat))}
            </div>
            <div className="mt-1.5 text-[0.68rem] text-[var(--text-muted)]">{c.cap}</div>
            <div className="mt-0.5 tabular-nums text-[0.66rem] text-[var(--text-muted)]">
              {nEs(c.stat.n)} files · P90 {fmtDur(c.stat.p90)} · máx {fmtDur(c.stat.max)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t pt-2.5 text-[0.68rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
        {nEs(k.files)} files · {nEs(k.conT2)} con carta de licencia · {nEs(k.completos)} completos
        {k.t1.enCero > 0 && <> · {nEs(k.t1.enCero)} con T1 = 0 (instantáneos / fin de semana)</>}
      </div>
    </div>
  );
}
