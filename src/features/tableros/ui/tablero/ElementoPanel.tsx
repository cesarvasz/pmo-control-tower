"use client";

// Detalle de un elemento: su bitácora (actualizaciones), su historial de cambios, moverlo de
// grupo y archivarlo.

import { useState } from "react";
import Modal from "@/components/Modal";
import { ErrorBox } from "@/components/ui";
import { textoCelda, type Columna, type Elemento, type Grupo } from "../../dominio/tablero";
import { Boton, estiloControl, useCarga } from "../comun";
import type { PersonaCorta } from "../celdas";
import Bitacora from "./Bitacora";

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
const nombreDe = (v: unknown) => (v && typeof v === "object" && "nombre" in v ? String((v as { nombre: unknown }).nombre) : "");

function Historial({ tableroId, elementoId, columnas, personas }: { tableroId: string; elementoId: string; columnas: Columna[]; personas: PersonaCorta[] }) {
  const { data, error } = useCarga<{ historial: Cambio[] }>(`/api/tableros/tableros/${tableroId}/historial?elemento=${elementoId}`);
  const nombres = new Map(personas.map((p) => [p.id, p.nombre]));
  const ctx = { nombrePersona: (id: string) => nombres.get(id) };

  function describir(c: Cambio): string {
    if (c.campo === "creado") return "Lo creó";
    if (c.campo === "archivado") return "Lo archivó";
    if (c.campo === "nombre") return `Nombre: «${c.antes ?? ""}» → «${c.despues ?? ""}»`;
    if (c.campo === "movido") return `Lo movió de «${c.antes ?? "—"}» a «${c.despues ?? "—"}»`;
    if (c.campo === "archivo") return `Subió el archivo «${nombreDe(c.despues)}»`;
    if (c.campo === "archivo_borrado") return `Quitó el archivo «${nombreDe(c.antes)}»`;
    const col = columnas.find((x) => x.id === c.columnaId);
    if (!col) return "Cambió una columna que ya no existe";
    const a = textoCelda(col, c.antes, ctx) || "vacío";
    const d = textoCelda(col, c.despues, ctx) || "vacío";
    return `${col.titulo}: ${a} → ${d}`;
  }

  return (
    <div>
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
  );
}

export default function ElementoPanel({ tableroId, elemento, grupos, columnas, personas, puedeEditar, esAdmin, onMover, onArchivar, onCambio, onCerrar }: {
  tableroId: string;
  elemento: Elemento;
  grupos: Grupo[];
  columnas: Columna[];
  personas: PersonaCorta[];
  puedeEditar: boolean;
  esAdmin: boolean;
  onMover(grupoId: string): Promise<void>;
  onArchivar(): Promise<void>;
  /** Algo cambió en la bitácora (para refrescar el contador). */
  onCambio(): void;
  onCerrar(): void;
}) {
  const [pestana, setPestana] = useState<"bitacora" | "historial">("bitacora");
  return (
    <Modal open onClose={onCerrar} width={600} label={`Detalle de ${elemento.nombre}`}>
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
        <div className="flex w-fit rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }} role="tablist">
          {([["bitacora", "Bitácora"], ["historial", "Historial de cambios"]] as const).map(([v, t]) => (
            <button key={v} type="button" role="tab" aria-selected={pestana === v} onClick={() => setPestana(v)}
              className="rounded-md px-3 py-1 text-[0.8rem] font-bold"
              style={pestana === v ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-muted)" }}>
              {t}
            </button>
          ))}
        </div>
        {pestana === "bitacora"
          ? <Bitacora tableroId={tableroId} elementoId={elemento.id} puedeComentar={puedeEditar} esAdmin={esAdmin} onCambio={onCambio} />
          : <Historial tableroId={tableroId} elementoId={elemento.id} columnas={columnas} personas={personas} />}
      </div>
    </Modal>
  );
}
