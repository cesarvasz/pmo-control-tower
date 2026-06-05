// src/lib/business.ts
// Helpers de fechas puros, extraídos del PMO Dashboard original.
// Sin dependencias del navegador salvo Date/Intl → seguros en cliente y servidor.

/** Cuenta días hábiles (lun–vie) ENTRE start y end, excluyendo el día start. */
export function businessDays(start: Date, end: Date): number {
  let days = 0;
  const d = new Date(start);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  while (d <= e) {
    if (d.getDay() !== 0 && d.getDay() !== 6) days++;
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** Suma (o resta si n<0) n días hábiles a una fecha y devuelve la fecha resultante. */
export function addBusinessDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (n === 0) return d;
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    d.setDate(d.getDate() + step);
    if (d.getDay() !== 0 && d.getDay() !== 6) remaining--;
  }
  return d;
}

/** Formatea una fecha como "02 jun 2026" (es-GT). null → "—". */
export function fmtDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleDateString("es-GT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** ¿La fecha cae hoy (comparando solo el día)? */
export function isToday(date: Date | null | undefined): boolean {
  if (!date) return false;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime() === t.getTime();
}

/** Devuelve "hoy" normalizado a medianoche local. */
export function today(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

/** Parsea "YYYY-MM-DD..." (o con timeline "YYYY-MM-DD - YYYY-MM-DD") → Date local. */
export function parseYMD(s: string | null | undefined): Date | null {
  if (!s || !s.trim()) return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

/** Parsea el formato de columna "pulse_log" (creación), ej "2026-01-08 17:17:16 UTC". */
export function parseCreation(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(/\s*UTC\s*$/, "").replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

/** Formatea un número como moneda USD entera. 0/null → "—". */
export function fmtMoney(n: number | null | undefined): string {
  if (!n) return "—";
  return (
    "$" +
    n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  );
}
