"use client";

// Editores de config de fórmula, espejo y relación. La fórmula se edita con TÍTULOS de columna
// ({Esfuerzo real} * 9); el editor de columna la pasa a ids al guardar.

import type { ConfigFormula, FormatoFormula } from "../../dominio/tipos-columna/formula";
import { CAMPOS_PERSONA, type ConfigEspejo } from "../../dominio/tipos-columna/espejo";
import type { ConfigRelacion } from "../../dominio/tipos-columna/relacion";
import { FUNCIONES } from "../../dominio/formulas";
import type { Columna } from "../../dominio/tablero";
import { estiloControl } from "../comun";

export interface ContextoConfig {
  /** Las otras columnas del mismo nivel. */
  columnas: Columna[];
  tableros: { id: string; nombre: string }[];
  ligados: Record<string, { nombre: string; columnas: Columna[] }>;
}

interface Props<C> { config: C; onCambiar(c: C): void; contexto: ContextoConfig }

const etiqueta = "flex flex-col gap-1 text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]";
const FUNCIONES_AYUDA = ["IF", "AND", "OR", "DAYS", "TODAY", "FIN", "INICIO", "ADD_DAYS", "ROUND", "SUM", "MIN", "MAX", "CONCATENATE"];

export function ConfigFormulaEd({ config, onCambiar, contexto }: Props<ConfigFormula>) {
  const insertar = (t: string) => onCambiar({ ...config, expresion: `${config.expresion}${config.expresion && !config.expresion.endsWith(" ") ? " " : ""}${t}` });
  return (
    <div className="flex flex-col gap-2.5">
      <label className={etiqueta}>Fórmula
        <textarea
          value={config.expresion} rows={3} spellCheck={false} placeholder="{Esfuerzo real} * 9"
          onChange={(e) => onCambiar({ ...config, expresion: e.target.value })}
          {...estiloControl} className={`${estiloControl.className} font-mono normal-case tracking-normal`}
        />
      </label>
      <div className="text-[0.72rem] text-[var(--text-muted)]">
        Columnas (clic para usarla):{" "}
        {contexto.columnas.length === 0 && "—"}
        {contexto.columnas.map((c) => (
          <button key={c.id} type="button" className="mr-1 mt-1 rounded-full border px-1.5 text-[var(--text-secondary)] hover:border-[var(--accent)]"
            style={{ borderColor: "var(--border)" }} onClick={() => insertar(`{${c.titulo}}`)}>
            {c.titulo}
          </button>
        ))}
        <div className="mt-1.5">
          Funciones: {FUNCIONES_AYUDA.filter((f) => FUNCIONES[f]).join(", ")}… · En un Plan: <code>{"{Plan#Fin}"}</code>, <code>{"{Plan#Inicio}"}</code> ·
          Texto entre comillas: <code>&quot;Done&quot;</code>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className={etiqueta}>Devuelve
          <select value={config.formato} onChange={(e) => onCambiar({ ...config, formato: e.target.value as FormatoFormula })} {...estiloControl}>
            <option value="numero">Número</option>
            <option value="fecha">Fecha</option>
            <option value="texto">Texto</option>
          </select>
        </label>
        {config.formato === "numero" && (
          <>
            <label className={etiqueta}>Decimales
              <input type="number" min={0} max={6} value={config.decimales} onChange={(e) => onCambiar({ ...config, decimales: Number(e.target.value) })} {...estiloControl} className={`${estiloControl.className} w-16`} />
            </label>
            <label className={etiqueta}>Unidad
              <input value={config.unidad} maxLength={10} placeholder="$" onChange={(e) => onCambiar({ ...config, unidad: e.target.value })} {...estiloControl} className={`${estiloControl.className} w-16`} />
            </label>
            <label className="flex items-center gap-1.5 pb-1 text-[0.78rem] text-[var(--text-secondary)]">
              <input type="checkbox" checked={config.unidadAntes} onChange={(e) => onCambiar({ ...config, unidadAntes: e.target.checked })} /> antes
            </label>
          </>
        )}
      </div>
    </div>
  );
}

export function ConfigEspejoEd({ config, onCambiar, contexto }: Props<ConfigEspejo>) {
  const origenes = contexto.columnas.filter((c) => c.tipo === "persona" || c.tipo === "relacion");
  const origen = origenes.find((c) => c.id === config.columna);
  const ligado = origen?.tipo === "relacion" ? contexto.ligados[(origen.config as ConfigRelacion).tableroId] : undefined;
  const campos = origen?.tipo === "persona" ? CAMPOS_PERSONA
    : [{ clave: "nombre", etiqueta: "Nombre" }, ...(ligado?.columnas.filter((c) => c.nivel === "item").map((c) => ({ clave: c.id, etiqueta: c.titulo })) ?? [])];
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className={etiqueta}>De la columna
        <select value={config.columna} onChange={(e) => onCambiar({ columna: e.target.value, campo: "" })} {...estiloControl}>
          <option value="">— Elige —</option>
          {origenes.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
        </select>
      </label>
      {origen && (
        <label className={etiqueta}>Mostrar
          <select value={config.campo} onChange={(e) => onCambiar({ ...config, campo: e.target.value })} {...estiloControl}>
            <option value="">— Elige —</option>
            {campos.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
          </select>
        </label>
      )}
      {origenes.length === 0 && <span className="text-[0.75rem] text-[var(--text-muted)]">Primero agrega una columna Persona o Relación en este nivel.</span>}
      {origen?.tipo === "relacion" && !ligado && <span className="text-[0.75rem] text-[var(--text-muted)]">Guarda y vuelve a abrir para ver las columnas del tablero ligado.</span>}
    </div>
  );
}

export function ConfigRelacionEd({ config, onCambiar, contexto }: Props<ConfigRelacion>) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className={etiqueta}>Tablero que se liga
        <select value={config.tableroId} onChange={(e) => onCambiar({ ...config, tableroId: e.target.value })} {...estiloControl}>
          <option value="">— Elige —</option>
          {contexto.tableros.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1.5 pb-1 text-[0.8rem] text-[var(--text-secondary)]">
        <input type="checkbox" checked={config.multiple} onChange={(e) => onCambiar({ ...config, multiple: e.target.checked })} /> Permitir varios
      </label>
    </div>
  );
}
