"use client";

// Detalle de un elemento: TODAS sus columnas (también las que la tabla no muestra para que la fila
// quede corta), cada una con su celda editable bajo las mismas reglas que en la tabla. Va en el
// pop-up del elemento (ElementoPanel).

import { Celda, type EntornoCelda, type PersonaCorta } from "../celdas";
import { esCalculado } from "../../dominio/tipos-columna";
import type { Columna } from "../../dominio/tablero";

export default function DetalleCampos({ columnas, elementoId, valorDe, personas, entorno, editable, deMonday, onCambiar }: {
  /** Las columnas del elemento (su nivel), ocultas incluidas, en orden. */
  columnas: Columna[];
  elementoId: string;
  valorDe(c: Columna): unknown;
  personas: PersonaCorta[];
  entorno: EntornoCelda;
  editable(c: Columna): boolean;
  /** ¿El valor de esta columna viene de Monday (se cambia allá)? */
  deMonday(c: Columna): boolean;
  onCambiar(c: Columna, v: unknown): void;
}) {
  if (columnas.length === 0) return <p className="text-[0.82rem] text-[var(--text-muted)]">Este tablero todavía no tiene columnas.</p>;
  return (
    <dl className="grid max-h-[60vh] grid-cols-1 gap-x-4 gap-y-3 overflow-y-auto pr-1 sm:grid-cols-2">
      {columnas.map((c) => (
        <div key={c.id} className="flex min-w-0 flex-col gap-1">
          <dt className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            <span className="truncate">{c.titulo}</span>
            {c.oculta && <span className="rounded px-1 text-[0.6rem] font-bold normal-case text-[var(--text-muted)]" style={{ border: "1px solid var(--border)" }} title="No sale en la fila de la tabla">oculta</span>}
            {deMonday(c) && <span className="rounded px-1 text-[0.6rem] font-bold normal-case text-[var(--text-muted)]" style={{ border: "1px solid var(--border)" }} title="Viene de Monday: se cambia en Monday">M</span>}
            {esCalculado(c.tipo) && c.tipo !== "archivo" && <span className="rounded px-1 text-[0.6rem] font-bold normal-case text-[var(--text-muted)]" style={{ border: "1px solid var(--border)" }} title="La app lo calcula">calculado</span>}
          </dt>
          <dd className="min-h-[34px] rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}>
            <Celda
              columna={c} valor={valorDe(c)} editable={editable(c)} personas={personas} elementoId={elementoId}
              entorno={entorno} onCambiar={(v) => onCambiar(c, v)}
            />
          </dd>
        </div>
      ))}
    </dl>
  );
}
