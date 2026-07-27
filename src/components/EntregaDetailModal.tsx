"use client";

import Modal from "@/components/Modal";
import { RESPONSIBLE_COLOR } from "@/lib/delay";
import type { LateResponsibleRow } from "@/lib/dashboard";

/** Pop-up de detalle de "Cumplimiento de Entrega" (tarjeta principal): desglose de qué
 *  responsable concentra los atrasos (conteo + %) y el listado nombre/id de cada uno.
 *  Solo "PM" o sin asignar penaliza el %; el resto excusa el atraso (ver lateExcused). */
export default function EntregaDetailModal({ rows, onClose }: { rows: LateResponsibleRow[]; onClose: () => void }) {
  const total = rows.length;

  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = r.responsible ?? "Sin asignar";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const breakdown = [...counts.entries()]
    .map(([responsible, count]) => ({ responsible, count, pct: total ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);

  return (
    <Modal open onClose={onClose} width={640} label="Detalle de Cumplimiento de Entrega">
      <div className="flex shrink-0 items-start justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="text-[0.68rem] uppercase tracking-widest text-[var(--text-muted)]">Detalle</div>
          <div className="mt-0.5 text-[1.05rem] font-bold text-[var(--text-primary)]">Cumplimiento de Entrega · Atrasos</div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg px-2 py-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <div>
          <div className="mb-2 text-[0.72rem] text-[var(--text-muted)]">
            Responsable más seleccionado en los atrasos ({total} con atraso). Solo &quot;PM&quot; o sin asignar penaliza el %; el resto excusa.
          </div>
          {total === 0 ? (
            <div className="text-[0.8rem] text-[var(--text-muted)]">Sin atrasos.</div>
          ) : (
            <div className="space-y-1.5">
              {breakdown.map((b) => {
                const color = RESPONSIBLE_COLOR[b.responsible] ?? "var(--text-muted)";
                return (
                  <div key={b.responsible} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-[0.78rem] font-bold" style={{ color }}>{b.responsible}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
                      <div className="h-full rounded-full" style={{ width: `${b.pct}%`, background: color }} />
                    </div>
                    <span className="w-16 shrink-0 text-right text-[0.78rem] font-semibold tabular-nums" style={{ color }}>
                      {b.count} · {b.pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-[0.72rem] text-[var(--text-muted)]">Dónde se marcó (nombre e id):</div>
          {total === 0 ? (
            <div className="text-[0.8rem] text-[var(--text-muted)]">—</div>
          ) : (
            <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <table className="w-full text-left text-[0.76rem]">
                <thead>
                  <tr style={{ background: "var(--bg-hover)" }}>
                    <th className="px-3 py-1.5 font-bold text-[var(--text-secondary)]">Nombre</th>
                    <th className="px-3 py-1.5 font-bold text-[var(--text-secondary)]">ID</th>
                    <th className="px-3 py-1.5 font-bold text-[var(--text-secondary)]">Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const responsible = r.responsible ?? "Sin asignar";
                    const color = RESPONSIBLE_COLOR[responsible] ?? "var(--text-muted)";
                    return (
                      <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-1.5 text-[var(--text-primary)]">
                          {r.name}
                          <span className="ml-1.5 text-[0.64rem] text-[var(--text-muted)]">({r.source})</span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[0.7rem] text-[var(--text-muted)]">{r.id}</td>
                        <td className="px-3 py-1.5 font-bold" style={{ color }}>{responsible}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
