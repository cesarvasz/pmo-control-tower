"use client";

// Línea de tiempo de Implementación: una columna por mes de cierre con su
// volumen (barra y conteo) y su Profit total. Cada mes es un botón: un clic lo
// agrega o lo quita del filtro, y se pueden elegir varios. Sin ningún mes elegido
// se ve todo. El mes «Sin fecha» (filas sin Fecha_cierre) va al final, en gris.

import { SIN_FECHA, fmtImporte, type PuntoMes } from "@/lib/implementaciones";

const BAR_H = 96;

export default function TimelineImplementacion({
  serie, seleccion, onAlternarMes,
}: {
  serie: PuntoMes[];
  seleccion: string[];
  onAlternarMes: (clave: string) => void;
}) {
  if (serie.length === 0) {
    return (
      <div className="rounded-xl border py-10 text-center text-[1.05rem] text-[var(--text-muted)]"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        Sin datos.
      </div>
    );
  }

  const sel = new Set(seleccion);
  const hayFiltro = sel.size > 0;
  const maxVolumen = Math.max(1, ...serie.map((p) => p.volumen));

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-3 text-[0.92rem] text-[var(--text-muted)]">
        Volumen (files) y Profit por mes de cierre · clic en un mes para filtrarlo, se pueden elegir varios
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {serie.map((p) => {
          const elegido = sel.has(p.clave);
          const sinFecha = p.clave === SIN_FECHA;
          const alto = Math.max(4, Math.round((p.volumen / maxVolumen) * BAR_H));
          return (
            <button
              key={p.clave}
              type="button"
              onClick={() => onAlternarMes(p.clave)}
              aria-pressed={elegido}
              aria-label={`${p.label}: ${p.volumen} files, Profit ${fmtImporte(p.profit)}`}
              className="flex min-w-[92px] flex-1 flex-col items-center rounded-lg border px-2 pb-2 pt-2 text-center transition-colors hover:bg-[var(--bg-hover)]"
              style={{
                borderColor: elegido ? "var(--accent)" : "var(--border)",
                borderStyle: sinFecha ? "dashed" : "solid",
                background: elegido ? "var(--bg-accent-soft)" : "transparent",
                opacity: hayFiltro && !elegido ? 0.5 : 1,
              }}
            >
              <span className="tabular-nums text-[1.1rem] font-extrabold text-[var(--text-primary)]">
                {p.volumen.toLocaleString("es-GT")}
              </span>
              <div className="flex items-end" style={{ height: BAR_H }}>
                <div className="w-7 rounded-t"
                  style={{ height: alto, background: sinFecha ? "var(--text-disabled)" : "var(--accent)" }} />
              </div>
              <span className="mt-1.5 whitespace-nowrap text-[0.87rem] font-semibold"
                style={{ color: elegido ? "var(--accent-light)" : "var(--text-secondary)" }}>
                {p.label}
              </span>
              <span className="tabular-nums text-[0.85rem]"
                style={{ color: p.profit < 0 ? "var(--bad)" : "var(--text-muted)" }}
                title="Profit total del mes">
                {fmtImporte(p.profit)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
