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

/** Tramos GUARDADOS de un atraso, tal cual (migra el `responsable` legacy a un
 *  único tramo con todos los días). [] si nunca se asignó nada — a diferencia
 *  de `atrasoReparto`, no inventa un tramo "Sin asignar" (la UI editable no
 *  quiere persistir un tramo fantasma con solo abrir la celda). */
export function savedAtrasoTramos(
  det: { reparto?: AtrasoReparto[]; responsable?: string } | undefined,
  totalDias: number,
): AtrasoReparto[] {
  if (det?.reparto && det.reparto.length > 0) return det.reparto;
  if (det?.responsable) return [{ dias: totalDias, resp: det.responsable }];
  return [];
}

/** Autocompleta el remanente (totalDias − suma de tramos guardados — crece 1
 *  día hábil por cada día que pasa sin que nadie toque el reparto) sumándolo
 *  al tramo marcado `actual`. SOLO con marca explícita — un único tramo NO se
 *  autocompleta por sí solo (aunque no haya ambigüedad de A QUIÉN dárselo, sí
 *  la hay de si el hueco es "días nuevos que le tocan" o "un desglose a medias
 *  que el usuario todavía no termina de repartir" — ver AtrasoRespReparto en
 *  components/AtrasoInlineEdit.tsx, que etiqueta solo automáticamente cuando
 *  un tramo único queda balanceado al 100% al guardar). Sin ningún tramo
 *  marcado, se devuelve tal cual, con el remanente fuera (el caller decide qué
 *  hacer — ver `atrasoReparto` abajo). */
export function foldAtrasoTramos(base: AtrasoReparto[], totalDias: number): AtrasoReparto[] {
  const used = base.reduce((s, r) => s + r.dias, 0);
  const rem = totalDias - used;
  if (rem <= 0) return base;
  const idx = base.findIndex((r) => r.actual);
  if (idx === -1) return base;
  return base.map((r, i) => (i === idx ? { ...r, dias: r.dias + rem } : r));
}

/** Reparto efectivo de los días de un atraso, para lectura/agregación (KPIs,
 *  Carátula Light, Status Card en modo estático): `savedAtrasoTramos` +
 *  `foldAtrasoTramos`, y si aun así queda remanente (2+ tramos sin marcar
 *  "actual", o nunca se asignó nada) se agrega como tramo "Sin asignar" —
 *  la suma de `dias` de todos los tramos SIEMPRE da `totalDias`.
 *  `totalDias` = días de atraso del step (0 si el step solo está "Stuck"). */
export function atrasoReparto(
  det: { reparto?: AtrasoReparto[]; responsable?: string } | undefined,
  totalDias: number,
): AtrasoReparto[] {
  const base = savedAtrasoTramos(det, totalDias);
  if (base.length === 0) return [{ dias: totalDias, resp: "Sin asignar" }];
  const folded = foldAtrasoTramos(base, totalDias);
  const rem = totalDias - folded.reduce((s, r) => s + r.dias, 0);
  return rem > 0 ? [...folded, { dias: rem, resp: "Sin asignar" }] : folded;
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
