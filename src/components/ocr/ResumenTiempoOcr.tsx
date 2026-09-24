"use client";

// Una sola tarjeta de tiempo para la pestaña "Digitalización OCR". Un selector
// Promedio / Mediana gobierna estos números Y la línea de tiempo de abajo
// (el estado vive en ReporteOcr). Todo en horas hábiles L–V 08:00–18:00.
//
// El costo de cada tile es el COSTO DE TIEMPO (Σ horas × tarifa fija, ver
// digitalizacion.ts::costoDeTiempo) — no cambia con el selector Promedio/
// Mediana (es una suma sobre el recorte, no una estadística por file).

import type { KpisOcr, StatSel } from "@/lib/digitalizacion";
import { fmtHHMMSS, nEs, usdExacto } from "./fmt";

const SEG: readonly (readonly [StatSel, string])[] = [["prom", "Promedio"], ["mediana", "Mediana"]];

export default function ResumenTiempoOcr({ k, stat, onStat }: {
  k: KpisOcr; stat: StatSel; onStat: (s: StatSel) => void;
}) {
  const pick = (s: { prom: number | null; mediana: number | null }) => (stat === "prom" ? s.prom : s.mediana);
  const cols = [
    { label: "T1", cap: "Creación → documentos", stat: k.t1, costo: k.costoTiempo.t1, color: "var(--etapa-1)" },
    { label: "T2", cap: "documentos → carta de licencia", stat: k.t2, costo: k.costoTiempo.t2, color: "var(--etapa-3)" },
    { label: "Total", cap: "T1 + T2 · files completos", stat: k.total, costo: k.costoTiempo.total, color: "var(--card-value-total)" },
  ];

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-[0.74rem] font-bold text-[var(--text-primary)]">
          Tiempo de digitalización <span className="font-medium text-[var(--text-muted)]">· horas hábiles · ${k.costoTiempo.tarifaHora}/h</span>
        </span>
        <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
          {SEG.map(([v, l]) => (
            <button key={v} onClick={() => onStat(v)}
              className="px-2.5 py-1 text-[0.68rem] font-semibold transition-colors"
              style={{
                background: stat === v ? "var(--bg-accent-soft)" : "var(--bg-surface)",
                color: stat === v ? "var(--accent-light)" : "var(--text-secondary)",
              }}>{l}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cols.map((c) => (
          <div key={c.label} className="flex min-w-0 flex-col">
            <div className="text-[0.58rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{c.label}</div>
            <div className="mt-1 truncate tabular-nums text-[1.3rem] font-extrabold leading-tight" style={{ color: c.color }}
              title={fmtHHMMSS(pick(c.stat))}>
              {fmtHHMMSS(pick(c.stat))}
            </div>
            <div className="mt-1 break-words text-[0.62rem] leading-snug text-[var(--text-muted)]">{c.cap}</div>
            <div className="mt-0.5 truncate tabular-nums text-[0.6rem] text-[var(--text-muted)]">
              {nEs(c.stat.n)} files
            </div>
            <div className="mt-1.5 truncate tabular-nums text-[0.82rem] font-bold" style={{ color: "var(--accent-light)" }}
              title="Costo de tiempo: suma de horas hábiles de este tramo en TODO el recorte × tarifa fija — no cambia con Promedio/Mediana.">
              {usdExacto(c.costo)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t pt-2 text-[0.62rem] leading-snug text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
        {nEs(k.files)} files · {nEs(k.conT2)} con carta de licencia · {nEs(k.completos)} completos
        {k.t1.enCero > 0 && <> · {nEs(k.t1.enCero)} con T1 = 0 (instantáneos / fin de semana)</>}
      </div>
    </div>
  );
}
