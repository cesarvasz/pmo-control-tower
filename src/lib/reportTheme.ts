// src/lib/reportTheme.ts
// Paleta y reglas FIJAS del "Status Ejecutivo PMO" (metodología VALOR) —
// única fuente de verdad del diseño del reporte por proyecto, compartida por
// el PDF descargable (components/ProjectPdfReport.tsx) y la vista de detalle
// en pantalla (app/(app)/resumen-ejecutivo/page.tsx).
//
// Son colores LITERALES (no variables CSS del tema): un reporte que se
// descarga/imprime debe verse igual con tema claro u oscuro, y html2canvas no
// resuelve bien las custom properties. La vista en pantalla del reporte usa
// esta misma paleta a propósito, para que PDF y pantalla sean idénticos.
//
// Espejo exacto de las constantes de la skill `status-pdf`
// (.claude/skills/status-pdf/generate_pmo_status.py). Cualquier cambio de
// color debe hacerse en ambos lados.

export const GOOD = "#0ca30c";
export const GOOD_BG = "#e6f6e6";
export const WARNING = "#c98500";
export const WARNING_FILL = "#fab219";
export const WARNING_BG = "#fef3dc";
export const CRITICAL = "#d03b3b";
export const CRITICAL_BG = "#fbe9e9";
export const NEUTRAL = "#898781";
export const NEUTRAL_BG = "#eeede9";
export const NEUTRAL_LINE = "#c3c2b7";
export const INK = "#14140f";
export const INK_SEC = "#52514e";
export const INK_MUTED = "#898781";
export const GRID = "#e1e0d9";
export const SURFACE = "#ffffff";
export const CARD_BG = "#fbfbfa";
export const NAVY = "#132a3a";
export const BLUE = "#2a78d6";
export const VIOLET = "#4a3aa7";

/** Tono semántico de una tarjeta/celda del reporte. */
export type Tone = "good" | "warn" | "crit" | "neutral";

/** Color de trazo (`fg`) y de fondo tenue (`bg`) por tono — el `TONE_MAP` de
 *  la skill. Cada KPI del reporte se pinta con el `bg` de su tono. */
export const TONE: Record<Tone, { fg: string; bg: string }> = {
  good: { fg: GOOD, bg: GOOD_BG },
  warn: { fg: WARNING, bg: WARNING_BG },
  crit: { fg: CRITICAL, bg: CRITICAL_BG },
  neutral: { fg: INK, bg: "#f1f1ee" },
};

/** Semáforo FIJO del SPI (Avance real / Avance plan): rojo < 0.80,
 *  amarillo 0.80–0.89, verde ≥ 0.90. `null` (sin plan) → neutral. */
export function spiTone(spi: number | null | undefined): Tone {
  if (spi == null) return "neutral";
  if (spi < 0.8) return "crit";
  if (spi < 0.9) return "warn";
  return "good";
}

/** Color del chip de banda V/A/L/O/R en las filas de fase del Gantt. */
export const BAND_COLOR: Record<"V" | "A" | "L" | "O" | "R", string> = {
  V: GOOD,
  A: WARNING_FILL,
  L: CRITICAL,
  O: NEUTRAL,
  R: NEUTRAL,
};

/** Paleta categórica para "Distribución de responsabilidad" — "Sin asignar"
 *  siempre gris (se resuelve en el consumidor); el resto cicla estos tonos. */
export const ROLE_PALETTE = [VIOLET, BLUE, "#8b5cf6", "#0ea5e9", "#ec4899", "#14b8a6"];

/** Rayo del encabezado (mismo path que la skill), relleno ámbar. */
export const BOLT_PATH = "M13 2 4 14h6l-1 8 9-12h-6l1-8z";
