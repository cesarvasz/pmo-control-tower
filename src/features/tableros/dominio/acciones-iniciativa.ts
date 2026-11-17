// Acciones de una iniciativa que se COMPLETAN a mano (botón «✓ Completar» de la flecha amarilla del timeline): la Meeting 1, la
// Meeting 2, el Plan Futuro y Sin Beneficio Definido. Al completarla se anota fecha y hora y se elige la SIGUIENTE acción; la iniciativa pasa a la etapa de esa acción
// (la columna Status sigue siendo la etapa de la que dependen el plazo, el On/Off Track y el EVM).
// Lógica PURA: la usan el servidor (operación «iniciativa.completar») y el pop-up.

import { addBusinessDays, parseYMD, ymd } from "@/lib/business";
import { claseDeAprobacion, ESPERA_MAX_CORREOS } from "@/lib/ini";
import { claveNombre } from "./personas";

/** Las acciones que se completan con el botón. */
export const ACCIONES_COMPLETABLES = ["Meeting 1", "Meeting 2", "Plan Futuro", "Sin Beneficio Definido"] as const;
export type AccionCompletable = (typeof ACCIONES_COMPLETABLES)[number];
export const esAccionCompletable = (v: unknown): v is AccionCompletable => (ACCIONES_COMPLETABLES as readonly unknown[]).includes(v);

/** Todas las acciones que pueden venir después, en el orden en que se ofrecen. */
export const SIGUIENTES_ACCIONES = ["Meeting 2", "Plan Futuro", "Sin Beneficio Definido", "Aprobada"] as const;
export type SiguienteAccion = (typeof SIGUIENTES_ACCIONES)[number];
export const CLASES_APROBADA = ["A", "B", "C"] as const;
export type ClaseAprobada = (typeof CLASES_APROBADA)[number];

/** Lo que se elige al completar: una siguiente acción o, en Sin Beneficio Definido, «Completar» a secas (se cierra sin aprobar, sin más acciones). */
export const OPCION_COMPLETAR = "Completar" as const;
export type OpcionCompletar = SiguienteAccion | typeof OPCION_COMPLETAR;

export const esSiguienteAccion = (v: unknown): v is SiguienteAccion => (SIGUIENTES_ACCIONES as readonly unknown[]).includes(v);
export const esClaseAprobada = (v: unknown): v is ClaseAprobada => (CLASES_APROBADA as readonly unknown[]).includes(v);

/** Lo que se puede elegir al completar una acción: tras la Meeting 1, las cuatro; tras la Meeting 2, sin repetir la Meeting 2;
 *  tras el Plan Futuro, solo Sin Beneficio Definido o Aprobada; en Sin Beneficio Definido, «Completar» (cerrarla) o Aprobada. */
export function siguientesDe(accion: AccionCompletable): OpcionCompletar[] {
  if (accion === "Sin Beneficio Definido") return [OPCION_COMPLETAR, "Aprobada"];
  if (accion === "Plan Futuro") return ["Sin Beneficio Definido", "Aprobada"];
  return accion === "Meeting 2" ? SIGUIENTES_ACCIONES.filter((a) => a !== "Meeting 2") : [...SIGUIENTES_ACCIONES];
}

/** En qué etapa (texto del Status) está la iniciativa mientras la acción está pendiente: la Meeting 1 se completa estando en
 *  New; la Meeting 2, estando en «Meeting 1» (el status lleva el nombre de la última reunión hecha); el Plan Futuro, en «Plan Futuro»;
 *  Sin Beneficio Definido, en «Sin Valor Def». */
export const ETAPA_PENDIENTE: Record<AccionCompletable, string> = { "Meeting 1": "New", "Meeting 2": "Meeting 1", "Plan Futuro": "Plan Futuro", "Sin Beneficio Definido": "Sin Valor Def" };

/** El texto de la etiqueta de Status a la que pasa la iniciativa. «Aprobada» necesita la Clase (el Status real es PM "A"/"B"/"C").
 *  «Meeting 2» → «Meeting 1»: el status lleva el nombre de la última reunión hecha (ya hubo M1, falta M2). */
export function statusDeSiguiente(siguiente: SiguienteAccion, clase?: ClaseAprobada | null): string | null {
  switch (siguiente) {
    case "Meeting 2": return "Meeting 1";
    case "Plan Futuro": return "Plan Futuro";
    case "Sin Beneficio Definido": return "Sin Valor Def";
    case "Aprobada": return clase ? `PM "${clase}"` : null;
  }
}

/** Busca la etiqueta de un Status por su texto (sin importar mayúsculas, acentos ni el tipo de comillas de PM "A"). */
export function buscarEtiqueta<T extends { texto: string }>(etiquetas: T[], texto: string): T | undefined {
  const clase = claseDeAprobacion(texto);
  if (clase) return etiquetas.find((e) => claseDeAprobacion(e.texto) === clase);
  return etiquetas.find((e) => claveNombre(e.texto) === claveNombre(texto));
}

export type PlanCompletar =
  /** `statusTexto` y `siguiente` son null cuando solo se cierra Sin Beneficio Definido («Completar»): el Status no cambia. */
  | { ok: true; accion: AccionCompletable; statusTexto: string | null; siguiente: SiguienteAccion | null; clase: ClaseAprobada | null; fecha: string | null }
  | { ok: false; error: string };

/** Valida «completar la acción» y dice a qué etapa pasa. Solo se completa estando pendiente (Meeting 1: en New; Meeting 2: en «Meeting 1»; Plan Futuro: en «Plan Futuro»). */
export function planCompletar(d: {
  accion: unknown; statusActual: string | null; siguiente: unknown; clase?: unknown;
  /** Plan Futuro: la fecha en que se retoma (YYYY-MM-DD). */
  fecha?: unknown;
  /** Hoy en Guatemala (YYYY-MM-DD): la fecha para retomar tiene que ser posterior. */
  hoy?: string;
}): PlanCompletar {
  if (!esAccionCompletable(d.accion)) return { ok: false, error: "Esa acción no se completa con el botón" };
  if (claveNombre(d.statusActual ?? "") !== claveNombre(ETAPA_PENDIENTE[d.accion])) return { ok: false, error: `${d.accion} ya no está pendiente en esta iniciativa` };
  if (!(siguientesDe(d.accion) as readonly unknown[]).includes(d.siguiente)) return { ok: false, error: "Elige la siguiente acción" };
  // Sin Beneficio Definido + «Completar»: se cierra sin aprobar; el Status se queda como está y no hay más acciones
  if (d.siguiente === OPCION_COMPLETAR) return { ok: true, accion: d.accion, statusTexto: null, siguiente: null, clase: null, fecha: null };
  if (!esSiguienteAccion(d.siguiente)) return { ok: false, error: "Elige la siguiente acción" };
  const clase = d.siguiente === "Aprobada" ? (esClaseAprobada(d.clase) ? d.clase : null) : null;
  if (d.siguiente === "Aprobada" && !clase) return { ok: false, error: "Elige la Clase con la que se aprueba (A, B o C)" };
  // Plan Futuro: pide la fecha en que se retoma (y de ella salen los recordatorios)
  let fecha: string | null = null;
  if (d.siguiente === "Plan Futuro") {
    fecha = fechaValida(d.fecha);
    if (!fecha) return { ok: false, error: "Elige la fecha en que se va a retomar" };
    if (d.hoy && fecha <= d.hoy) return { ok: false, error: "La fecha para retomar tiene que ser posterior a hoy" };
  }
  const statusTexto = statusDeSiguiente(d.siguiente, clase);
  return statusTexto ? { ok: true, accion: d.accion, statusTexto, siguiente: d.siguiente, clase, fecha } : { ok: false, error: "Siguiente acción inválida" };
}

/** Días hábiles antes de la fecha de Plan Futuro en que aparece el recordatorio (el mismo de la tabla «Plan Futuro» de /iniciativas). */
export const RECORDATORIO_PLAN_FUTURO_DIAS = 5;

/** Una fecha YYYY-MM-DD que existe en el calendario (no «2026-02-31»); null si no. */
export function fechaValida(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = parseYMD(v);
  return d && ymd(d) === v.trim() ? v.trim() : null;
}

/** Cuándo salta el recordatorio de un Plan Futuro: 5 días hábiles (sin fines de semana ni asuetos) antes de la fecha en que se retoma. */
export function recordatorioPlanFuturo(fecha: string): string | null {
  const d = fechaValida(fecha) && parseYMD(fecha);
  return d ? ymd(addBusinessDays(d, -RECORDATORIO_PLAN_FUTURO_DIAS, true)) : null;
}

/** Días hábiles después del último recordatorio (el 4.º) en que Sin Beneficio Definido se cierra sola si no se aprueba. */
export const DIAS_CIERRE_ESPERA = 5;

/** El día (YYYY-MM-DD) en que Sin Beneficio Definido se cierra sola: 5 días hábiles después del último de los 4 recordatorios.
 *  null mientras falten recordatorios por enviar (o no se sepa cuándo se mandó el último). */
export function cierreAutomaticoEspera(enviados: number, ultimoEnvio: Date | null): string | null {
  if (enviados < ESPERA_MAX_CORREOS || !ultimoEnvio) return null;
  return ymd(addBusinessDays(ultimoEnvio, DIAS_CIERRE_ESPERA, true));
}

/** Un cambio del historial (lo que devuelve /historial), solo lo que se usa aquí. */
export interface CambioHistorial { campo: string; despues: unknown; fecha: string }

/** Cuándo se completó una acción: la fecha y hora (ISO) de la última vez que se registró; null si nunca. */
export function momentoDeAccion(historial: CambioHistorial[], accion: string): string | null {
  const veces = historial
    .filter((c) => c.campo === "accion" && c.despues !== null && typeof c.despues === "object" && (c.despues as { accion?: unknown }).accion === accion)
    .map((c) => c.fecha)
    .sort();
  return veces.length ? veces[veces.length - 1] : null;
}
