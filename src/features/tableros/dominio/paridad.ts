// Paridad de métricas: ¿un tablero de la app mide igual que su board de Monday? Compara los
// ProjItem que salen de cada lado (los mismos que usan todas las métricas) y resume las métricas
// del board. Si los ProjItem son iguales, TODO lo que se calcula con ellos también lo es. PURA.

import type { ProjItem, ProjItemBaseline, ProjSubitem } from "@/types";
import { calcBoardMetrics, deriveBoardHealth, itemsMedibles } from "@/lib/proj";
import { claveNombre } from "./personas";

/** Campos que solo sirven para escribir en Monday (no entran en ninguna métrica). */
const SOLO_MONDAY = new Set(["statusColId", "statusOptions", "statusBoardId", "email", "subitems"]);
/** Nombres de personas: Monday a veces los trae sin acentos ("Cesar"); el directorio los tiene bien. */
const NOMBRES = new Set(["resp", "responsible", "developer", "pm", "boardName"]);

function igual(campo: string, a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) return (a as Date | null)?.getTime?.() === (b as Date | null)?.getTime?.();
  if (NOMBRES.has(campo) && typeof a === "string" && typeof b === "string") return claveNombre(a) === claveNombre(b);
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
  return a === b;
}

const mostrar = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : JSON.stringify(v));

function difCampos(donde: string, a: object, b: object): string[] {
  const out: string[] = [];
  for (const [k, va] of Object.entries(a)) {
    if (SOLO_MONDAY.has(k)) continue;
    const vb = (b as Record<string, unknown>)[k];
    if (!igual(k, va, vb)) out.push(`${donde}.${k}: Monday ${mostrar(va)} ≠ app ${mostrar(vb)}`);
  }
  return out;
}

/** Diferencias entre los ProjItem de Monday y los de la app (vacío = paridad). */
export function diferenciasProjItems(monday: ProjItem[], app: ProjItem[]): string[] {
  const out: string[] = [];
  if (monday.length !== app.length) out.push(`${monday.length} elementos en Monday vs ${app.length} en la app`);
  const porId = new Map(app.map((i) => [i.id, i]));
  monday.forEach((m, idx) => {
    const a = porId.get(m.id);
    const donde = `«${m.name}»`;
    if (!a) { out.push(`${donde}: falta en la app`); return; }
    if (app[idx]?.id !== m.id) out.push(`${donde}: orden distinto`);
    out.push(...difCampos(donde, m, a));
    if (m.subitems.length !== a.subitems.length) out.push(`${donde}: ${m.subitems.length} subelementos en Monday vs ${a.subitems.length}`);
    const subPorId = new Map(a.subitems.map((s) => [s.id, s]));
    m.subitems.forEach((s: ProjSubitem, j) => {
      const sa = subPorId.get(s.id);
      const dondeSub = `${donde} › «${s.name}»`;
      if (!sa) { out.push(`${dondeSub}: falta en la app`); return; }
      if (a.subitems[j]?.id !== s.id) out.push(`${dondeSub}: orden distinto`);
      out.push(...difCampos(dondeSub, s, sa));
    });
  });
  for (const a of app) if (!monday.some((m) => m.id === a.id)) out.push(`«${a.name}»: está en la app y no en Monday`);
  return out;
}

// ── Comparación genérica (Iniciativas, PML, Estrategia) ──────────────────────

const IGNORAR = new Set(["email", "statusColId", "statusOptions", "statusBoardId"]);
const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
const vacio = (v: unknown) => v === undefined || v === null || v === "";

/** Diferencias campo por campo entre dos salidas de un procesador (fechas por valor, nombres sin
 *  acentos ni mayúsculas, números con tolerancia, vacío = null = ""). */
export function diferenciasProfundas(donde: string, a: unknown, b: unknown, out: string[] = [], max = 300): string[] {
  if (out.length >= max) return out;
  if (a instanceof Date || b instanceof Date) {
    if ((a as Date | null)?.getTime?.() !== (b as Date | null)?.getTime?.()) out.push(`${donde}: Monday ${mostrar(a)} ≠ app ${mostrar(b)}`);
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${donde}: ${a.length} en Monday vs ${b.length} en la app`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) diferenciasProfundas(`${donde}[${i}]`, a[i], b[i], out, max);
    return out;
  }
  if (esObj(a) && esObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!IGNORAR.has(k)) diferenciasProfundas(`${donde}.${k}`, a[k], b[k], out, max);
    }
    return out;
  }
  if (vacio(a) && vacio(b)) return out;
  const igualEs = typeof a === "string" && typeof b === "string" ? claveNombre(a) === claveNombre(b)
    : typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9 || (Number.isNaN(a) && Number.isNaN(b))
      : a === b;
  if (!igualEs) out.push(`${donde}: Monday ${mostrar(a)} ≠ app ${mostrar(b)}`);
  return out;
}

/** Compara dos listas de registros con id (IniItem, ReqItem…) en orden. */
export function diferenciasPorId<T extends { id: string; name?: string }>(monday: T[], app: T[]): string[] {
  const out: string[] = [];
  if (monday.length !== app.length) out.push(`${monday.length} elementos en Monday vs ${app.length} en la app`);
  const porId = new Map(app.map((x) => [x.id, x]));
  monday.forEach((m, i) => {
    const a = porId.get(m.id);
    const donde = `«${m.name ?? m.id}»`;
    if (!a) { out.push(`${donde}: falta en la app`); return; }
    if (app[i]?.id !== m.id) out.push(`${donde}: orden distinto`);
    diferenciasProfundas(donde, m, a, out);
  });
  return out;
}

/**
 * Separa las diferencias que solo son "esta persona no está en el directorio": Monday tenía un
 * nombre (o correo) que no existe en personas, y la app no puede guardarlo en una columna Persona.
 * No son errores de la migración: se listan aparte para que alguien agregue a esa persona.
 */
export function separarPersonasFuera(diferencias: string[], enDirectorio: (nombre: string) => boolean): { diferencias: string[]; avisos: string[] } {
  const avisos: string[] = [];
  const resto = diferencias.filter((d) => {
    const m = d.match(/: Monday "(.+)" ≠ app (""|null|undefined)$/);
    if (!m) return true;
    const nombres = m[1].split(",").map((x) => x.trim()).filter(Boolean);
    if (!nombres.length || nombres.some(enDirectorio)) return true;
    avisos.push(d);
    return false;
  });
  return { diferencias: resto, avisos };
}

/**
 * Diferencias con Monday que YA se decidieron: no son errores de la migración ni del modelo. Se
 * listan aparte, con su motivo, y no cuentan como diferencia. Agregar una = una entrada aquí.
 */
export interface DiferenciaExplicada {
  /** Código del tablero (PM-018). */
  codigo: string;
  /** Qué diferencias son: texto de la diferencia por elemento («…».cost: …) o etiqueta de una métrica. */
  patron: RegExp;
  motivo: string;
}

export const DIFERENCIAS_EXPLICADAS: DiferenciaExplicada[] = [
  {
    codigo: "PM-018",
    // El costo de los elementos y lo que depende de él (EVM y salud del board).
    patron: /\.(cost|valueNet):|^(Costo|AC \(costo real\)|CPI|SPI|EV \(valor ganado\)|PV \(valor planeado\)|Índice de salud \(EVM\)|Salud):/,
    motivo: "Cost $ = Effort Spent × 9 + Costo adicional $. Monday no entrega el resultado de las fórmulas y la app de hoy usa un respaldo (esfuerzo × 9) que ignora el costo adicional. Decisión del 2026-11-11: el tablero aplica la fórmula completa, como se ve en Monday.",
  },
];

/** Una métrica lado a lado; `explicada` = el motivo, si su diferencia ya está decidida. */
export interface FilaMetrica { etiqueta: string; monday: unknown; app: unknown; formato?: "dinero" | "pct" | "indice"; explicada?: string }

/** ¿La fila cuenta como igual? (lo es si coincide o si su diferencia está explicada). */
export function filaIgual(f: Pick<FilaMetrica, "monday" | "app" | "explicada">): boolean {
  return !!f.explicada || JSON.stringify(f.monday) === JSON.stringify(f.app);
}

/** Aparta las diferencias ya explicadas del tablero con ese código y marca sus filas. */
export function separarExplicadas<F extends FilaMetrica>(codigo: string | null, diferencias: string[], filas: F[]): {
  diferencias: string[]; filas: F[]; explicadas: { motivo: string; cantidad: number }[];
} {
  const reglas = DIFERENCIAS_EXPLICADAS.filter((r) => r.codigo === codigo);
  if (!reglas.length) return { diferencias, filas, explicadas: [] };
  const cuenta = new Map<string, number>();
  const sumar = (motivo: string) => cuenta.set(motivo, (cuenta.get(motivo) ?? 0) + 1);
  const resto = diferencias.filter((d) => {
    const r = reglas.find((x) => x.patron.test(d));
    if (r) sumar(r.motivo);
    return !r;
  });
  const marcadas = filas.map((f) => {
    const distinta = JSON.stringify(f.monday) !== JSON.stringify(f.app);
    const r = distinta ? reglas.find((x) => x.patron.test(`${f.etiqueta}:`)) : undefined;
    if (!r) return f;
    sumar(r.motivo);
    return { ...f, explicada: r.motivo };
  });
  return { diferencias: resto, filas: marcadas, explicadas: [...cuenta].map(([motivo, cantidad]) => ({ motivo, cantidad })) };
}

export interface ResumenMetricas {
  elementos: number;
  subelementos: number;
  hechos: number;
  atrasados: number;
  entregasATiempo: number;
  entregasTarde: number;
  costo: number;
  beneficio: number;
  ev: number;
  pv: number;
  ac: number;
  spi: number | null;
  cpi: number | null;
  scope: number | null;
  healthIndex: number | null;
  healthStatus: string | null;
}

/** Métricas del board tal como las calcula la app hoy (EVM, salud, entregas). */
export function resumenMetricas(items: ProjItem[], baselines: Record<string, ProjItemBaseline> = {}): ResumenMetricas {
  const medibles = itemsMedibles(items);
  const subs = medibles.flatMap((i) => i.subitems);
  const todos = [...medibles, ...subs];
  const salud = deriveBoardHealth(calcBoardMetrics(medibles, baselines));
  return {
    elementos: items.length,
    subelementos: items.reduce((n, i) => n + i.subitems.length, 0),
    hechos: todos.filter((x) => x.status === "Done").length,
    atrasados: todos.filter((x) => x.status !== "Done" && x.estado === "ATRASADO" && x.deadline !== null).length,
    entregasATiempo: todos.filter((x) => x.entrega === "on-time").length,
    entregasTarde: todos.filter((x) => x.entrega === "late").length,
    costo: medibles.reduce((n, i) => n + i.cost, 0),
    beneficio: medibles.reduce((n, i) => n + i.benefit, 0),
    ev: salud.ev, pv: salud.pv, ac: salud.ac, spi: salud.spi, cpi: salud.cpi, scope: salud.scope,
    healthIndex: salud.healthIndex, healthStatus: salud.healthStatus,
  };
}
