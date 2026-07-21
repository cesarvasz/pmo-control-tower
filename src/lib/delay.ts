// src/lib/delay.ts
// Atribución de responsable (compartida por Entrega/atraso y Reproceso).
// Módulo PURO (cliente + servidor). Regla de negocio común: el hecho SIEMPRE se
// muestra, pero solo penaliza su métrica (% de Entregas / % de Reproceso) cuando
// el responsable asignado es "PM". Cualquier otro (o sin asignar) se excluye.

import type { DelayResponsible, DelayAttribution } from "@/types";

export type { DelayResponsible, DelayAttribution };

/** itemId → responsable (atraso o reproceso). */
export type DelayMap = Record<string, DelayAttribution>;

/** Opciones del dropdown de Entrega/atraso (orden de presentación). */
export const DELAY_RESPONSIBLES: readonly DelayResponsible[] = [
  "VPA", "CKU", "PM", "Sponsor", "Desarrollador",
];

/** Opciones del dropdown de Reproceso: incluye "Sin reproceso" (no penaliza). */
export const REPROCESO_RESPONSIBLES: readonly DelayResponsible[] = [
  "Sin reproceso", "VPA", "CKU", "PM", "Sponsor", "Desarrollador",
];

// Superset válido (incluye "Sin reproceso"); el dropdown de atraso simplemente no la ofrece.
const VALID = new Set<string>(REPROCESO_RESPONSIBLES);
export const isDelayResponsible = (v: unknown): v is DelayResponsible =>
  typeof v === "string" && VALID.has(v);

/** Un ítem se EXCUSA de su métrica (entregas o reproceso) SOLO si se le asignó un
 *  responsable distinto de "PM". Sin asignar o PM → sigue penalizando (todo ítem
 *  en scope debería asignarse; mientras tanto cuenta en su contra). */
export const lateExcused = (id: string, map: DelayMap): boolean => {
  const r = map[id]?.responsible;
  return r != null && r !== "PM";
};
