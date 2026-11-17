// Campos que la app calcula para una INICIATIVA (columna de tipo «Calculada por la app»). Salen de
// las mismas funciones que usan las métricas (lib/ini.ts y lib/dashboard.ts): el tablero y el
// Control Tower no pueden dar números distintos. Lógica PURA: lo que viene de fuera (calendario,
// causas de atraso y de reproceso) entra por el contexto.

import { ymd } from "@/lib/business";
import { cierreAutomaticoEspera } from "./acciones-iniciativa";
import { lateExcused, type DelayMap } from "@/lib/delay";
import { iniEntregaVerdict } from "@/lib/dashboard";
import { esperaReminderInfo, INI_ACTIVE_STS, iniIsParaHoy, iniItemStatus, nextOrLatest, porDefinirStatus } from "@/lib/ini";
import type { CalMap, IniItem, ReminderRecord } from "@/types";

export type FormatoCampoApp = "texto" | "numero" | "fecha";
export interface CampoApp { clave: string; etiqueta: string; formato: FormatoCampoApp; descripcion: string }

/** Los campos de una Iniciativa, en el orden en que se ofrecen. */
export const CAMPOS_INICIATIVAS: CampoApp[] = [
  { clave: "etapa", etiqueta: "Etapa", formato: "texto", descripcion: "En qué punto del embudo está (nueva, Meeting 1, aprobada · Clase A…)." },
  { clave: "plazo", etiqueta: "Plazo", formato: "texto", descripcion: "En tiempo, Para hoy o Atrasada (New: 5 días hábiles; Meeting 1: 10)." },
  { clave: "dias", etiqueta: "Días hábiles", formato: "numero", descripcion: "Días hábiles desde la fecha base (creación o Plan Futuro)." },
  { clave: "fecha_limite", etiqueta: "Fecha límite", formato: "fecha", descripcion: "Fecha base + el límite de su etapa, en días hábiles." },
  { clave: "proxima_accion", etiqueta: "Próxima acción", formato: "fecha", descripcion: "La fecha de la acción que sigue: la reunión agendada o, si no hay, la fecha límite (Meeting 1 y 2); cuándo se retoma (Plan Futuro); el próximo recordatorio (Sin Valor Def)." },
  { clave: "espera_cierre", etiqueta: "Cierre de espera", formato: "fecha", descripcion: "Sin Valor Def: el día en que Sin Beneficio Definido se cierra sin aprobarse (5 días hábiles después del 4.º recordatorio) o se cerró con «Completar»." },
  { clave: "salud", etiqueta: "Salud", formato: "texto", descripcion: "On track, At risk u Off track (cuenta en el EVM del PM)." },
  { clave: "reunion", etiqueta: "Reunión agendada", formato: "texto", descripcion: "Fecha y hora de la reunión que toca según el calendario (Meeting 1 en New, Meeting 2 en Meeting 1), o «Sin agendar»." },
  { clave: "reunion_estado", etiqueta: "Estado de la reunión", formato: "texto", descripcion: "Agendada o Sin agendar en el calendario (por Ini ID)." },
  { clave: "clase", etiqueta: "Clase aprobada", formato: "texto", descripcion: "A, B o C: la clase con la que se aprobó como Proyecto." },
  { clave: "cumplimiento", etiqueta: "Cumplimiento", formato: "texto", descripcion: "A tiempo, Tarde o No evaluable (solo las aprobadas)." },
  { clave: "calidad", etiqueta: "Calidad", formato: "numero", descripcion: "100 si el atraso se excusó con un responsable distinto de PM; 0 si no (solo las aprobadas)." },
];

/** Los campos que ofrece una categoría de tablero (vacío = esa categoría todavía no tiene). */
export function camposApp(categoria: string | null | undefined): CampoApp[] {
  return categoria === "iniciativas" ? CAMPOS_INICIATIVAS : [];
}

/** Qué campos piden datos de fuera (para no traerlos si ninguna columna los usa). */
export const NECESITA_CALENDARIO = new Set(["plazo", "salud", "reunion", "reunion_estado", "proxima_accion"]);
export const NECESITA_RECORDATORIOS = new Set(["proxima_accion", "espera_cierre"]);
/** Los que miran si Sin Beneficio Definido se cerró a mano con «Completar» (queda en el historial). */
export const NECESITA_CIERRES = new Set(["proxima_accion", "espera_cierre"]);
export const NECESITA_ATRASOS = new Set(["cumplimiento"]);
export const NECESITA_REPROCESOS = new Set(["calidad"]);

export interface ContextoIniciativas {
  /** Reuniones del calendario por Ini ID; sin él, «Salud» y «Para hoy» no se pueden decidir. */
  calMap?: CalMap;
  /** Causas de atraso (Cumplimiento) y de reproceso (Calidad) por id de Iniciativa. */
  atrasos?: DelayMap;
  reprocesos?: DelayMap;
  /** Correos «Sin Valor Def» ya enviados por Iniciativa (registro del Apps Script): de ahí sale el próximo recordatorio. */
  recordatorios?: Map<string, ReminderRecord>;
  /** El día (YYYY-MM-DD, hora de Guatemala) en que se cerró a mano Sin Beneficio Definido con «Completar»; null si no. */
  cierreManual?: string | null;
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

/** Si la reunión que toca (la de Meeting 1 si es New; la de Meeting 2 si es Meeting 1) está agendada en el calendario o no. Nada más. */
export const REUNION_ESTADO = {
  sinAgendar: "Sin agendar",
  agendada: "Agendada",
} as const;

const fechaGT = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
const textoReunion = (d: Date) =>
  `${d.toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Guatemala" })} · ${d.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Guatemala" })}`;

/** La reunión que toca según el calendario (normalmente hay una sola): su fecha y hora y si está agendada o no.
 *  null donde no aplica (otras etapas) o sin calendario: no afirma lo que no sabe. */
export function reunionIniciativa(i: IniItem, calMap?: CalMap): { texto: string; estado: string; dia?: string } | null {
  if (!calMap || !INI_ACTIVE_STS.has(i.status)) return null;
  const cal = calMap.get(i.id) || { M1: [], M2: [] };
  const m = nextOrLatest(i.status === "New" ? cal.M1 : cal.M2);
  if (!m) return { texto: REUNION_ESTADO.sinAgendar, estado: REUNION_ESTADO.sinAgendar };
  return { texto: textoReunion(m.inicio), dia: fechaGT(m.inicio), estado: REUNION_ESTADO.agendada };
}

/** El día en que Sin Beneficio Definido se cierra (o se cerró): a mano con «Completar» o sola, 5 días hábiles después del 4.º recordatorio.
 *  Solo en Sin Valor Def. Un cierre a mano anterior a la fecha «En Espera» es de una vez pasada: no cuenta. */
export function cierreEsperaIniciativa(i: IniItem, ctx: ContextoIniciativas = {}): string | null {
  if (i.estado !== "EN_ESPERA") return null;
  const manual = ctx.cierreManual && (!i.espera || ctx.cierreManual >= i.espera.slice(0, 10)) ? ctx.cierreManual : null;
  if (manual) return manual;
  const rec = ctx.recordatorios?.get(i.id);
  return rec ? cierreAutomaticoEspera(rec.count, rec.lastSent) : null;
}

/** La fecha (YYYY-MM-DD) de la acción que sigue, la misma que va bajo la flecha amarilla del timeline:
 *  · Meeting 1 y Meeting 2 (New / Meeting 1): la reunión agendada en el calendario o, si no hay, la fecha límite.
 *  · Plan Futuro: la fecha en que se retoma.
 *  · Sin Valor Def: el próximo recordatorio (mismo cálculo que la tabla «En espera» de /iniciativas); tras el 4.º, el día en que se cierra
 *    sola; null si ya se cerró, está pausado (PKU) o no tiene CKU Mail.
 *  · Aprobadas y demás etapas: null (sus acciones específicas todavía no están definidas). */
export function proximaAccionIniciativa(i: IniItem, ctx: ContextoIniciativas = {}): string | null {
  if (INI_ACTIVE_STS.has(i.status)) return reunionIniciativa(i, ctx.calMap)?.dia ?? (i.deadline ? ymd(i.deadline) : null);
  if (i.estado === "PLAN_FUTURO") return i.planFuturo ? ymd(i.planFuturo) : null;
  if (i.estado === "EN_ESPERA") {
    const cierre = cierreEsperaIniciativa(i, ctx);
    if (cierre) return cierre > fechaGT(new Date()) ? cierre : null; // por cerrarse sola → esa fecha; ya cerrada → nada más
    const proximo = esperaReminderInfo(i, ctx.recordatorios?.get(i.id)).proximo;
    return proximo ? ymd(proximo) : null;
  }
  return null;
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
    proxima_accion: proximaAccionIniciativa(i, ctx),
    espera_cierre: cierreEsperaIniciativa(i, ctx),
    salud: saludIniciativa(i, ctx.calMap),
    reunion: reunionIniciativa(i, ctx.calMap)?.texto ?? null,
    reunion_estado: reunionIniciativa(i, ctx.calMap)?.estado ?? null,
    clase: i.clase ?? null,
    cumplimiento: cumplimientoIniciativa(i, ctx.atrasos),
    calidad: calidadIniciativa(i, ctx.reprocesos),
  };
}
