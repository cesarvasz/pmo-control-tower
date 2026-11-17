// src/lib/reunionesImportacion.ts
// Módulo PURO. Decide qué hacer con el calendario que sirve el Apps Script al pasar su histórico a la tabla `reuniones`:
// qué reuniones son nuevas, cuáles ya están guardadas y cuáles no sirven. Es idempotente: correrla dos veces no duplica nada.
// El Apps Script solo da codigo, tipo, inicio y fin (no el organizador ni el nombre), así que lo importado queda con origen
// «apps-script», sin dueño y sin evento de Google: se ve en el dashboard pero no se edita desde la app.

import type { CalMeetingRaw } from "@/types";
import type { OrigenReunion, TipoReunion } from "@/lib/reunionesRows";

export interface ReunionImportable {
  codigo: string;
  tipo: TipoReunion;
  /** ISO UTC. */
  inicio: string;
  fin: string;
}

export interface PlanImportacion {
  nuevas: ReunionImportable[];
  /** Ya estaban guardadas (de cualquier origen): no se tocan. */
  yaEstaban: number;
  /** Repetidas dentro del mismo calendario. */
  repetidas: number;
  /** Sin código IN-###, tipo M1/M2 o fechas válidas. */
  invalidas: number;
}

/** La llave de una reunión: iniciativa + tipo + instante exacto de inicio. */
export const llaveReunion = (codigo: string, tipo: string, inicio: string): string => {
  const ms = Date.parse(inicio);
  return `${codigo.trim().toUpperCase()}|${tipo.trim().toUpperCase()}|${Number.isFinite(ms) ? ms : inicio}`;
};

/** Valida una entrada del calendario del Apps Script; null si no sirve. */
export function aImportable(e: CalMeetingRaw): ReunionImportable | null {
  const codigo = String(e?.codigo ?? "").trim().toUpperCase();
  const tipo = String(e?.meeting ?? "").trim().toUpperCase();
  const ini = Date.parse(e?.inicio), fin = Date.parse(e?.fin);
  if (!/^IN-[0-9]+$/.test(codigo) || (tipo !== "M1" && tipo !== "M2") || !Number.isFinite(ini) || !Number.isFinite(fin) || fin <= ini) return null;
  return { codigo, tipo: tipo as TipoReunion, inicio: new Date(ini).toISOString(), fin: new Date(fin).toISOString() };
}

/** `existentes`: las llaves (llaveReunion) de las reuniones que ya hay en la tabla, vigentes o no. */
export function planImportacion(calendario: CalMeetingRaw[], existentes: ReadonlySet<string>): PlanImportacion {
  const plan: PlanImportacion = { nuevas: [], yaEstaban: 0, repetidas: 0, invalidas: 0 };
  const vistas = new Set<string>();
  for (const e of calendario) {
    const r = aImportable(e);
    if (!r) { plan.invalidas++; continue; }
    const llave = llaveReunion(r.codigo, r.tipo, r.inicio);
    if (vistas.has(llave)) { plan.repetidas++; continue; }
    vistas.add(llave);
    if (existentes.has(llave)) plan.yaEstaban++;
    else plan.nuevas.push(r);
  }
  return plan;
}

/** Une dos calendarios sin repetir la misma reunión (la primera gana). Sirve para leer la base + el Apps Script mientras convivan. */
export function unirCalendarios(...fuentes: CalMeetingRaw[][]): CalMeetingRaw[] {
  const vistas = new Set<string>();
  const out: CalMeetingRaw[] = [];
  for (const lista of fuentes) {
    for (const e of lista) {
      const llave = llaveReunion(e.codigo, e.meeting, e.inicio);
      if (vistas.has(llave)) continue;
      vistas.add(llave);
      out.push(e);
    }
  }
  return out;
}

export const ORIGEN_IMPORTADO: OrigenReunion = "apps-script";
