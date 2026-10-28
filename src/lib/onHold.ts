// src/lib/onHold.ts
// On Hold: un Proyecto (board de Monday) o un PML (item del board de requerimientos)
// puesto en pausa deja de contar en TODA métrica — Player/KPI, EVM, Beneficio, Calidad,
// Cumplimiento, NPS, notificaciones, histórico semanal… Se hace recortando el dashboard
// una sola vez (aplicarOnHold, igual que scopeToSponsor) en vez de tocar cada fórmula,
// así que cualquier cálculo que consuma `data` queda cubierto sin enterarse. Las páginas
// que tienen que MOSTRAR lo pausado (Proyectos, PML, el card de cada PM) leen el dashboard
// completo y usan enOnHold(). Módulo PURO: sin React ni Firestore.

import { calcNpsFromRecords } from "@/lib/nps";
import { npsStepIds } from "@/lib/projectMetrics";
import type { DashboardData, OnHoldDoc, OnHoldEntry, ProjBoard, ReqItem } from "@/types";

export type OnHoldTipo = "proyecto" | "pml";

export const ON_HOLD_TIPOS: readonly OnHoldTipo[] = ["proyecto", "pml"];

export function onHoldVacio(): OnHoldDoc {
  return { proyectos: {}, pml: {} };
}

const campoDe = (tipo: OnHoldTipo): keyof OnHoldDoc => (tipo === "proyecto" ? "proyectos" : "pml");

const tiene = (mapa: Record<string, OnHoldEntry>, id: string) => Object.prototype.hasOwnProperty.call(mapa, id);

/** Largo máximo del motivo de un On Hold. */
export const MOTIVO_ON_HOLD_MAX = 500;

/** Motivo limpio (sin espacios de más) o null si no es texto o pasa del máximo. Vacío es válido
 *  ("") — quien lo exija (poner en On Hold) lo revisa aparte. */
export function normalizarMotivoOnHold(m: unknown): string | null {
  if (typeof m !== "string") return null;
  const t = m.trim();
  return t.length <= MOTIVO_ON_HOLD_MAX ? t : null;
}

/** Id válido de board o item de Monday (se usa como llave del documento en Firestore). */
export function normalizarIdOnHold(id: unknown): string | null {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

export function esTipoOnHold(t: unknown): t is OnHoldTipo {
  return t === "proyecto" || t === "pml";
}

function leerMapa(raw: unknown): Record<string, OnHoldEntry> {
  const out: Record<string, OnHoldEntry> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!normalizarIdOnHold(id)) continue;
    const e = (v && typeof v === "object" ? v : {}) as Partial<OnHoldEntry>;
    out[id] = {
      by: typeof e.by === "string" ? e.by : "",
      at: typeof e.at === "string" ? e.at : "",
      motivo: typeof e.motivo === "string" ? e.motivo : "",
    };
  }
  return out;
}

/** Lee el documento tal como está en Firestore. Tolerante: lo que falte o venga mal es "nada en On Hold". */
export function leerOnHold(raw: unknown): OnHoldDoc {
  const d = (raw && typeof raw === "object" ? raw : {}) as { proyectos?: unknown; pml?: unknown };
  return { proyectos: leerMapa(d.proyectos), pml: leerMapa(d.pml) };
}

export function estaEnOnHold(h: OnHoldDoc, tipo: OnHoldTipo, id: string): boolean {
  return tiene(h[campoDe(tipo)], id);
}

export function cantidadOnHold(h: OnHoldDoc): number {
  return Object.keys(h.proyectos).length + Object.keys(h.pml).length;
}

/** Copia del documento con el motivo de un Proyecto/PML que YA está en On Hold cambiado (quién y
 *  cuándo lo pausó se conservan). Si no está en On Hold devuelve el mismo documento. */
export function conMotivoOnHold(h: OnHoldDoc, tipo: OnHoldTipo, id: string, motivo: string): OnHoldDoc {
  const campo = campoDe(tipo);
  if (!tiene(h[campo], id)) return h;
  return { ...h, [campo]: { ...h[campo], [id]: { ...h[campo][id], motivo } } };
}

/** Copia del documento con ese Proyecto/PML puesto (`activo`) o quitado de On Hold. */
export function conOnHold(h: OnHoldDoc, tipo: OnHoldTipo, id: string, activo: boolean, entry: OnHoldEntry): OnHoldDoc {
  const campo = campoDe(tipo);
  const mapa = { ...h[campo] };
  if (activo) mapa[id] = entry;
  else delete mapa[id];
  return { ...h, [campo]: mapa };
}

/** El dashboard SIN lo que está en On Hold: sus boards e items de Proyectos (y los
 *  baselines de esos items), sus PML y las encuestas de NPS ligadas a ellos (el NPS se
 *  recalcula). Sin nada en On Hold devuelve el mismo objeto. No modifica el original. */
export function aplicarOnHold(data: DashboardData): DashboardData {
  const { proyectos, pml } = data.onHold;
  if (Object.keys(proyectos).length === 0 && Object.keys(pml).length === 0) return data;

  const proj = data.proj.filter((p) => !tiene(proyectos, p.boardId));
  const projBoards = data.projBoards.filter((b) => !tiene(proyectos, b.id));
  const req = data.req.filter((r) => !tiene(pml, r.id));
  const projItemBaselines = Object.fromEntries(
    Object.entries(data.projItemBaselines).filter(([, b]) => !tiene(proyectos, b.boardId)),
  );

  // Encuestas lanzadas desde un step de NPS de un proyecto pausado, o desde un PML pausado.
  const pausados = npsStepIds(data.proj.filter((p) => tiene(proyectos, p.boardId)));
  Object.keys(pml).forEach((id) => pausados.add(id));
  const npsRecords = data.npsRecords.filter((r) => !(r.reqId && pausados.has(r.reqId)));
  const nps = npsRecords.length === data.npsRecords.length ? data.nps : calcNpsFromRecords(npsRecords);

  return { ...data, proj, projBoards, req, projItemBaselines, npsRecords, nps };
}

export interface EnOnHold {
  proyectos: ProjBoard[];
  pml: ReqItem[];
}

/** Lo que está en On Hold, para mostrarlo. `data` debe traer TODO (sin aplicarOnHold). */
export function enOnHold(data: DashboardData): EnOnHold {
  return {
    proyectos: data.projBoards.filter((b) => tiene(data.onHold.proyectos, b.id)),
    pml: data.req.filter((r) => tiene(data.onHold.pml, r.id)),
  };
}
