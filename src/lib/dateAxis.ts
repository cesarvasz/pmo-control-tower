// src/lib/dateAxis.ts
// Eje de tiempo mensual compartido por las vistas tipo Gantt del Resumen
// Ejecutivo (PhaseTimeline en pantalla y ProjectPdfReport en el PDF) — puro,
// sin dependencias de React.
export const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const addMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1);

export interface MonthTick { date: Date; label: string }

export function monthTicks(min: Date, max: Date): MonthTick[] {
  const ticks: MonthTick[] = [];
  for (let d = startOfMonth(min); d <= max; d = addMonth(d)) {
    ticks.push({ date: new Date(d), label: `${MONTHS_ES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` });
  }
  return ticks;
}
