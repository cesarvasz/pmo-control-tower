"use client";

// Alta de un elemento con FORMULARIO (pop-up), en vez de la fila «+ Agregar» de la tabla: nombre,
// grupo (cae por defecto donde dice la categoría) y los campos que se llenan a mano, ocultos
// incluidos. Los tipos simples usan controles nativos; los demás (status, personas, relación,
// plan…) reutilizan las celdas de la tabla. Se crea con la operación elemento.crear.

import { useState } from "react";
import Modal from "@/components/Modal";
import { Boton, estiloControl, Nota } from "../comun";
import { Celda, type EntornoCelda, type PersonaCorta } from "../celdas";
import { tipoColumna } from "../../dominio/tipos-columna";
import type { ConfigTexto } from "../../dominio/tipos-columna/texto";
import type { Columna, Grupo } from "../../dominio/tablero";

const etiqueta = "flex flex-col gap-1 text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]";
const claseNativo = `${estiloControl.className} w-full py-1.5`;

/** El control de un campo: nativo para texto, número y fecha; la celda de la tabla para el resto. */
export function Campo({ columna, valor, personas, entorno, onCambiar }: {
  columna: Columna; valor: unknown; personas: PersonaCorta[]; entorno: EntornoCelda; onCambiar(v: unknown): void;
}) {
  if (columna.tipo === "texto") {
    const multilinea = (tipoColumna("texto")!.config.validar(columna.config) as ConfigTexto).multilinea;
    const texto = typeof valor === "string" ? valor : "";
    const cambiar = (s: string) => onCambiar(s === "" ? null : s);
    return multilinea
      ? <textarea value={texto} rows={3} onChange={(e) => cambiar(e.target.value)} aria-label={columna.titulo} {...estiloControl} className={claseNativo} />
      : <input value={texto} onChange={(e) => cambiar(e.target.value)} aria-label={columna.titulo} {...estiloControl} className={claseNativo} />;
  }
  if (columna.tipo === "numero") {
    return (
      <input
        type="number" step="any" value={typeof valor === "number" ? valor : ""} aria-label={columna.titulo}
        onChange={(e) => onCambiar(e.target.value === "" ? null : Number(e.target.value))} {...estiloControl} className={claseNativo}
      />
    );
  }
  if (columna.tipo === "fecha") {
    return (
      <input
        type="date" value={typeof valor === "string" ? valor : ""} aria-label={columna.titulo}
        onChange={(e) => onCambiar(e.target.value || null)} {...estiloControl} className={claseNativo}
      />
    );
  }
  return (
    <div className="min-h-[34px] rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}>
      <Celda columna={columna} valor={valor} editable personas={personas} elementoId="nuevo" entorno={entorno} onCambiar={onCambiar} />
    </div>
  );
}

export default function FormularioAlta({ sustantivo, grupos, grupoInicial, columnas, valoresIniciales, personas, entorno, onCrear, onCerrar }: {
  /** Lo que se crea, en singular y minúsculas: «iniciativa». */
  sustantivo: string;
  grupos: Grupo[];
  /** El grupo en el que cae por defecto. */
  grupoInicial: string | null;
  /** Los campos del formulario (ya filtrados a lo que esta persona puede llenar), en orden. */
  columnas: Columna[];
  /** Valores con que nace (p. ej. el status «New»). */
  valoresIniciales: Record<string, unknown>;
  personas: PersonaCorta[];
  entorno: EntornoCelda;
  onCrear(d: { nombre: string; grupoId: string; valores: Record<string, unknown> }): Promise<void>;
  onCerrar(): void;
}) {
  const [nombre, setNombre] = useState("");
  const [grupoId, setGrupoId] = useState(grupoInicial ?? grupos[0]?.id ?? "");
  const [valores, setValores] = useState<Record<string, unknown>>(valoresIniciales);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sucio = nombre.trim() !== "" || Object.keys(valores).some((k) => JSON.stringify(valores[k]) !== JSON.stringify(valoresIniciales[k]))
    || Object.keys(valoresIniciales).some((k) => !(k in valores));
  const cerrar = () => { if (!enviando && (!sucio || confirm(`¿Descartar la ${sustantivo} que estás llenando?`))) onCerrar(); };
  const cambiar = (c: Columna, v: unknown) => setValores((s) => {
    const n = { ...s };
    if (v === null || v === undefined) delete n[c.id]; else n[c.id] = v;
    return n;
  });

  async function crear() {
    if (!nombre.trim() || !grupoId) return;
    setEnviando(true); setError(null);
    try {
      await onCrear({ nombre: nombre.trim(), grupoId, valores });
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear");
      setEnviando(false);
    }
  }

  return (
    <Modal open onClose={cerrar} width={760} label={`Nueva ${sustantivo}`}>
      <form className="flex flex-col gap-4 p-5" onSubmit={(e) => { e.preventDefault(); void crear(); }}>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Nueva {sustantivo}</h2>
        {error && <Nota tono="mal">{error}</Nota>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className={`${etiqueta} sm:col-span-2`}>
            Nombre <span className="text-[var(--bad)]">*</span>
            <input
              autoFocus value={nombre} maxLength={255} onChange={(e) => setNombre(e.target.value)} placeholder={`Nombre de la ${sustantivo}`}
              {...estiloControl} className={claseNativo}
            />
          </label>
          <label className={etiqueta}>Grupo
            <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} {...estiloControl} className={claseNativo}>
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.titulo}</option>)}
            </select>
          </label>
        </div>

        {columnas.length > 0 && (
          <div className="grid max-h-[55vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {columnas.map((c) => (
              <div key={c.id} className="flex min-w-0 flex-col gap-1">
                <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{c.titulo}</span>
                <Campo columna={c} valor={valores[c.id] ?? null} personas={personas} entorno={entorno} onCambiar={(v) => cambiar(c, v)} />
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Boton type="button" onClick={cerrar} disabled={enviando}>Cancelar</Boton>
          <Boton type="submit" primario disabled={enviando || !nombre.trim() || !grupoId}>{enviando ? "Creando…" : `Crear ${sustantivo}`}</Boton>
        </div>
      </form>
    </Modal>
  );
}
