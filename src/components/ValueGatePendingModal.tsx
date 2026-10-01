"use client";

import { fmtDate } from "@/lib/business";
import Modal from "@/components/Modal";
import type { ValueGatePendingRow } from "@/app/(app)/page";

export default function ValueGatePendingModal({ code, title, rows, onClose }: {
  code: string; title: string; rows: ValueGatePendingRow[]; onClose: () => void;
}) {
  // Atrasados primero.
  const sorted = [...rows].sort((a, b) => Number(b.atrasada) - Number(a.atrasada));

  return (
    <Modal open onClose={onClose} width={512}>
        {/* Header */}
        <div
          className="flex shrink-0 items-start justify-between border-b px-6 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <div className="text-[0.68rem] uppercase tracking-widest text-[var(--text-muted)]">
              Value Gate · {code}
            </div>
            <div className="mt-0.5 text-[1.1rem] font-bold text-[var(--text-primary)]" title={title}>
              Pendientes · {sorted.length}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {sorted.length === 0 ? (
            <div className="py-8 text-center text-[0.85rem] text-[var(--text-muted)]">
              Sin pendientes en Valuación/Aprobación/Revisión.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
              {sorted.map((r, i) => {
                const color = r.atrasada ? "var(--bad)" : "#6b7280";
                return (
                  <div
                    key={`${r.name}-${i}`}
                    className="flex items-center gap-3 px-4 py-2.5"
                    style={{
                      borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                      borderLeft: `3px solid ${color}`,
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[0.82rem] font-medium text-[var(--text-primary)]" title={r.name}>
                        {r.name}
                      </div>
                      <div className="truncate text-[0.66rem] text-[var(--text-muted)]" title={r.fase}>
                        {r.fase}
                      </div>
                    </div>
                    <span className="shrink-0 text-[0.7rem] font-bold uppercase" style={{ color }}>
                      {r.status || "—"}
                    </span>
                    {r.deadline && (
                      <span className="shrink-0 text-[0.68rem] font-semibold" style={{ color }}>
                        {fmtDate(r.deadline)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
    </Modal>
  );
}
