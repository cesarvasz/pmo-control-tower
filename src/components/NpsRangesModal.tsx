"use client";

import Modal from "@/components/Modal";
import { NPS_RANGES } from "@/lib/nps";
import { KPI_W } from "@/lib/kpi";

/** Pop-up de referencia: los 5 rangos del NPS y cuánto rinde cada uno del peso
 *  (10) que el NPS aporta al KPI. Resalta el rango del `nps` recibido, si hay. */
export default function NpsRangesModal({ nps, onClose }: { nps: number | null; onClose: () => void }) {
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
          El NPS no aporta al KPI de forma proporcional: rinde el % de su peso según el rango donde caiga el resultado.
        </div>
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
                <div className="text-[0.7rem] text-[var(--text-muted)]">
                  {r.min} a {r.max}
                  {active && <span className="ml-1.5 font-semibold" style={{ color: r.color }}>· tu resultado</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="tabular-nums text-[0.9rem] font-extrabold" style={{ color: r.color }}>{Math.round(r.logro * 100)}%</div>
                <div className="text-[0.62rem] tabular-nums text-[var(--text-muted)]">{(r.logro * KPI_W.nps).toFixed(1)} / {KPI_W.nps} pts</div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
