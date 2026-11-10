"use client";

// REGISTRO de editores de celda: uno por clave de tipo de columna (dominio/tipos-columna).
// Al agregar un tipo nuevo, se agrega aquí su editor; si falta, la celda se muestra solo como texto.

import type { ComponentType } from "react";
import { tipoColumna } from "../../dominio/tipos-columna";
import { textoCelda } from "../../dominio/tablero";
import { CeldaCheckbox, CeldaFecha, CeldaNumero, CeldaTexto, CeldaTimeline } from "./basicas";
import { CeldaDropdown, CeldaPersona, CeldaStatus } from "./listas";
import { CeldaArchivo, CeldaEspejo, CeldaFormula, CeldaRelacion } from "./calculadas";
import { claseCelda, type PropsCelda } from "./comun";

export const EDITORES_CELDA: Record<string, ComponentType<PropsCelda<never, never>>> = {
  texto: CeldaTexto,
  numero: CeldaNumero,
  fecha: CeldaFecha,
  timeline: CeldaTimeline,
  checkbox: CeldaCheckbox,
  status: CeldaStatus,
  dropdown: CeldaDropdown,
  persona: CeldaPersona,
  formula: CeldaFormula,
  espejo: CeldaEspejo,
  relacion: CeldaRelacion,
  archivo: CeldaArchivo,
} as Record<string, ComponentType<PropsCelda<never, never>>>;

type PropsCeldaLibre = Omit<PropsCelda, "config" | "valor"> & { valor: unknown };

/** Celda de cualquier tipo: valida config y valor con el registro y usa el editor que toque.
 *  En las calculadas (fórmula, espejo, archivo) `valor` es el ya calculado. */
export function Celda({ columna, valor, editable, personas, onCambiar, elementoId, entorno }: PropsCeldaLibre) {
  const tipo = tipoColumna(columna.tipo);
  const Editor = EDITORES_CELDA[columna.tipo];
  if (!tipo || !Editor) return <span className={claseCelda}>{textoCelda(columna, valor)}</span>;
  const config = tipo.config.validar(columna.config);
  const v = valor === undefined || valor === null ? null : tipo.valor.validar(valor, config);
  const E = Editor as unknown as ComponentType<PropsCelda>;
  return (
    <E columna={columna} config={config} valor={v} editable={editable} personas={personas} onCambiar={onCambiar}
      elementoId={elementoId} entorno={entorno} />
  );
}

export type { PersonaCorta, EntornoCelda } from "./comun";
