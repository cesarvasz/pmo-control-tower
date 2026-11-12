"use client";

// REGISTRO de editores de CONFIG de columna (etiquetas de un status, opciones de una lista…).
// Un tipo sin entrada aquí simplemente no tiene nada que configurar.

import type { ComponentType } from "react";
import { CATEGORIAS_STATUS, categoriaStatus } from "../../dominio/estados";
import type { ConfigStatus } from "../../dominio/tipos-columna/status";
import type { ConfigDropdown } from "../../dominio/tipos-columna/dropdown";
import type { ConfigNumero } from "../../dominio/tipos-columna/numero";
import type { ConfigTexto } from "../../dominio/tipos-columna/texto";
import type { ConfigPersona } from "../../dominio/tipos-columna/persona";
import { estiloControl } from "../comun";
import { ConfigEspejoEd, ConfigFormulaEd, ConfigRelacionEd, type ContextoConfig } from "./configCalculadas";

/** `contexto` solo lo usan los que miran otras columnas o tableros (fórmula, espejo, relación). */
interface PropsConfig<C> { config: C; onCambiar(c: C): void; contexto: ContextoConfig }

const nuevoId = (ids: string[]) => String(ids.reduce((m, id) => Math.max(m, Number(id) || 0), 0) + 1);
const quitar = "rounded px-1.5 text-[0.85rem] text-[var(--text-muted)] hover:text-[#ef4444]";
const agregar = "mt-1 text-[0.78rem] font-semibold text-[var(--accent)] hover:underline";

function ConfigStatusEd({ config, onCambiar }: PropsConfig<ConfigStatus>) {
  const set = (i: number, cambio: Partial<ConfigStatus["etiquetas"][number]>) =>
    onCambiar({ etiquetas: config.etiquetas.map((e, j) => (j === i ? { ...e, ...cambio } : e)) });
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[0.72rem] text-[var(--text-muted)]">La categoría es lo que leen las métricas (hecho, en curso…), no el texto.</div>
      {config.etiquetas.map((e, i) => (
        <div key={e.id} className="flex items-center gap-1.5">
          <input type="color" value={e.color} onChange={(x) => set(i, { color: x.target.value })} aria-label="Color" className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent" />
          <input value={e.texto} onChange={(x) => set(i, { texto: x.target.value })} aria-label="Texto" {...estiloControl} className={`${estiloControl.className} flex-1`} />
          <select value={e.categoria} onChange={(x) => set(i, { categoria: x.target.value })} aria-label="Categoría" {...estiloControl}>
            {CATEGORIAS_STATUS.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
          </select>
          <button type="button" className={quitar} onClick={() => onCambiar({ etiquetas: config.etiquetas.filter((_, j) => j !== i) })} aria-label="Quitar">✕</button>
        </div>
      ))}
      <button
        type="button" className={`${agregar} self-start`}
        onClick={() => onCambiar({ etiquetas: [...config.etiquetas, { id: nuevoId(config.etiquetas.map((e) => e.id)), texto: "Nueva", color: categoriaStatus("en_curso")!.color, categoria: "en_curso" }] })}
      >
        + Etiqueta
      </button>
    </div>
  );
}

function ConfigDropdownEd({ config, onCambiar }: PropsConfig<ConfigDropdown>) {
  return (
    <div className="flex flex-col gap-1.5">
      {config.opciones.map((o, i) => (
        <div key={o.id} className="flex items-center gap-1.5">
          <input
            value={o.texto} aria-label="Opción" {...estiloControl} className={`${estiloControl.className} flex-1`}
            onChange={(x) => onCambiar({ ...config, opciones: config.opciones.map((p, j) => (j === i ? { ...p, texto: x.target.value } : p)) })}
          />
          <button type="button" className={quitar} onClick={() => onCambiar({ ...config, opciones: config.opciones.filter((_, j) => j !== i) })} aria-label="Quitar">✕</button>
        </div>
      ))}
      <button type="button" className={`${agregar} self-start`} onClick={() => onCambiar({ ...config, opciones: [...config.opciones, { id: nuevoId(config.opciones.map((o) => o.id)), texto: "Nueva opción" }] })}>
        + Opción
      </button>
      <label className="flex items-center gap-1.5 text-[0.8rem] text-[var(--text-secondary)]">
        <input type="checkbox" checked={config.multiple} onChange={(x) => onCambiar({ ...config, multiple: x.target.checked })} /> Permitir varias
      </label>
    </div>
  );
}

function ConfigNumeroEd({ config, onCambiar }: PropsConfig<ConfigNumero>) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[0.8rem] text-[var(--text-secondary)]">
      <label className="flex items-center gap-1.5">Decimales
        <input type="number" min={0} max={6} value={config.decimales} onChange={(x) => onCambiar({ ...config, decimales: Number(x.target.value) })} {...estiloControl} className={`${estiloControl.className} w-16`} />
      </label>
      <label className="flex items-center gap-1.5">Unidad
        <input value={config.unidad} maxLength={10} placeholder="$, hrs…" onChange={(x) => onCambiar({ ...config, unidad: x.target.value })} {...estiloControl} className={`${estiloControl.className} w-20`} />
      </label>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={config.unidadAntes} onChange={(x) => onCambiar({ ...config, unidadAntes: x.target.checked })} /> Unidad antes del número
      </label>
    </div>
  );
}

function ConfigTextoEd({ config, onCambiar }: PropsConfig<ConfigTexto>) {
  return (
    <label className="flex items-center gap-1.5 text-[0.8rem] text-[var(--text-secondary)]">
      <input type="checkbox" checked={config.multilinea} onChange={(x) => onCambiar({ multilinea: x.target.checked })} /> Texto largo (varias líneas)
    </label>
  );
}

function ConfigPersonaEd({ config, onCambiar }: PropsConfig<ConfigPersona>) {
  return (
    <label className="flex items-center gap-1.5 text-[0.8rem] text-[var(--text-secondary)]">
      <input type="checkbox" checked={config.multiple} onChange={(x) => onCambiar({ multiple: x.target.checked })} /> Permitir varias personas
    </label>
  );
}

export const EDITORES_CONFIG: Record<string, ComponentType<PropsConfig<never>>> = {
  status: ConfigStatusEd,
  dropdown: ConfigDropdownEd,
  numero: ConfigNumeroEd,
  texto: ConfigTextoEd,
  persona: ConfigPersonaEd,
  formula: ConfigFormulaEd,
  espejo: ConfigEspejoEd,
  relacion: ConfigRelacionEd,
} as Record<string, ComponentType<PropsConfig<never>>>;

export type { PropsConfig };
