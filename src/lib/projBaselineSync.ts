// src/lib/projBaselineSync.ts
// Regla de sincronización del costo baseline de un item de Proyecto — FUENTE
// ÚNICA. La usan tanto /api/dashboard (todos los boards) como
// /api/dashboard/board/[boardId] (un solo board): sin baseline se guarda,
// con baseline en 0 y ahora hay costo se actualiza, con baseline > 0 nunca se
// sobreescribe. Antes vivía solo dentro de /api/dashboard/route.ts; separarla
// evita que el refresh de un board reimplemente la regla por su cuenta.

import { resolveCost } from "@/lib/proj";
import { getProjItemBaselinesFor, saveProjItemBaseline } from "@/lib/firebase-admin";
import type { MondayItem, ProjItemBaseline } from "@/types";

/** Decide qué items necesitan guardar/actualizar su baseline — PURA, sin I/O. */
export function decideBaselineUpdates(
  items: MondayItem[],
  existing: Record<string, ProjItemBaseline>,
): { id: string; cost: number }[] {
  const toSave: { id: string; cost: number }[] = [];
  for (const item of items) {
    const cost = resolveCost(item.column_values);
    const current = existing[item.id];
    if (!current) toSave.push({ id: item.id, cost });
    else if (current.cost === 0 && cost > 0) toSave.push({ id: item.id, cost });
  }
  return toSave;
}

/** Sincroniza en Firestore el baseline de los items de UN board — solo lee/
 *  escribe lo de ESE board (getAll por id, no toda la colección). Devuelve el
 *  mapa de baselines ya actualizado, listo para el cliente. */
export async function syncBoardBaselines(
  boardId: string, items: MondayItem[],
): Promise<Record<string, ProjItemBaseline>> {
  const existing = await getProjItemBaselinesFor(items.map((it) => it.id));
  const toSave = decideBaselineUpdates(items, existing);
  await Promise.all(toSave.map(({ id, cost }) => saveProjItemBaseline(id, { boardId, cost })));
  const savedAt = new Date().toISOString();
  for (const { id, cost } of toSave) existing[id] = { boardId, cost, savedAt };
  return existing;
}
