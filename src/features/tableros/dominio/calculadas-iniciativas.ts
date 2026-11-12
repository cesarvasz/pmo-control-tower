// Campos que la app calcula para una INICIATIVA (columna de tipo «Calculada por la app»). Salen de
// las mismas funciones que usan las métricas (lib/ini.ts y lib/dashboard.ts): el tablero y el
// Control Tower no pueden dar números distintos. Lógica PURA: lo que viene de fuera (calendario,
// causas de atraso y de reproceso) entra por el contexto.

import { ymd } from "@/lib/business";
import { lateExcused, type DelayMap } from "@/lib/delay";
import { iniEntregaVerdict } from "@/lib/dashboard";
import { INI_ACTIVE_STS, iniIsParaHoy, iniItemStatus, porDefinirStatus } from "@/lib/ini";
import type { CalMap, IniItem } from "@/types";

export type FormatoCampoApp = "texto" | "numero" | "fecha";
export interface CampoApp { clave: string; etiqueta: string; formato: FormatoCampoApp; descripcion: string }

/** Los campos de una Iniciativa, en el orden en que se ofrecen. */
export const CAMPOS_INICIATIVAS: CampoApp[] = [
  { clave: "etapa", etiqueta: "Etapa", formato: "texto", descripcion: "En qué punto del embudo está (nueva, Meeting 1, aprobada · Clase A…)." },
  { clave: "plazo", etiqueta: "Plazo", formato: "texto", descripcion: "En tiempo, Para hoy o Atrasada (New: 5 días hábiles; Meeting 1: 10)." },
  { clave: "dias", etiqueta: "Días hábiles", formato: "numero", descripcion: "Días hábiles desde la fecha base (creación o Plan Futuro)." },
  { clave: "fecha_limite", etiqueta: "Fecha límite", formato: "fecha", descripcion: "Fecha base + el límite de su etapa, en días hábiles." },
  { clave: "salud", etiqueta: "Salud", formato: "texto", descripcion: "On track, At risk u Off track (cuenta en el EVM del PM)." },
  { clave: "clase", etiqueta: "Clase aprobada", formato: "texto", descripcion: "A, B o C: la clase con la que se aprobó como Proyecto." },
  { clave: "cumplimiento", etiqueta: "Cumplimiento", formato: "texto", descripcion: "A tiempo, Tarde o No evaluable (solo las aprobadas)." },
  { clave: "calidad", etiqueta: "Calidad", formato: "numero", descripcion: "100 si el atraso se excusó con un responsable distinto de PM; 0 si no (solo las aprobadas)." },
];

/** Los campos que ofrece una categoría de tablero (vacío = esa categoría todavía no tiene). */
export function camposApp(categoria: string | null | undefined): CampoApp[] {
  return categoria === "iniciativas" ? CAMPOS_INICIATIVAS : [];
}

/** Qué campos piden datos de fuera (para no traerlos si ninguna columna los usa). */
export const NECESITA_CALENDARIO = new Set(["plazo", "salud"]);
export const NECESITA_ATRASOS = new Set(["cumplimiento"]);
export const NECESITA_REPROCESOS = new Set(["calidad"]);

export interface ContextoIniciativas {
  /** Reuniones del calendario por Ini ID; sin él, «Salud» y «Para hoy» no se pueden decidir. */
  calMap?: CalMap;
  /** Causas de atraso (Cumplimiento) y de reproceso (Calidad) por id de Iniciativa. */
  atrasos?: DelayMap;
  reprocesos?: DelayMap;
}

export type ValorApp = string | number | null;

/** La etapa del embudo, en palabras. */
export function etapaIniciativa(i: IniItem): string | null {
  switch (i.estado) {
    case "APROBADA": return i.clase ? `Aprobada · Clase ${i.clase}` : "Aprobada";
    case "EN_ESPERA": return "En espera";
    case "PLAN_FUTURO": return "Plan futuro";
    case "CAMBIO_ESTRATEGIA": return "Cambio de estrategia";
    case "POR_DEFINIR": return "Por definir (Meeting 2)";
    case "SKIP": return null;
    default:
      return i.status === "New" ? "Nueva · por Meeting 1" : i.status === "Meeting 1" ? "Meeting 1 · por Meeting 2" : i.status || null;
  }
}

const SALUD: Record<string, string> = { "on-track": "On track", "in-risk": "At risk", "off-track": "Off track" };

/** El plazo de una Iniciativa activa (New / Meeting 1); null en las demás etapas. */
export function plazoIniciativa(i: IniItem, calMap?: CalMap): string | null {
  if (!INI_ACTIVE_STS.has(i.status)) return null;
  if (i.estado === "ATRASADO") return "Atrasada";
  if (i.estado === "Sin fecha") return "Sin fecha";
  // Igual que la página /iniciativas: una reunión agendada para hoy también la marca «Para hoy».
  if (i.estado === "PARA HOY" || (calMap && iniIsParaHoy(i, calMap))) return "Para hoy";
  return "En tiempo";
}

/** La salud que cuenta en el EVM del PM; null donde no aplica (aprobadas, en espera, plan futuro…) o no se puede decidir. */
export function saludIniciativa(i: IniItem, calMap?: CalMap): string | null {
  if (i.estado === "POR_DEFINIR") return SALUD[porDefinirStatus(i)];
  if (!INI_ACTIVE_STS.has(i.status)) return null;
  // Sin calendario no se sabe si hay reunión agendada: solo se puede afirmar lo que no depende de él.
  if (!calMap) return i.estado === "ATRASADO" ? SALUD["off-track"] : null;
  return SALUD[iniItemStatus(i, calMap)];
}

/** Cumplimiento de Entrega de una aprobada (la misma regla retrospectiva de las métricas). */
export function cumplimientoIniciativa(i: IniItem, atrasos?: DelayMap): string | null {
  if (i.estado !== "APROBADA") return null;
  const v = iniEntregaVerdict(i);
  if (v === "on-time") return "A tiempo";
  if (v === "late") return atrasos && lateExcused(i.id, atrasos) ? "Tarde (excusada)" : "Tarde";
  return "No evaluable";
}

/** Calidad de una aprobada: todo o nada, según haya una causa de reproceso excusada (como un REQ cerrado). */
export function calidadIniciativa(i: IniItem, reprocesos?: DelayMap): number | null {
  if (i.estado !== "APROBADA" || !i.id) return null;
  return reprocesos && lateExcused(i.id, reprocesos) ? 100 : 0;
}

/** Todos los campos de una Iniciativa. */
export function valoresIniciativa(i: IniItem, ctx: ContextoIniciativas = {}): Record<string, ValorApp> {
  return {
    etapa: etapaIniciativa(i),
    plazo: plazoIniciativa(i, ctx.calMap),
    dias: INI_ACTIVE_STS.has(i.status) ? i.dias : null,
    fecha_limite: INI_ACTIVE_STS.has(i.status) && i.deadline ? ymd(i.deadline) : null,
    salud: saludIniciativa(i, ctx.calMap),
    clase: i.clase ?? null,
    cumplimiento: cumplimientoIniciativa(i, ctx.atrasos),
    calidad: calidadIniciativa(i, ctx.reprocesos),
  };
}
