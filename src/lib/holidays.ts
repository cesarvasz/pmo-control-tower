// src/lib/holidays.ts
// Asuetos oficiales de Guatemala — fuente única para el modal (AsuetosModal)
// y para los cálculos de días hábiles, que deben excluir estos días.

export interface Asueto {
  date: string;   // ISO yyyy-mm-dd
  name: string;
  note?: string;  // p. ej. "Medio día" o "Semana Santa"
}

// Asuetos 2026 (Art. 127 del Código de Trabajo + Día de la Madre + fiesta
// patronal de la Ciudad de Guatemala). Semana Santa: Pascua 2026 = 5 abr.
// El Día del Ejército se trasladó del 30 al 29 de junio en 2026.
export const ASUETOS_2026: Asueto[] = [
  { date: "2026-01-01", name: "Año Nuevo" },
  { date: "2026-04-02", name: "Jueves Santo", note: "Semana Santa" },
  { date: "2026-04-03", name: "Viernes Santo", note: "Semana Santa" },
  { date: "2026-04-04", name: "Sábado Santo", note: "Semana Santa" },
  { date: "2026-05-01", name: "Día del Trabajo" },
  { date: "2026-05-10", name: "Día de la Madre" },
  { date: "2026-06-29", name: "Día del Ejército", note: "Trasladado del 30 jun" },
  { date: "2026-08-15", name: "Día de la Asunción", note: "Fiesta patronal · Ciudad de Guatemala" },
  { date: "2026-09-15", name: "Día de la Independencia" },
  { date: "2026-10-20", name: "Día de la Revolución" },
  { date: "2026-11-01", name: "Día de Todos los Santos" },
  { date: "2026-12-24", name: "Nochebuena", note: "A partir del mediodía" },
  { date: "2026-12-25", name: "Navidad" },
  { date: "2026-12-31", name: "Fin de Año", note: "A partir del mediodía" },
];

/** Conjunto de fechas (yyyy-mm-dd) a excluir en cálculos de días hábiles. */
export const HOLIDAY_SET: Set<string> = new Set(ASUETOS_2026.map((a) => a.date));

/** ¿La fecha (en hora local) es un asueto oficial? */
export function isHoliday(d: Date): boolean {
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return HOLIDAY_SET.has(iso);
}
