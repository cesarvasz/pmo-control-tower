// Paridad de métricas: ¿un tablero de la app mide igual que su board de Monday? Compara los
// ProjItem que salen de cada lado (los mismos que usan todas las métricas) y resume las métricas
// del board. Si los ProjItem son iguales, TODO lo que se calcula con ellos también lo es. PURA.

import type { ProjItem, ProjItemBaseline, ProjSubitem } from "@/types";
import { calcBoardMetrics, deriveBoardHealth, itemsMedibles } from "@/lib/proj";
import { claveNombre } from "./personas";

/** Campos que solo sirven para escribir en Monday (no entran en ninguna métrica). */
const SOLO_MONDAY = new Set(["statusColId", "statusOptions", "statusBoardId", "email", "subitems"]);
/** Nombres de personas: Monday a veces los trae sin acentos ("Cesar"); el directorio los tiene bien. */
const NOMBRES = new Set(["resp", "responsible", "developer"]);

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
