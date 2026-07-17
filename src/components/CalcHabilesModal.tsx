"use client";

import { useState } from "react";
import { addBusinessDays, businessDays } from "@/lib/business";
import Modal from "@/components/Modal";

// "2026-01-01" → Date local (sin desfase de zona horaria).
function parseInput(v: string): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Date → "lunes, 2 de febrero de 2026"
function fmtLong(d: Date): string {
  return d.toLocaleDateString("es-GT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const inputCls =
  "rounded-lg border bg-[var(--bg-hover)] px-3 py-2 text-[0.85rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

export default function CalcHabilesModal({ onClose }: { onClose: () => void }) {
  // ── Función 1: diferencia entre dos fechas ──
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const ds = parseInput(start);
  const de = parseInput(end);
  let diff: number | null = null;
  let inverted = false;
  if (ds && de) {
    inverted = de < ds;
    const [a, b] = inverted ? [de, ds] : [ds, de];
    diff = businessDays(a, b, true);
  }

  // ── Función 2: sumar/restar días hábiles a una fecha ──
  const [baseDate, setBaseDate] = useState("");
  const [numStr, setNumStr] = useState("");
  const [dir, setDir] = useState<"forward" | "back">("forward");

  const db = parseInput(baseDate);
  const n = Number.parseInt(numStr, 10);
  const numOk = Number.isFinite(n) && n >= 0;
  const resultDate = db && numOk ? addBusinessDays(db, dir === "forward" ? n : -n, true) : null;

  return (
    <Modal open onClose={onClose} width={448}>
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
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">

          {/* ── Función 1 ── */}
          <div className="space-y-3">
            <div className="text-[0.7rem] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Diferencia entre dos fechas
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[0.68rem] uppercase tracking-wide text-[var(--text-muted)]">Fecha inicial</span>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} style={{ borderColor: "var(--border)" }} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[0.68rem] uppercase tracking-wide text-[var(--text-muted)]">Fecha final</span>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} style={{ borderColor: "var(--border)" }} />
              </label>
            </div>
            <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg-hover)" }}>
              {diff !== null ? (
                <>
                  <div className="text-[0.63rem] uppercase tracking-widest text-[var(--text-muted)]">Días hábiles de diferencia</div>
                  <div className="mt-1 text-[2.6rem] font-extrabold leading-none tabular-nums text-[var(--accent)]">{diff}</div>
                  <div className="mt-1 text-[0.72rem] text-[var(--text-muted)]">
                    {diff === 1 ? "día hábil" : "días hábiles"}{inverted && " · rango invertido"}
                  </div>
                </>
              ) : (
                <div className="text-[0.82rem] text-[var(--text-muted)]">Selecciona ambas fechas.</div>
              )}
            </div>
          </div>

          <div className="h-px" style={{ background: "var(--border)" }} />

          {/* ── Función 2 ── */}
          <div className="space-y-3">
            <div className="text-[0.7rem] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Sumar / restar días a una fecha
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[0.68rem] uppercase tracking-wide text-[var(--text-muted)]">Fecha base</span>
                <input type="date" value={baseDate} onChange={(e) => setBaseDate(e.target.value)} className={inputCls} style={{ borderColor: "var(--border)" }} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[0.68rem] uppercase tracking-wide text-[var(--text-muted)]">Días hábiles</span>
                <input type="number" min={0} value={numStr} onChange={(e) => setNumStr(e.target.value)} placeholder="20" className={inputCls} style={{ borderColor: "var(--border)" }} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([["forward", "→ Adelante"], ["back", "← Atrás"]] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => setDir(val)}
                  className="rounded-lg border px-3 py-2 text-[0.78rem] font-semibold transition-colors"
                  style={
                    dir === val
                      ? { borderColor: "var(--accent)", color: "var(--accent)", background: "var(--bg-hover)" }
                      : { borderColor: "var(--border)", color: "var(--text-muted)" }
                  }
                >
                  {lbl}
                </button>
              ))}
            </div>
            <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg-hover)" }}>
              {resultDate ? (
                <>
                  <div className="text-[0.63rem] uppercase tracking-widest text-[var(--text-muted)]">
                    {n} {n === 1 ? "día hábil" : "días hábiles"} {dir === "forward" ? "después" : "antes"}
                  </div>
                  <div className="mt-1 text-[1.15rem] font-bold capitalize leading-tight text-[var(--accent)]">
                    {fmtLong(resultDate)}
                  </div>
                </>
              ) : (
                <div className="text-[0.82rem] text-[var(--text-muted)]">Ingresa fecha base y número de días.</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="shrink-0 border-t px-6 py-3 text-[0.66rem] text-[var(--text-muted)]"
          style={{ borderColor: "var(--border)" }}
        >
          Excluye fines de semana y asuetos oficiales de Guatemala. La diferencia no cuenta el día inicial.
        </div>
    </Modal>
  );
}
