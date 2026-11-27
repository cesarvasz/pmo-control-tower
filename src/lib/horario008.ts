// src/lib/horario008.ts
// Horas hábiles y lectura de fechas del análisis de tiempos ROI 008 (Ducafast SV).
// Módulo PURO (cliente + servidor), sin dependencias.
//
// Jornada: lunes a viernes de 08:00 a 18:00 CORRIDO = 10 h por día. No se
// descuenta almuerzo ni asuetos; sábado y domingo no cuentan.
//
// OJO: es un horario DISTINTO al de lib/horario.ts (003: L–J 8–13 y 14–18,
// viernes hasta las 17:00). No se reutiliza aquel a propósito: mezclar los dos
// cambiaría los tiempos publicados de uno u otro reporte.
//
// ── Cómo se representa una fecha ────────────────────────────────────────────
// Toda fecha es un número: SEGUNDOS de "hora de pared" desde 1970-01-01 00:00,
// contados como si la hora de la hoja fuera UTC. No es un instante real: es la
// hora tal como se lee en la hoja (Guatemala), sin zona horaria. Así ningún
// navegador ni servidor la corre al convertirla, y los cálculos de día de la
// semana y hora del día salen directos de dividir entre 86 400.

/** Hora (local) en que empieza y termina la jornada. */
export const HORA_INICIO = 8;
export const HORA_FIN = 18;
/** Segundos hábiles de un día laborable: 10 h. */
export const SEGUNDOS_JORNADA = (HORA_FIN - HORA_INICIO) * 3600;

const DIA = 86_400;
/** Días de 1899-12-30 (día 0 de Sheets/Excel) a 1970-01-01. */
const SERIE_1970 = 25_569;
/** 1970-01-05 fue lunes: día 4 desde la base. */
const PRIMER_LUNES = 4;

/** Hora de pared → segundos (mes 1–12). Útil para pruebas y para armar fechas a mano. */
export function fechaPared(y: number, m: number, d: number, h = 0, mi = 0, s = 0): number {
  return Date.UTC(y, m - 1, d, h, mi, s) / 1000;
}

/**
 * F(t): segundos hábiles acumulados desde la base (lunes 1970-01-05) hasta t.
 *
 *   F(t) = díasHábilesCompletosAntesDe(fecha(t)) × 36 000
 *        + (esDíaHábil(fecha(t)) ? clamp(segundosDelDía(t) − 8 h, 0, 10 h) : 0)
 *
 * Una marca fuera de horario queda en el siguiente momento hábil (antes de las
 * 8:00 o en fin de semana) o en el último (después de las 18:00), sin ningún
 * caso especial: lo hace el clamp. Exacto y O(1), sin recorrer días.
 */
export function segundosHabilesAcumulados(t: number): number {
  const dia = Math.floor(t / DIA);
  const segDelDia = t - dia * DIA;
  const k = dia - PRIMER_LUNES;
  const semanas = Math.floor(k / 7);
  const diaSemana = k - semanas * 7; // 0 = lunes … 6 = domingo
  const habilesAntes = semanas * 5 + Math.min(diaSemana, 5);
  const hoy = diaSemana < 5
    ? Math.min(Math.max(segDelDia - HORA_INICIO * 3600, 0), SEGUNDOS_JORNADA)
    : 0;
  return habilesAntes * SEGUNDOS_JORNADA + hoy;
}

/** Tiempo hábil (segundos enteros) entre a y b = F(b) − F(a). Negativo si b < a. */
export function segundosHabilesEntre(a: number, b: number): number {
  return Math.round(segundosHabilesAcumulados(b) - segundosHabilesAcumulados(a));
}

// ── Lectura de fechas ─────────────────────────────────────────────────────

const RE_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?/;
const RE_DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
const RE_NUM = /^\d+(?:\.\d+)?$/;

function desdeSerie(n: number): number | null {
  // Rango sensato: de 1900 a 9999. Fuera de eso no es una fecha.
  if (!isFinite(n) || n <= 0 || n > 2_958_465) return null;
  return Math.round((n - SERIE_1970) * DIA);
}

function valida(y: number, m: number, d: number, h: number, mi: number, s: number): number | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  return fechaPared(y, m, d, h, mi, s);
}

/**
 * Celda de fecha → segundos de hora de pared (ver arriba), o null si está vacía
 * o no se entiende. Acepta:
 *   · texto: "2026-01-01 23:59:16", "2026-01-01T23:59:16", "01/01/2026 23:59:16"
 *     (día primero, como se escribe en Guatemala); un sufijo de zona ("Z",
 *     "-06:00") se ignora — vale la hora tal como está escrita;
 *   · objeto Date: se toman sus componentes locales, sin convertir a UTC;
 *   · número de serie de Sheets/Excel (días desde 1899-12-30; también como texto):
 *     46352.626748 = 2026-11-26 15:02:31.
 * Redondea al segundo.
 */
export function leerFecha(v: unknown): number | null {
  if (v == null) return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return fechaPared(v.getFullYear(), v.getMonth() + 1, v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds());
  }
  if (typeof v === "number") return desdeSerie(v);

  const s = String(v).trim();
  if (!s) return null;
  if (RE_NUM.test(s)) return desdeSerie(parseFloat(s));
  let m = s.match(RE_ISO);
  if (m) return valida(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  m = s.match(RE_DMY);
  if (m) return valida(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return null;
}

// ── Formato ───────────────────────────────────────────────────────────────

const dd = (n: number) => String(n).padStart(2, "0");

/**
 * Segundos → "hh:mm:ss". Las horas no tienen tope (942:22:16) y los negativos
 * llevan signo menos (−255:29:10). null → "—".
 */
export function fmtHabil(segundos: number | null | undefined): string {
  if (segundos == null || !isFinite(segundos)) return "—";
  const r = Math.round(segundos);
  const s = Math.abs(r);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${r < 0 ? "−" : ""}${dd(h)}:${dd(m)}:${dd(s % 60)}`;
}

/** Componentes de una fecha de pared (mes 1–12; diaSemana 0 = domingo). */
export function partesFecha(t: number) {
  const d = new Date(t * 1000);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), diaSemana: d.getUTCDay(),
  };
}

/** "yyyy-mm-dd hh:mm" (con segundos si se pide). null → "—". */
export function fmtFechaHora(t: number | null | undefined, conSegundos = false): string {
  if (t == null) return "—";
  const p = partesFecha(t);
  return `${p.y}-${dd(p.m)}-${dd(p.d)} ${dd(p.h)}:${dd(p.mi)}${conSegundos ? `:${dd(p.s)}` : ""}`;
}

/** Clave de mes "yyyy-MM" de una fecha de pared. */
export function claveMes(t: number): string {
  const p = partesFecha(t);
  return `${p.y}-${dd(p.m)}`;
}
