"use client";

import Modal from "@/components/Modal";
import { NPS_RANGES, npsCfg, npsKpiLogro } from "@/lib/nps";
import { KPI_W } from "@/lib/kpi";

/** Pop-up de referencia: los 5 títulos de rango de siempre (PMO Riesgo/Soporte/
 *  Táctica/Gobernanza/Estratégica) se mantienen como clasificación visual, con
 *  su rango de NOTAS (no de %: el % ya no es fijo por rango, es la fórmula
 *  continua de npsKpiLogro — NPS ≤ 0 → 0%, 0 < NPS ≤ 50 → NPS÷50, NPS > 50 →
 *  100%, que solo se usa para calcular el peso puntual del resultado actual).
 *  Resalta el rango del `nps` recibido, si hay. */
export default function NpsRangesModal({ nps, onClose }: { nps: number | null; onClose: () => void }) {
  const cfg = npsCfg(nps);
  const logro = npsKpiLogro(nps);

  return (
    <Modal open onClose={onClose} width={480} label="Rangos de medición del NPS">
      <div className="flex shrink-0 items-start justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="text-[0.68rem] uppercase tracking-widest text-[var(--text-muted)]">Cómo se mide</div>
          <div className="mt-0.5 text-[1.05rem] font-bold text-[var(--text-primary)]">NPS · peso {KPI_W.nps} del KPI</div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg px-2 py-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-6 py-5">
        <div className="mb-1 text-[0.72rem] text-[var(--text-muted)]">
          Estos rangos clasifican la NOTA del NPS. El % del peso ya no es fijo por
          rango: se calcula aparte, de forma proporcional (NPS ÷ 50) — ver el
          resultado actual abajo.
        </div>

        {nps != null && (
          <div className="mb-3 flex items-center justify-between rounded-lg border px-3.5 py-2.5" style={{ borderColor: "var(--border)", background: "var(--bg-hover)" }}>
            <div>
              <div className="text-[0.68rem] text-[var(--text-muted)]">Resultado actual</div>
              <div className="text-[0.95rem] font-extrabold" style={{ color: cfg?.color }}>{nps} <span className="text-[0.72rem] font-semibold">· {cfg?.label}</span></div>
            </div>
            <div className="text-right">
              <div className="tabular-nums text-[0.9rem] font-extrabold" style={{ color: cfg?.color }}>{Math.round(logro * 100)}%</div>
              <div className="text-[0.62rem] tabular-nums text-[var(--text-muted)]">{(logro * KPI_W.nps).toFixed(1)} / {KPI_W.nps} pts</div>
            </div>
          </div>
        )}

        {NPS_RANGES.map((r) => {
          const active = nps != null && nps >= r.min && nps <= r.max;
          return (
            <div
              key={r.label}
              className="flex items-center justify-between rounded-lg border px-3.5 py-2.5"
              style={{
                borderColor: active ? r.color : "var(--border)",
                background: active ? `${r.color}1a` : "var(--bg-hover)",
              }}
            >
              <div>
                <div className="text-[0.82rem] font-bold" style={{ color: r.color }}>{r.label}</div>
                {active && <div className="text-[0.7rem] font-semibold" style={{ color: r.color }}>· tu resultado</div>}
              </div>
              <div className="text-right tabular-nums text-[0.82rem] font-extrabold" style={{ color: r.color }}>
                {r.min} a {r.max}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
