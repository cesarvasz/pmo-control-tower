// Formateadores del reporte "Digitalización OCR". Mismo lenguaje que el resto
// de la app (es-GT, tabular-nums en la UI).

/** Segundos → minutos con 2 decimales: "82.57 min". */
export const fmtMin = (seg: number | null | undefined): string =>
  seg == null || !isFinite(seg) ? "—" : `${(seg / 60).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} min`;

/** Segundos → horas con 2 decimales: "1,665.24 h". */
export const fmtHoras = (seg: number | null | undefined): string =>
  seg == null || !isFinite(seg) ? "—" : `${(seg / 3600).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;

/** Segundos → la escala que mejor se lee (min hasta 1 h, luego h). */
export const fmtDur = (seg: number | null | undefined): string => {
  if (seg == null || !isFinite(seg)) return "—";
  return seg < 3600 ? fmtMin(seg) : fmtHoras(seg);
};

export const pct1 = (x: number): string => `${(x * 100).toFixed(1)}%`;

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
