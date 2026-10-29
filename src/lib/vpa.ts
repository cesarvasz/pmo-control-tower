// src/lib/vpa.ts
// Calificación mensual del VPA (pestaña «VPA» de /calidad-cumplimiento).
//
// Cada mes un Admin califica, con un número de 0 a 100 (el % de la meta que se logró), cada
// uno de los indicadores de la tabla «Objetivos de Calidad». No hay nota por defecto: un
// indicador sin calificar queda vacío. El total del mes es la suma ponderada por el peso de
// cada indicador (los pesos suman 100), así que con todo calificado es una nota de 0 a 100.
//
// Se guarda en Firestore (`vpa_califs`), un doc por mes con clave `YYYY-MM` y un mapa
// `notas` (clave del indicador → nota). Solo se persiste lo que el Admin califica.

import { today } from "@/lib/business";
import { mesDe, mesesDesde } from "@/lib/metodologia";
import type { VpaCalifMes } from "@/types";

export interface IndicadorVpa {
  /** Clave estable (la que se guarda en Firestore): no cambiarla aunque se renombre el indicador. */
  key: string;
  objetivo: string;
  indicador: string;
  /** Meta en % (la nota que rinde el 100% del peso). */
  meta: number;
  peso: number;
}

/** La tabla «Objetivos de Calidad» del VPA, en el orden en que se muestra. */
export const VPA_INDICADORES: IndicadorVpa[] = [
  { key: "reportes-claves", objetivo: "Requisitos del Cliente", indicador: "Entrega de reportes Claves", meta: 100, peso: 20 },
  { key: "optimizacion-negocio", objetivo: "Requisitos del Cliente", indicador: "Optimización de Negocio", meta: 100, peso: 20 },
  { key: "calidad-datos", objetivo: "Productividad", indicador: "Calidad & Consistencia de los Datos", meta: 100, peso: 20 },
  { key: "control-portafolio", objetivo: "Productividad", indicador: "Control del Portafolio", meta: 100, peso: 25 },
  { key: "metodologia-valor", objetivo: "Productividad", indicador: "Cumplimiento Metodología VALOR", meta: 100, peso: 15 },
];

export const VPA_PESO_TOTAL = VPA_INDICADORES.reduce((s, i) => s + i.peso, 0);

/** Primer mes con columna ("YYYY-MM"). De ahí en adelante aparece uno nuevo cada mes. */
export const VPA_INICIO = "2026-10";

/** Calificaciones de todos los meses: «YYYY-MM» → sus notas. */
export type VpaCalifs = Record<string, VpaCalifMes>;

/** Notas de un mes: clave del indicador → nota 0-100. */
export type VpaNotas = Record<string, number>;

export const esIndicadorVpa = (key: unknown): key is string =>
  typeof key === "string" && VPA_INDICADORES.some((i) => i.key === key);

/** Columnas de la tabla: de VPA_INICIO al mes en curso. */
export function vpaMeses(ahora: Date = today()): string[] {
  return mesesDesde(VPA_INICIO, mesDe(ahora));
}

/** Una nota válida: número finito de 0 a 100, redondeado a 2 decimales. null si no lo es. */
export function normalizarNotaVpa(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) return null;
  return Math.round(v * 100) / 100;
}

/** Lo guardado en Firestore para un mes → su calificación, sin lo ilegible ni los indicadores que ya no existen. */
export function leerCalifVpa(d: unknown): VpaCalifMes {
  const o = (d ?? {}) as { notas?: unknown; by?: unknown; at?: unknown };
  const notas: VpaNotas = {};
  const crudas = (o.notas ?? {}) as Record<string, unknown>;
  for (const ind of VPA_INDICADORES) {
    const n = normalizarNotaVpa(crudas[ind.key]);
    if (n != null) notas[ind.key] = n;
  }
  return { notas, ...(typeof o.by === "string" ? { by: o.by } : {}), ...(typeof o.at === "string" ? { at: o.at } : {}) };
}

/** Las califs con la nota de un indicador cambiada (o quitada con `null`) en un mes. No modifica la original. */
export function conNotaVpa(califs: VpaCalifs, mes: string, indicador: string, nota: number | null): VpaCalifs {
  const notas = { ...(califs[mes]?.notas ?? {}) };
  if (nota == null) delete notas[indicador]; else notas[indicador] = nota;
  return { ...califs, [mes]: { ...califs[mes], notas } };
}

export interface PuntosVpa {
  /** Σ (nota ÷ meta, tope 100%) × peso de los indicadores calificados. Con todo calificado, de 0 a 100. */
  puntos: number;
  /** Peso de los indicadores que ya tienen nota (lo que `puntos` podría valer como máximo hoy). */
  pesoCalificado: number;
  calificados: number;
  total: number;
  completo: boolean;
  /** puntos ÷ pesoCalificado: qué tanto de lo ya calificado se logró (0-1). null sin ninguna nota. */
  logro: number | null;
}

/** El total ponderado de un mes con las notas que tenga. */
export function puntosVpa(notas: VpaNotas | undefined): PuntosVpa {
  let puntos = 0, pesoCalificado = 0, calificados = 0;
  for (const ind of VPA_INDICADORES) {
    const n = notas?.[ind.key];
    if (n == null) continue;
    calificados += 1;
    pesoCalificado += ind.peso;
    puntos += Math.min(n / ind.meta, 1) * ind.peso;
  }
  return {
    puntos, pesoCalificado, calificados, total: VPA_INDICADORES.length,
    completo: calificados === VPA_INDICADORES.length,
    logro: pesoCalificado > 0 ? puntos / pesoCalificado : null,
  };
}
