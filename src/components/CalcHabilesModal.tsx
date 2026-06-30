"use client";

import { useState } from "react";
import { businessDays } from "@/lib/business";

// "2026-01-01" → Date local (sin desfase de zona horaria).
function parseInput(v: string): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export default function CalcHabilesModal({ onClose }: { onClose: () => void }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const ds = parseInput(start);
  const de = parseInput(end);

  let result: number | null = null;
  let inverted = false;
  if (ds && de) {
    inverted = de < ds;
    const [a, b] = inverted ? [de, ds] : [ds, de];
    result = businessDays(a, b, true); // excluye fines de semana y asuetos
  }

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
        <div
          className="flex shrink-0 items-start justify-between border-b px-6 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <div className="text-[0.68rem] uppercase tracking-widest text-[var(--text-muted)]">
              🧮 Calculadora
            </div>
            <div className="mt-0.5 text-[1.1rem] font-bold text-[var(--text-primary)]">
              Días Hábiles
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
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[0.68rem] uppercase tracking-wide text-[var(--text-muted)]">Fecha inicial</span>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="rounded-lg border bg-[var(--bg-hover)] px-3 py-2 text-[0.85rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                style={{ borderColor: "var(--border)" }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.68rem] uppercase tracking-wide text-[var(--text-muted)]">Fecha final</span>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="rounded-lg border bg-[var(--bg-hover)] px-3 py-2 text-[0.85rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                style={{ borderColor: "var(--border)" }}
              />
            </label>
          </div>

          {/* Resultado */}
          <div className="rounded-xl p-5 text-center" style={{ background: "var(--bg-hover)" }}>
            {result !== null ? (
              <>
                <div className="text-[0.63rem] uppercase tracking-widest text-[var(--text-muted)]">Días hábiles de diferencia</div>
                <div className="mt-1 text-[3rem] font-extrabold leading-none tabular-nums text-[var(--accent)]">
                  {result}
                </div>
                <div className="mt-1 text-[0.72rem] text-[var(--text-muted)]">
                  {result === 1 ? "día hábil" : "días hábiles"}
                  {inverted && " · rango invertido"}
                </div>
              </>
            ) : (
              <div className="text-[0.82rem] text-[var(--text-muted)]">
                Selecciona ambas fechas para calcular.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="shrink-0 border-t px-6 py-3 text-[0.66rem] text-[var(--text-muted)]"
          style={{ borderColor: "var(--border)" }}
        >
          Excluye fines de semana y asuetos oficiales de Guatemala. No cuenta el día inicial.
        </div>
      </div>
    </div>
  );
}
