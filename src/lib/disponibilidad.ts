// src/lib/disponibilidad.ts
// Módulo PURO. Sugiere huecos para una reunión: de lunes a viernes, sin asuetos, de 8:00 a 18:00 hora de Guatemala (UTC-6 todo el
// año, sin horario de verano), en los que NADIE de los consultados está ocupado. No toca red: recibe los intervalos ocupados.

export const VENTANA = { desde: 8, hasta: 18 } as const;
/** Guatemala = UTC-6 fijo. */
const OFFSET = "-06:00";
const MIN = 60_000;

export interface Intervalo { inicio: string; fin: string }

export interface OpcionesHuecos {
  /** yyyy-mm-dd (día de Guatemala), ambos incluidos. */
  desde: string;
  hasta: string;
  duracionMin: number;
  /** Intervalos ocupados de todas las personas (pueden solaparse). */
  ocupados: Intervalo[];
  /** yyyy-mm-dd de asuetos. */
  asuetos: ReadonlySet<string>;
  /** Cada cuántos minutos puede empezar un hueco (por defecto 30). */
  pasoMin?: number;
  /** Nunca se sugiere nada que empiece antes (ms). Por defecto, ahora. */
  ahoraMs?: number;
  /** Tope de huecos devueltos (por defecto 40). */
  max?: number;
}

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
/** El instante (ms) de una hora local de Guatemala en ese día. */
const aMs = (dia: string, hora: number, min = 0) => Date.parse(`${dia}T${String(hora).padStart(2, "0")}:${String(min).padStart(2, "0")}:00${OFFSET}`);
const sumarDia = (dia: string) => new Date(Date.parse(`${dia}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
/** 0 = domingo … 6 = sábado, del día calendario (no depende de la zona del servidor). */
const diaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay();

/** Días laborales (lun–vie, sin asuetos) del rango; vacío si el rango es inválido. Máximo 62 días por seguridad. */
export function diasLaborales(desde: string, hasta: string, asuetos: ReadonlySet<string>): string[] {
  if (!DIA_RE.test(desde) || !DIA_RE.test(hasta) || desde > hasta) return [];
  const dias: string[] = [];
  for (let d = desde, n = 0; d <= hasta && n < 62; d = sumarDia(d), n++) {
    const s = diaSemana(d);
    if (s !== 0 && s !== 6 && !asuetos.has(d)) dias.push(d);
  }
  return dias;
}

/** Une los intervalos solapados o pegados, en ms y ordenados. */
export function unirOcupados(ocupados: Intervalo[]): [number, number][] {
  const v = ocupados
    .map((o) => [Date.parse(o.inicio), Date.parse(o.fin)] as [number, number])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const [a, b] of v) {
    const ult = out[out.length - 1];
    if (ult && a <= ult[1]) ult[1] = Math.max(ult[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Los huecos libres, en orden cronológico, como ISO UTC. */
export function huecosLibres(o: OpcionesHuecos): Intervalo[] {
  const paso = (o.pasoMin ?? 30) * MIN, dur = o.duracionMin * MIN, max = o.max ?? 40, ahora = o.ahoraMs ?? Date.now();
  if (!(dur > 0) || !(paso > 0)) return [];
  const ocupado = unirOcupados(o.ocupados);
  const huecos: Intervalo[] = [];
  for (const dia of diasLaborales(o.desde, o.hasta, o.asuetos)) {
    const abre = aMs(dia, VENTANA.desde), cierra = aMs(dia, VENTANA.hasta);
    for (let ini = abre; ini + dur <= cierra; ini += paso) {
      if (ini < ahora) continue;
      const fin = ini + dur;
      if (ocupado.some(([a, b]) => a < fin && b > ini)) continue;
      huecos.push({ inicio: new Date(ini).toISOString(), fin: new Date(fin).toISOString() });
      if (huecos.length >= max) return huecos;
    }
  }
  return huecos;
}

/** Años de un rango de los que NO se conocen asuetos (para avisar que la sugerencia puede incluir un feriado). */
export function añosSinAsuetos(desde: string, hasta: string, asuetos: ReadonlySet<string>): number[] {
  const conocidos = new Set([...asuetos].map((a) => Number(a.slice(0, 4))));
  const años: number[] = [];
  for (let a = Number(desde.slice(0, 4)); a <= Number(hasta.slice(0, 4)); a++) if (!conocidos.has(a)) años.push(a);
  return años;
}

// ── Agenda de un día por persona (para pintarla en el panel de Agendar) ──────

/** Ventana que se dibuja: un poco más amplia que la de sugerencias, para ver lo que queda justo antes o después. */
export const VENTANA_DIA = { desde: 7, hasta: 19 } as const;

/** Minutos desde la medianoche de Guatemala del día `dia` (yyyy-mm-dd) hasta el instante ISO. */
export function minutosDelDia(dia: string, iso: string): number {
  return (Date.parse(iso) - Date.parse(`${dia}T00:00:00${OFFSET}`)) / MIN;
}

/** Lo ocupado de UNA persona dentro de la ventana del día, en minutos [inicio, fin), unido y recortado. */
export function bloquesDelDia(dia: string, ocupados: Intervalo[], ventana: { desde: number; hasta: number } = VENTANA_DIA): [number, number][] {
  const a = ventana.desde * 60, b = ventana.hasta * 60, base = Date.parse(`${dia}T00:00:00${OFFSET}`);
  return unirOcupados(ocupados)
    .map(([i, f]): [number, number] => [Math.max(a, (i - base) / MIN), Math.min(b, (f - base) / MIN)])
    .filter(([i, f]) => f > i);
}

/** ¿El horario elegido [desde, hasta) en minutos choca con algún bloque ocupado? */
export function chocaCon(bloques: [number, number][], desde: number, hasta: number): boolean {
  return bloques.some(([i, f]) => i < hasta && f > desde);
}
