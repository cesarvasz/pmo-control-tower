// SOLO SERVIDOR. Arma los valores de las columnas «Calculada por la app» de un tablero: pasa cada
// elemento por el MISMO procesador que usan las métricas (iniProcess) y calcula sus campos con
// dominio/calculadas-iniciativas.ts. Solo trae lo de fuera (calendario, causas de atraso y de
// reproceso) si alguna columna lo necesita.

import { buildCalMap, iniProcess } from "@/lib/ini";
import { fetchWebApp } from "@/lib/monday";
import { getAttributions } from "@/lib/store";
import type { CalMap } from "@/types";
import type { DelayMap } from "@/lib/delay";
import { tableroAMondayItems, type PersonaMetricas } from "../dominio/metricas";
import {
  camposApp, NECESITA_ATRASOS, NECESITA_CALENDARIO, NECESITA_REPROCESOS, valoresIniciativa, type ValorApp,
} from "../dominio/calculadas-iniciativas";
import { app, type ConfigApp } from "../dominio/tipos-columna/app";
import type { TableroCompleto } from "../dominio/tablero";

/** El calendario por Ini ID; undefined si no se pudo leer (así «Salud» no afirma nada que no sabe). */
async function leerCalendario(): Promise<CalMap | undefined> {
  try {
    const { calData } = await fetchWebApp();
    return calData.length ? buildCalMap(calData) : undefined;
  } catch (e) {
    console.warn("Calculadas por la app: no se pudo leer el calendario:", e instanceof Error ? e.message : e);
    return undefined;
  }
}

async function leerAtribuciones(clase: "delay" | "reproceso"): Promise<DelayMap | undefined> {
  try { return await getAttributions(clase); } catch (e) {
    console.warn(`Calculadas por la app: no se pudieron leer las causas (${clase}):`, e instanceof Error ? e.message : e);
    return undefined;
  }
}

/** { elementoId: { columnaId: valor } } de las columnas «Calculada por la app» del tablero ({} si no tiene). */
export async function valoresApp(t: TableroCompleto, personas: Map<string, PersonaMetricas>): Promise<Record<string, Record<string, ValorApp>>> {
  const disponibles = new Set(camposApp(t.tablero.categoria).map((c) => c.clave));
  const usadas = t.columnas
    .filter((c) => c.tipo === "app" && c.nivel === "item")
    .map((c) => ({ id: c.id, campo: (app.config.validar(c.config) as ConfigApp).campo }))
    .filter((u) => disponibles.has(u.campo));
  if (!usadas.length) return {};
  const campos = new Set(usadas.map((u) => u.campo));
  const quiere = (grupo: Set<string>) => [...campos].some((c) => grupo.has(c));

  const [calMap, atrasos, reprocesos] = await Promise.all([
    quiere(NECESITA_CALENDARIO) ? leerCalendario() : undefined,
    quiere(NECESITA_ATRASOS) ? leerAtribuciones("delay") : undefined,
    quiere(NECESITA_REPROCESOS) ? leerAtribuciones("reproceso") : undefined,
  ]);

  const porId = new Map(tableroAMondayItems(t, personas).map((i) => [i.id, i]));
  const out: Record<string, Record<string, ValorApp>> = {};
  for (const e of t.elementos) {
    if (e.parentId) continue;
    const item = porId.get(e.mondayItemId ?? e.id);
    const ini = item ? iniProcess([item])[0] : undefined;
    const v = ini ? valoresIniciativa(ini, { calMap, atrasos, reprocesos }) : {};
    out[e.id] = Object.fromEntries(usadas.map((u) => [u.id, v[u.campo] ?? null]));
  }
  return out;
}
