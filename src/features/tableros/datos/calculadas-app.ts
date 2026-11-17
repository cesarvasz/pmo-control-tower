// SOLO SERVIDOR. Arma los valores de las columnas «Calculada por la app» de un tablero: pasa cada
// elemento por el MISMO procesador que usan las métricas (iniProcess) y calcula sus campos con
// dominio/calculadas-iniciativas.ts. Solo trae lo de fuera (calendario, causas de atraso y de
// reproceso) si alguna columna lo necesita.

import { buildCalMap, buildReminderMap, iniProcess } from "@/lib/ini";
import { fetchReminderLog, fetchWebApp } from "@/lib/monday";
import { getAttributions } from "@/lib/store";
import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import type { CalMap, ReminderRecord } from "@/types";
import type { DelayMap } from "@/lib/delay";
import { tableroAMondayItems, type PersonaMetricas } from "../dominio/metricas";
import {
  camposApp, NECESITA_ATRASOS, NECESITA_CALENDARIO, NECESITA_CIERRES, NECESITA_RECORDATORIOS, NECESITA_REPROCESOS, valoresIniciativa, type ValorApp,
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

/** Los correos «Sin Valor Def» ya enviados, por Ini ID; undefined si no se pudo leer (sin registro no se afirma qué recordatorio toca). */
async function leerRecordatorios(): Promise<Map<string, ReminderRecord> | undefined> {
  try {
    return buildReminderMap(await fetchReminderLog());
  } catch (e) {
    console.warn("Calculadas por la app: no se pudo leer el registro de recordatorios:", e instanceof Error ? e.message : e);
    return undefined;
  }
}

/** El día (hora de Guatemala) en que se cerró a mano Sin Beneficio Definido con «Completar», por elemento: la última vez que quedó en el historial. */
export async function leerCierres(tableroId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const filas = unwrap(await getSupabaseAdmin().from("tablero_historial").select("elemento_id, creado_at")
      .eq("tablero_id", tableroId).eq("campo", "accion")
      .filter("despues->>accion", "eq", "Sin Beneficio Definido").filter("despues->>resultado", "eq", "sin-aprobar")
      .order("creado_at", { ascending: true })) ?? [];
    for (const f of filas) if (f.elemento_id) out.set(f.elemento_id, new Date(Date.parse(f.creado_at) - 6 * 3600_000).toISOString().slice(0, 10)); // UTC-6
  } catch (e) {
    console.warn("Calculadas por la app: no se pudieron leer los cierres:", e instanceof Error ? e.message : e);
  }
  return out;
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

  const [calMap, atrasos, reprocesos, recordatorios, cierres] = await Promise.all([
    quiere(NECESITA_CALENDARIO) ? leerCalendario() : undefined,
    quiere(NECESITA_ATRASOS) ? leerAtribuciones("delay") : undefined,
    quiere(NECESITA_REPROCESOS) ? leerAtribuciones("reproceso") : undefined,
    quiere(NECESITA_RECORDATORIOS) ? leerRecordatorios() : undefined,
    quiere(NECESITA_CIERRES) ? leerCierres(t.tablero.id) : undefined,
  ]);

  const porId = new Map(tableroAMondayItems(t, personas).map((i) => [i.id, i]));
  const out: Record<string, Record<string, ValorApp>> = {};
  for (const e of t.elementos) {
    if (e.parentId) continue;
    const item = porId.get(e.mondayItemId ?? e.id);
    const ini = item ? iniProcess([item])[0] : undefined;
    const v = ini ? valoresIniciativa(ini, { calMap, atrasos, reprocesos, recordatorios, cierreManual: cierres?.get(e.id) ?? null }) : {};
    out[e.id] = Object.fromEntries(usadas.map((u) => [u.id, v[u.campo] ?? null]));
  }
  return out;
}
