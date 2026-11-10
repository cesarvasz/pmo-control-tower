"use client";

// Detalle de un elemento: su historial de cambios, moverlo de grupo y archivarlo.

import Modal from "@/components/Modal";
import { ErrorBox } from "@/components/ui";
import { textoCelda, type Columna, type Elemento, type Grupo } from "../../dominio/tablero";
import { Boton, estiloControl, useCarga } from "../comun";
import type { PersonaCorta } from "../celdas";

interface Cambio {
  id: number;
  columnaId: string | null;
  campo: string;
  antes: unknown;
  despues: unknown;
  usuario: string | null;
  fecha: string;
}

const fmtFecha = (iso: string) => new Date(iso).toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" });

export default function ElementoPanel({ tableroId, elemento, grupos, columnas, personas, puedeEditar, onMover, onArchivar, onCerrar }: {
  tableroId: string;
  elemento: Elemento;
  grupos: Grupo[];
  /** Todas las columnas del tablero, incluso archivadas no: solo para nombrar los cambios. */
  columnas: Columna[];
  personas: PersonaCorta[];
  puedeEditar: boolean;
  onMover(grupoId: string): Promise<void>;
  onArchivar(): Promise<void>;
  onCerrar(): void;
}) {
  const { data, error } = useCarga<{ historial: Cambio[] }>(`/api/tableros/tableros/${tableroId}/historial?elemento=${elemento.id}`);
  const nombres = new Map(personas.map((p) => [p.id, p.nombre]));
  const ctx = { nombrePersona: (id: string) => nombres.get(id) };

  function describir(c: Cambio): string {
    if (c.campo === "creado") return "Lo creó";
    if (c.campo === "archivado") return "Lo archivó";
    if (c.campo === "nombre") return `Nombre: «${c.antes ?? ""}» → «${c.despues ?? ""}»`;
    if (c.campo === "movido") return `Lo movió de «${c.antes ?? "—"}» a «${c.despues ?? "—"}»`;
    const col = columnas.find((x) => x.id === c.columnaId);
    if (!col) return "Cambió una columna que ya no existe";
    const a = textoCelda(col, c.antes, ctx) || "vacío";
    const d = textoCelda(col, c.despues, ctx) || "vacío";
    return `${col.titulo}: ${a} → ${d}`;
  }

  return (
    <Modal open onClose={onCerrar} width={560} label={`Detalle de ${elemento.nombre}`}>
      <div className="flex flex-col gap-4 p-5">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">{elemento.nombre || "(sin nombre)"}</h2>
        {puedeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            {!elemento.parentId && (
              <label className="flex items-center gap-1.5 text-[0.8rem] text-[var(--text-secondary)]">Grupo
                <select value={elemento.grupoId ?? ""} onChange={(e) => onMover(e.target.value)} {...estiloControl}>
                  {grupos.map((g) => <option key={g.id} value={g.id}>{g.titulo}</option>)}
                </select>
              </label>
            )}
            <span className="flex-1" />
            <Boton onClick={async () => { if (confirm(`¿Archivar «${elemento.nombre}»${elemento.parentId ? "" : " y sus subelementos"}?`)) { await onArchivar(); onCerrar(); } }}>
              Archivar
            </Boton>
          </div>
        )}
        <div>
          <div className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Historial</div>
          {error && <ErrorBox msg={error} />}
          {!data && !error && <div className="text-[0.8rem] text-[var(--text-muted)]">Cargando…</div>}
          {data && data.historial.length === 0 && <div className="text-[0.8rem] text-[var(--text-muted)]">Sin cambios registrados.</div>}
          <ol className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {data?.historial.map((c) => (
              <li key={c.id} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="text-[0.82rem] text-[var(--text-primary)]">{describir(c)}</div>
                <div className="text-[0.72rem] text-[var(--text-muted)]">{c.usuario ?? "—"} · {fmtFecha(c.fecha)}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Modal>
  );
}
