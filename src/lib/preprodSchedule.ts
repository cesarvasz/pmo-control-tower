// src/lib/preprodSchedule.ts
// Calendario de restauraciones de Pre-producción (banner del Control Tower):
// ocurren cada PREPROD_INTERVAL_BUSINESS_DAYS días HÁBILES (lun-vie; los
// asuetos NO se excluyen, cuentan como día hábil normal para este cálculo —
// a diferencia del countdown del banner, que sí los excluye).
// ensurePreprodSchedule() completa el futuro hasta tener siempre
// PREPROD_FUTURE_COUNT fechas por delante de `today` y recorta el pasado a
// las PREPROD_HISTORY_COUNT más recientes — se llama en cada GET de
// /api/preprod-restore-dates, así la ventana se desliza sola con el tiempo
// sin necesidad de un cron.

import { parseYMD, ymd, addBusinessDays } from "@/lib/business";

export const PREPROD_INTERVAL_BUSINESS_DAYS = 14;
export const PREPROD_FUTURE_COUNT = 5;
export const PREPROD_HISTORY_COUNT = 3;

/**
 * Completa el futuro y recorta el histórico de un calendario de fechas
 * "YYYY-MM-DD", encadenando cada PREPROD_INTERVAL_BUSINESS_DAYS días hábiles
 * (asuetos incluidos como hábiles, sin saltarlos) desde la última fecha
 * conocida.
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
    const next = addBusinessDays(last, PREPROD_INTERVAL_BUSINESS_DAYS, false);
    last = next;
    if (next.getTime() >= todayMs) future.push(next);
  }

  return [...past, ...future].sort((a, b) => a.getTime() - b.getTime()).map(ymd);
}
