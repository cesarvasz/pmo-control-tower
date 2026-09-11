// src/lib/delay.ts
// Atribución de responsable (compartida por Entrega/atraso y Reproceso).
// Módulo PURO (cliente + servidor). Regla de negocio común: el hecho SIEMPRE se
// muestra, pero solo penaliza su métrica (% de Entregas / % de Reproceso) cuando
// el responsable asignado es "PM". Cualquier otro (o sin asignar) se excluye.

import type { AtrasoReparto, DelayResponsible, DelayAttribution } from "@/types";

export type { DelayResponsible, DelayAttribution };

/** itemId → responsable (atraso o reproceso). */
export type DelayMap = Record<string, DelayAttribution>;

/** Opciones del dropdown de Entrega/atraso (orden de presentación). */
export const DELAY_RESPONSIBLES: readonly DelayResponsible[] = [
  "VPA", "CKU", "PM", "Sponsor", "Desarrollo", "IT", "Proveedor", "BRM",
];

/** Catálogo de roles del "Responsable atraso" en la tabla Atrasos del Resumen
 *  Ejecutivo: DELAY_RESPONSIBLES + "Sin asignar" (tramo de días sin atribuir). */
export const ATRASO_RESPONSABLES: readonly string[] = [...DELAY_RESPONSIBLES, "Sin asignar"];
const ATRASO_RESP_SET = new Set<string>(ATRASO_RESPONSABLES);
export const isAtrasoResp = (v: unknown): v is string =>
  typeof v === "string" && ATRASO_RESP_SET.has(v);

/** Reparto efectivo de los días de un atraso. Prioridad:
 *  1) `det.reparto` si tiene tramos;
 *  2) `det.responsable` legacy → un único tramo con TODOS los días;
 *  3) sin detalle → un tramo "Sin asignar".
 *  `totalDias` = días de atraso del step (0 si el step solo está "Stuck"). */
export function atrasoReparto(
  det: { reparto?: AtrasoReparto[]; responsable?: string } | undefined,
  totalDias: number,
): AtrasoReparto[] {
  if (det?.reparto && det.reparto.length > 0) return det.reparto;
  if (det?.responsable) return [{ dias: totalDias, resp: det.responsable }];
  return [{ dias: totalDias, resp: "Sin asignar" }];
}

/** Opciones del dropdown de Reproceso: incluye "Sin reproceso" (no penaliza). */
export const REPROCESO_RESPONSIBLES: readonly DelayResponsible[] = [
  "Sin reproceso", "VPA", "CKU", "PM", "Sponsor", "Desarrollo", "IT", "Proveedor", "BRM",
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

/** Cuenta ocurrencias por responsable (o "Sin asignar" si no tiene atribución),
 *  a partir de una lista de itemIds y su DelayMap. Para desgloses/gráficas. */
export function countByResponsible(ids: string[], map: DelayMap): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) {
    const r = map[id]?.responsible || "Sin asignar";
    out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}

/** Color (token CSS) por responsable — paleta categórica validada (dataviz).
 *  Requiere el contenedor con className "viz-resp" (ver globals.css). */
export const RESPONSIBLE_COLOR: Record<string, string> = {
  VPA: "var(--resp-vpa)",
  Desarrollo: "var(--resp-dev)",
  CKU: "var(--resp-cku)",
  PM: "var(--resp-pm)",
  Sponsor: "var(--resp-sponsor)",
  IT: "var(--resp-it)",
  Proveedor: "var(--resp-proveedor)",
  BRM: "var(--resp-brm)",
  "Sin reproceso": "var(--resp-clean)",
  "Sin asignar": "var(--resp-none)",
};
