"use client";

// C4 — Distribución por rangos de tiempo hábil. Es un FILTRO: clic en una
// barra filtra todo el tablero, clic de nuevo lo quita. Las barras siempre
// muestran el total (se calculan sin su propio filtro — ver
// distribucionRangos en lib/clonaciones.ts), así se puede ver el resto de
// opciones y cambiar de selección sin perder contexto.

import type { FilaRango, RangoKey } from "@/lib/clonaciones";

export default function DistribucionRangos({
  filas, seleccion, onSeleccionar,
}: {
  filas: FilaRango[];
  seleccion: RangoKey | null;
  onSeleccionar: (key: RangoKey) => void;
}) {
  const max = Math.max(1, ...filas.map((f) => f.n));

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {filas.map((f) => {
          const on = seleccion === f.key;
          const alto = Math.max(2, (f.n / max) * 90);
          return (
            <button
              key={f.key}
              onClick={() => onSeleccionar(f.key)}
              className="flex flex-col items-center justify-end rounded-lg px-1.5 pb-2 pt-3 text-center transition-colors"
              style={{
                background: on ? "var(--bg-accent-soft)" : "var(--bg-hover)",
                boxShadow: on ? "inset 0 0 0 1.5px var(--accent)" : undefined,
                minHeight: 150,
              }}
            >
              <span className="tabular-nums text-[0.68rem] font-bold" style={{ color: on ? "var(--accent-light)" : "var(--text-secondary)" }}>
                {f.pct.toFixed(1)}%
              </span>
              <div className="mt-1 flex h-[90px] w-full items-end justify-center">
                <div className="w-6 rounded-t-sm" style={{ height: alto, background: on ? "var(--accent)" : "var(--text-disabled)", opacity: on ? 0.95 : 0.55 }} />
              </div>
              <span className="mt-2 text-[0.66rem] font-semibold leading-tight" style={{ color: on ? "var(--accent-light)" : "var(--text-muted)" }}>
                {f.label}
              </span>
              <span className="tabular-nums text-[0.64rem] text-[var(--text-muted)]">
                n={f.n.toLocaleString("es-GT")} · acum {f.acumulado.toFixed(0)}%
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[0.7rem] text-[var(--text-muted)]">
        Clic en una barra para filtrar por ese rango de tiempo hábil · clic de nuevo para quitarlo.
      </p>
    </div>
  );
}
