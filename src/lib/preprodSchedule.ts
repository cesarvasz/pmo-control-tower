// src/lib/preprodSchedule.ts
// Calendario de restauraciones de Pre-producción (banner del Control Tower):
// ocurren cada PREPROD_INTERVAL_DAYS días CALENDARIO — en la práctica,
// "sábado sí, sábado no" (confirmado contra las 2 fechas reales: 24-oct-2026
// y 07-nov-2026, ambas sábado, 14 días calendario exactos entre sí). Usar un
// conteo de días HÁBILES aquí (como se probó antes) rompe ese patrón: 14 días
// hábiles no son 2 semanas exactas, así que la fecha calculada se va
// corriendo de sábado a jueves, miércoles, etc. ensurePreprodSchedule()
// completa el futuro hasta tener siempre PREPROD_FUTURE_COUNT fechas por
// delante de `today` y recorta el pasado a las PREPROD_HISTORY_COUNT más
// recientes — se llama en cada GET de /api/preprod-restore-dates, así la
// ventana se desliza sola con el tiempo sin necesidad de un cron.

import { parseYMD, ymd } from "@/lib/business";

export const PREPROD_INTERVAL_DAYS = 14;
export const PREPROD_FUTURE_COUNT = 5;
export const PREPROD_HISTORY_COUNT = 3;

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Completa el futuro y recorta el histórico de un calendario de fechas
 * "YYYY-MM-DD", encadenando cada PREPROD_INTERVAL_DAYS días calendario (2
 * semanas exactas → mismo día de la semana) desde la última fecha conocida.
 */
export function ensurePreprodSchedule(dates: string[], today: Date): string[] {
  const parsed = [...new Set(dates)]
    .map((d) => parseYMD(d))
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime());

  const todayMs = today.getTime();
  const future = parsed.filter((d) => d.getTime() >= todayMs);
  const past = parsed.filter((d) => d.getTime() < todayMs).slice(-PREPROD_HISTORY_COUNT);

  // Encadena desde la última fecha conocida (o `today` si no hay ninguna).
  // Un ciclo que ya quedó en el pasado sin registrarse (p. ej. nadie agregó
  // la fecha a tiempo) solo avanza el ancla — no se fabrica histórico que
  // nunca existió, se sigue encadenando hasta llegar al futuro real.
  let last = parsed[parsed.length - 1] ?? today;
  while (future.length < PREPROD_FUTURE_COUNT) {
    const next = addDays(last, PREPROD_INTERVAL_DAYS);
    last = next;
    if (next.getTime() >= todayMs) future.push(next);
  }

  return [...past, ...future].sort((a, b) => a.getTime() - b.getTime()).map(ymd);
}
