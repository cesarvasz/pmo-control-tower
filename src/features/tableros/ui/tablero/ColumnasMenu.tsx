"use client";

// Qué columnas salen en la fila de la tabla. Las ocultas no se pierden: siguen en el detalle del
// elemento (↗) y en las métricas. Solo quien puede editar la estructura del tablero lo ve.

import { useState } from "react";
import { Boton } from "../comun";
import { anclaDe, Popover } from "../celdas/comun";
import type { Columna } from "../../dominio/tablero";

export default function ColumnasMenu({ columnas, onAlternar }: { columnas: Columna[]; onAlternar(c: Columna): void }) {
  const [ancla, setAncla] = useState<DOMRect | null>(null);
  const ocultas = columnas.filter((c) => c.oculta).length;
  return (
    <>
      <Boton onClick={(e) => setAncla(anclaDe(e))} title="Elige qué columnas salen en la fila">
        Columnas{ocultas > 0 ? ` (${ocultas} ocultas)` : ""}
      </Boton>
      {ancla && (
        <Popover ancla={ancla} onCerrar={() => setAncla(null)} ancho={300}>
          <div className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Columnas en la fila</div>
          <div className="max-h-72 overflow-y-auto">
            {columnas.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[0.8rem] hover:bg-[var(--bg-hover)]">
                <input type="checkbox" checked={!c.oculta} onChange={() => onAlternar(c)} />
                <span className="truncate text-[var(--text-primary)]">{c.titulo}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[0.72rem] text-[var(--text-muted)]">Las que no marques se ven en el detalle de cada elemento (↗).</p>
        </Popover>
      )}
    </>
  );
}
