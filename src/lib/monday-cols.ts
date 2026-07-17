// src/lib/monday-cols.ts
// Lectores de columnas de Monday, compartidos por los módulos de dominio
// (iniciativas, req, proyectos). Funciones puras sobre column_values.

import type { MondayColumnValue } from "@/types";

/** Lee el texto de una columna por id. */
export const colText = (cvs: MondayColumnValue[], id: string): string =>
  cvs.find((c) => c.id === id)?.text ?? "";

/** Lee display_value (columnas mirror / board_relation) por id. */
export const colDisplay = (cvs: MondayColumnValue[], id: string): string =>
  cvs.find((c) => c.id === id)?.display_value ?? "";

/** Lee el texto de una columna por TÍTULO (boards de Proyectos). */
export const colByTitle = (cvs: MondayColumnValue[], title: string): string =>
  cvs.find((c) => (c.column?.title ?? "") === title)?.text ?? "";

/** Lee una columna por TÍTULO devolviendo display_value o text (cualquier tipo). */
export const colByTitleAny = (cvs: MondayColumnValue[], title: string): string => {
  const c = cvs.find((c) => (c.column?.title ?? "").trim().toLowerCase() === title.toLowerCase());
  return (c?.display_value || c?.text) ?? "";
};
