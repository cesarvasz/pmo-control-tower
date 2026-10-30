// src/lib/metodologia.ts
// Cumplimiento Metodología VALOR (componente del KPI del PM, peso 15).
//
// Cada PM tiene una nota 0-100 por MES. Cada mes nuevo arranca solo en 100% y el Admin la va bajando a
// mano durante el mes en /calidad-cumplimiento → Metodología. El KPI del PM usa
// la nota MÁS RECIENTE: la del mes en curso (guardada, o el 100% por defecto).
//
// Se guarda en Firestore (`metodologia_califs`), un doc por persona y mes, con
// clave `YYYY-MM::Nombre`. Sin doc = 100%: solo se persiste lo que el Admin cambia.

import { today } from "@/lib/business";
import type { MetodologiaCalif } from "@/types";

export type MetodologiaMap = Record<string, MetodologiaCalif>;

/** Nota con la que arranca cada mes (y la que rige si nadie la ha tocado). */
export const METODOLOGIA_NOTA_DEFECTO = 100;

/** Primer mes con columna ("YYYY-MM"). De ahí en adelante aparece uno nuevo cada mes. */
export const METODOLOGIA_INICIO = "2026-10";

export const metodologiaKey = (mes: string, persona: string) => `${mes}::${persona}`;

export const mesDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const esMesValido = (m: unknown): m is string => typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/** Meses "YYYY-MM" de `inicio` a `hasta`, ambos incluidos, en orden. Vacío si `hasta` < `inicio`. */
export function mesesDesde(inicio: string, hasta: string): string[] {
  const out: string[] = [];
  let [y, m] = inicio.split("-").map(Number);
  const [yh, mh] = hasta.split("-").map(Number);
  while (y < yh || (y === yh && m <= mh)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Columnas de la tabla: de METODOLOGIA_INICIO al mes en curso. */
export function metodologiaMeses(ahora: Date = today()): string[] {
  return mesesDesde(METODOLOGIA_INICIO, mesDe(ahora));
}

/** Nota de una persona en un mes: la guardada, o 100% si nadie la ha cambiado. */
export function metodologiaNota(califs: MetodologiaMap, persona: string, mes: string): number {
  return califs[metodologiaKey(mes, persona)]?.score ?? METODOLOGIA_NOTA_DEFECTO;
}

/** Nota VIGENTE de una persona: la del mes en curso. null si aún no empieza la medición. */
export function metodologiaActual(califs: MetodologiaMap, persona: string, ahora: Date = today()): number | null {
  const meses = metodologiaMeses(ahora);
  return meses.length ? metodologiaNota(califs, persona, meses[meses.length - 1]) : null;
}

/** Promedio de las notas vigentes de varias personas (el KPI del equipo); null sin medición. */
export function metodologiaPromedioActual(califs: MetodologiaMap, personas: string[], ahora: Date = today()): number | null {
  const notas = personas.map((p) => metodologiaActual(califs, p, ahora)).filter((n): n is number => n != null);
  return notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null;
}

/** "oct 26" */
export function etiquetaMesCorta(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-GT", { month: "short", year: "2-digit" }).replace(".", "");
}
