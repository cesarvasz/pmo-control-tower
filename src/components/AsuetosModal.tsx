"use client";

import { ASUETOS_2026 } from "@/lib/holidays";
import Modal from "@/components/Modal";

// Formatea "2026-01-01" → { dia: "Jue", fecha: "1 ene" } en es-GT, sin desfase de zona horaria.
function fmtAsueto(iso: string): { dia: string; fecha: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dia = dt.toLocaleDateString("es-GT", { weekday: "short" }).replace(".", "");
  const fecha = dt.toLocaleDateString("es-GT", { day: "numeric", month: "short" }).replace(".", "");
  return { dia, fecha };
}

export default function AsuetosModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal open onClose={onClose} width={448}>
        {/* Header */}
        <div
          className="flex shrink-0 items-start justify-between border-b px-6 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <div className="text-[0.68rem] uppercase tracking-widest text-[var(--text-muted)]">
              🌴 Guatemala
            </div>
            <div className="mt-0.5 text-[1.1rem] font-bold text-[var(--text-primary)]">
              Asuetos Oficiales 2026
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
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
            {ASUETOS_2026.map((a, i) => {
              const { dia, fecha } = fmtAsueto(a.date);
              return (
                <div
                  key={a.date}
                  className="flex items-center gap-3 px-3 py-2"
                  style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}
                >
                  <div className="w-14 shrink-0 text-center">
                    <div className="text-[0.62rem] uppercase text-[var(--text-muted)]">{dia}</div>
                    <div className="text-[0.82rem] font-bold tabular-nums text-[var(--text-primary)]">{fecha}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[0.82rem] font-medium text-[var(--text-primary)]">{a.name}</div>
                    {a.note && (
                      <div className="text-[0.66rem] text-[var(--text-muted)]">{a.note}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div
          className="shrink-0 border-t px-6 py-3 text-[0.66rem] text-[var(--text-muted)]"
          style={{ borderColor: "var(--border)" }}
        >
          Asuetos según el Art. 127 del Código de Trabajo. Estos días se excluyen de los
          cálculos de días hábiles en Iniciativas. No incluye fiestas patronales fuera de la Ciudad de Guatemala.
        </div>
    </Modal>
  );
}
