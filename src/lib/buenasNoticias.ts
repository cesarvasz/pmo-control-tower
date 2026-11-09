// Buenas noticias: cada lunes alguien del equipo da las buenas noticias. La rotación sigue el orden de NOMBRES, empezando
// el lunes 16-nov-2026 con el primero; si el lunes es asueto, se da el martes siguiente. Si la persona asignada no puede,
// un suplente la reemplaza (se guarda aparte, por semana). La portada solo muestra el nombre el viernes previo y ese día.

import { isHoliday } from "@/lib/holidays";
import { mondayOfWeek, ymd } from "@/lib/business";

export const NOMBRES_BUENAS_NOTICIAS = ["Cesar Vasquez", "Daniela Alvarez", "David Guzman", "Luis Aguilar"] as const;

/** Lunes de la primera asignación (índice 0 de la rotación). */
const ANCLA = new Date(2026, 10, 16);
/** Semanas que lista el popup: la actual y las 8 siguientes. */
export const SEMANAS_LISTA = 9;

const sumarDias = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

export interface AsignacionSemana {
  /** Lunes de la semana, «yyyy-MM-dd»: la llave de los suplentes. */
  semana: string;
  /** Día en que se dan: el lunes, o el martes siguiente si el lunes es asueto. */
  dia: Date;
  /** Según la rotación. */
  original: string;
  /** Suplente elegido, si lo hay. */
  suplente: string | null;
  /** Quien da las buenas noticias: el suplente o, si no hay, el original. */
  asignado: string;
}

/** Quién toca el lunes dado, según la rotación (también hacia atrás, por si se consulta antes del ancla). */
export function nombreDeRotacion(lunes: Date): string {
  const semanas = Math.round((lunes.getTime() - ANCLA.getTime()) / (7 * 86400000));
  const n = NOMBRES_BUENAS_NOTICIAS.length;
  return NOMBRES_BUENAS_NOTICIAS[((semanas % n) + n) % n];
}

/** El martes siguiente al lunes con asueto (si ese martes también lo es, el siguiente día hábil). */
export function diaDeBuenasNoticias(lunes: Date): Date {
  if (!isHoliday(lunes)) return lunes;
  let d = sumarDias(lunes, 1);
  while (isHoliday(d) || d.getDay() === 0 || d.getDay() === 6) d = sumarDias(d, 1);
  return d;
}

/** La semana de `lunes`, con su suplente (si lo hay). */
export function asignacionDeSemana(lunes: Date, suplentes: Record<string, string>): AsignacionSemana {
  const semana = ymd(lunes);
  const original = nombreDeRotacion(lunes);
  const suplente = suplentes[semana] && suplentes[semana] !== original ? suplentes[semana] : null;
  return { semana, dia: diaDeBuenasNoticias(lunes), original, suplente, asignado: suplente ?? original };
}

/** La semana actual y las próximas 8 — se renueva sola al avanzar el calendario. */
export function listaDeSemanas(hoy: Date, suplentes: Record<string, string>): AsignacionSemana[] {
  const lunes = mondayOfWeek(hoy);
  return Array.from({ length: SEMANAS_LISTA }, (_, i) => asignacionDeSemana(sumarDias(lunes, 7 * i), suplentes));
}

/** El nombre que se ve HOY en la portada: solo el viernes previo a la semana y el día en que se dan; el resto, nada. */
export function nombreVisibleHoy(hoy: Date, suplentes: Record<string, string>): string | null {
  const h = new Date(hoy); h.setHours(0, 0, 0, 0);
  const lunes = mondayOfWeek(h);
  const esta = asignacionDeSemana(lunes, suplentes);
  if (ymd(h) === ymd(esta.dia)) return esta.asignado;
  // El viernes previo: ya se ve quién da las buenas noticias de la semana que sigue.
  if (h.getDay() === 5) return asignacionDeSemana(sumarDias(lunes, 7), suplentes).asignado;
  return null;
}
