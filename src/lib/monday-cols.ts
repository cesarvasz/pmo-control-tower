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

/** Lee una columna NUMÉRICA por TÍTULO, tolerante a variaciones entre boards:
 *  · título con espacios de más o distinta capitalización (match con trim + lowercase)
 *  · valor en `display_value` (columnas espejo/mirror) cuando `text` viene vacío
 *  · formato con símbolo de moneda o separador de miles ("$1,234.5" → 1234.5)
 *  Devuelve NaN si la celda no tiene ningún número (para distinguir "0" de "vacío"). */
export const colNumByTitle = (cvs: MondayColumnValue[], title: string): number => {
  const want = title.trim().toLowerCase();
  const c = cvs.find((c) => (c.column?.title ?? "").trim().toLowerCase() === want);
  const raw = (c?.text || c?.display_value || "").trim();
  if (!raw) return NaN;
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  return /\d/.test(cleaned) ? parseFloat(cleaned) : NaN;
};
