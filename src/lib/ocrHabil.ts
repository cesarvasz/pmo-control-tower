// src/lib/ocrHabil.ts
// Ventana HÁBIL de la pestaña "Digitalización OCR" (009). Módulo PURO
// (cliente + servidor), sin dependencias.
//
// ⚠️ Esta ventana es DISTINTA a la de horario.ts (003 / trámites) y a la de
// clonaciones.ts. NO la unifiques con ellas: es la ventana operativa de la
// digitalización OCR, con la que T1 y T2 se miden.
//
//   · Lunes a viernes 08:00–18:00 CORRIDO (sin descontar almuerzo)
//   · Sábado y domingo no cuentan
//
// Implementación: las fechas se manejan como RELOJ DE PARED en segundos enteros
// desde una época fija (Date.UTC de los componentes locales, igual que roi.ts).
// No se reconvierte a zona horaria en ningún punto: hacerlo correría los cortes
// de 08:00 y 18:00 y metería errores de horas. Toda la aritmética de día y hora
// es con enteros.

const DIA = 86_400;
const HORA = 3_600;
export const HABIL_DESDE_SEG = 8 * HORA;  // 08:00
export const HABIL_HASTA_SEG = 18 * HORA; // 18:00
/** Segundos hábiles de un día laboral completo: 10 h. */
export const SEG_JORNADA = HABIL_HASTA_SEG - HABIL_DESDE_SEG;

/** "yyyy-MM-ddTHH:mm:ss" o "yyyy-MM-dd HH:mm:ss" → segundos de reloj de pared
 *  desde 1970-01-01 (vía Date.UTC de los componentes). null si no parsea. */
export function segDeFecha(s: unknown): number | null {
  const raw = String(s ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return Number.isFinite(t) ? Math.round(t / 1000) : null;
}

/** Día de la semana de un instante en segundos: 0=domingo … 6=sábado.
 *  1970-01-01 (día 0) fue jueves → offset 4. */
export function diaSemana(seg: number): number {
  const dias = Math.floor(seg / DIA);
  return ((dias % 7) + 7 + 4) % 7;
}

const esFinDeSemana = (dow: number) => dow === 0 || dow === 6;

export type Segmento = [number, number];

/**
 * Recorta [inicio, fin] a la ventana hábil y devuelve la lista de segmentos
 * hábiles, uno por día laboral que toque. Exactamente el pseudocódigo del prompt:
 *
 *   para cada día d desde inicio.día hasta fin.día:
 *     si d es sábado o domingo: continuar
 *     lo = max(inicio, d 08:00);  hi = min(fin, d 18:00)
 *     si hi > lo: emitir [lo, hi]
 */
export function segmentosHabiles(inicio: number, fin: number): Segmento[] {
  if (!(fin > inicio)) return [];
  const out: Segmento[] = [];
  const primerDia = Math.floor(inicio / DIA) * DIA;
  const ultimoDia = Math.floor(fin / DIA) * DIA;
  for (let d = primerDia; d <= ultimoDia; d += DIA) {
    if (esFinDeSemana(diaSemana(d))) continue;
    const lo = Math.max(inicio, d + HABIL_DESDE_SEG);
    const hi = Math.min(fin, d + HABIL_HASTA_SEG);
    if (hi > lo) out.push([lo, hi]);
  }
  return out;
}

/** Duración total de una lista de segmentos, en segundos. */
export function duracion(segs: Segmento[]): number {
  return segs.reduce((s, [a, b]) => s + (b - a), 0);
}

/** Fusiona los segmentos que se tocan o solapan. Devuelve bloques disjuntos
 *  ordenados por inicio. */
export function unir(segs: Segmento[]): Segmento[] {
  if (segs.length === 0) return [];
  const orden = [...segs].sort((a, b) => a[0] - b[0]);
  const out: Segmento[] = [[...orden[0]] as Segmento];
  for (let i = 1; i < orden.length; i++) {
    const ult = out[out.length - 1];
    const [lo, hi] = orden[i];
    if (lo <= ult[1]) { if (hi > ult[1]) ult[1] = hi; }
    else out.push([lo, hi]);
  }
  return out;
}

/** Segundos cubiertos por la unión de una lista de segmentos — cada instante
 *  contado una sola vez. */
export function segundosDeUnion(segs: Segmento[]): number {
  return duracion(unir(segs));
}

// ── Escala de eje en "pasos de reloj" ────────────────────────────────────
// Para los ejes de tiempo de las gráficas: 5, 10, 15, 30 min, 1 h, 2 h, 4 h, 8 h…
// en vez de pasos decimales, para que no salgan etiquetas repetidas.
const ESCALERA_MIN = [1, 2, 5, 10, 15, 30, 60, 120, 240, 480, 720, 1440, 2880, 5760, 11520];

/** Paso de reloj (en minutos) para cubrir `maxMin` en ~`objetivo` marcas. */
export function pasoDeReloj(maxMin: number, objetivo = 6): number {
  if (!(maxMin > 0)) return 5;
  for (const paso of ESCALERA_MIN) {
    if (maxMin / paso <= objetivo) return paso;
  }
  return ESCALERA_MIN[ESCALERA_MIN.length - 1];
}

/** Marcas de eje (en minutos) desde 0 hasta cubrir `maxMin`, en pasos de reloj. */
export function marcasDeReloj(maxMin: number, objetivo = 6): number[] {
  const paso = pasoDeReloj(maxMin, objetivo);
  const out: number[] = [];
  for (let v = 0; v <= maxMin + paso * 0.001; v += paso) out.push(Math.round(v));
  return out;
}
