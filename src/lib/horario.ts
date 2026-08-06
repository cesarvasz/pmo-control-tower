// src/lib/horario.ts
// Tiempo en HORARIO HÁBIL (no calendario) para el reporte de tiempos de trámites.
// Módulo PURO (cliente + servidor), sin dependencias.
//
// Jornada:
//   · Lunes a jueves  08:00–13:00 y 14:00–18:00  (9 h)
//   · Viernes         08:00–13:00 y 14:00–17:00  (8 h)
//   · Sábado y domingo no cuentan
//   · La hora de almuerzo (13:00–14:00) queda fuera por construcción: son dos
//     tramos separados, no un rango continuo que luego se descuenta.
//
// NOTA: a diferencia de businessDays() en lib/business.ts, aquí NO se descuentan
// los asuetos oficiales de Guatemala. La definición de negocio de este reporte
// solo contempla fin de semana; agregarlos cambiaría los tiempos publicados. Si
// alguna vez se quieren incluir, es el único punto a tocar (ver TRAMOS/esHabil).

/** Tramos hábiles por día de la semana (0=domingo … 6=sábado), en horas locales. */
const TRAMOS: Record<number, [number, number][]> = {
  1: [[8, 13], [14, 18]], // lunes
  2: [[8, 13], [14, 18]], // martes
  3: [[8, 13], [14, 18]], // miércoles
  4: [[8, 13], [14, 18]], // jueves
  5: [[8, 13], [14, 17]], // viernes
};

/** Segundos hábiles de una semana completa: 4 × 9 h + 8 h = 44 h. */
export const SEGUNDOS_SEMANA = 44 * 3600;

/** Jornada hábil de un día concreto, en segundos (0 en fin de semana). */
export function segundosJornada(diaSemana: number): number {
  const tramos = TRAMOS[diaSemana];
  if (!tramos) return 0;
  return tramos.reduce((s, [a, b]) => s + (b - a) * 3600, 0);
}

const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Solape en segundos entre [ini, fin] y los tramos hábiles del día `dia`. */
function segundosDelDia(dia: Date, ini: Date, fin: Date): number {
  const tramos = TRAMOS[dia.getDay()];
  if (!tramos) return 0;
  let total = 0;
  for (const [h1, h2] of tramos) {
    const desde = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h1).getTime();
    const hasta = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h2).getTime();
    const lo = Math.max(desde, ini.getTime());
    const hi = Math.min(hasta, fin.getTime());
    if (hi > lo) total += (hi - lo) / 1000;
  }
  return total;
}

/**
 * Segundos de horario hábil transcurridos entre `inicio` y `fin`.
 *
 * Devuelve 0 si falta alguna fecha, si son inválidas o si `fin` es anterior o
 * igual a `inicio`. NO trunca: un tramo de meses devuelve cientos de horas.
 */
export function segundosHabiles(inicio: Date | null | undefined, fin: Date | null | undefined): number {
  if (!(inicio instanceof Date) || !(fin instanceof Date)) return 0;
  if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) return 0;
  if (fin.getTime() <= inicio.getTime()) return 0;

  let total = 0;
  const cursor = inicioDelDia(inicio);
  const ultimoDia = inicioDelDia(fin);

  while (cursor.getTime() <= ultimoDia.getTime()) {
    // Atajo: desde un lunes cuyo día completo ya está dentro del rango y con al
    // menos 7 días por delante, la semana entera aporta 44 h sin recorrerla.
    if (cursor.getDay() === 1 && cursor.getTime() >= inicio.getTime()) {
      const finSemana = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
      if (finSemana.getTime() <= ultimoDia.getTime()) {
        total += SEGUNDOS_SEMANA;
        cursor.setDate(cursor.getDate() + 7);
        continue;
      }
    }
    total += segundosDelDia(cursor, inicio, fin);
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.round(total);
}

/**
 * Formatea segundos como `hh:mm:ss`. Las horas NO tienen tope: pueden pasar de
 * 24 (ej. 237:56:05). null/undefined → "—".
 */
export function fmtHHMMSS(segundos: number | null | undefined): string {
  if (segundos == null || !isFinite(segundos)) return "—";
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const dd = (n: number) => String(n).padStart(2, "0");
  return `${dd(h)}:${dd(m)}:${dd(sec)}`;
}

/** Equivalente en DÍAS hábiles, tomando la jornada media de 8.8 h (44 h / 5 días). */
export const SEGUNDOS_DIA_HABIL = SEGUNDOS_SEMANA / 5;

/** Segundos → días hábiles con un decimal (ej. 40:06:53 → 4.6 d). */
export function enDiasHabiles(segundos: number | null | undefined): number | null {
  if (segundos == null || !isFinite(segundos)) return null;
  return segundos / SEGUNDOS_DIA_HABIL;
}

/** Segundos → horas con un decimal (para carga y capacidad). */
export const enHoras = (segundos: number) => segundos / 3600;
