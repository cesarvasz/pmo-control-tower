// Formateadores del reporte "Digitalización OCR". Mismo lenguaje que el resto
// de la app (es-GT, tabular-nums en la UI).

/** Segundos → "hh:mm:ss" (sin tope de horas). Mismo formato que el resto de
 *  ROI (ver lib/tramites.ts) — es solo presentación, no depende de la ventana
 *  hábil de ningún reporte, así que se reutiliza tal cual. */
export { fmtHHMMSS } from "@/lib/horario";

export const pct1 = (x: number): string => `${(x * 100).toFixed(1)}%`;

/** Costo tal cual viene de la hoja (sin tarifa editable en la app): "$2.50". */
export const usdExacto = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const nEs = (n: number): string => n.toLocaleString("es-GT");

/** Etiqueta de eje de tiempo en pasos de reloj: 45 → "45 min", 120 → "2 h". */
export const etiquetaReloj = (min: number): string =>
  min < 60 ? `${min} min`
    : min % 60 === 0 ? `${min / 60} h`
      : `${Math.floor(min / 60)}h ${min % 60}m`;

export const fmtFecha = (d: Date | null): string =>
  d ? `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}` : "—";

/** Fecha + hora de pared (UTC): "05/01/2026 14:30". */
export const fmtFechaHora = (d: Date | null): string =>
  d
    ? `${fmtFecha(d)} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
    : "—";
