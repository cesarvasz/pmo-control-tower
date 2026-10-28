// src/lib/onHoldLista.ts
// La lista de la pestaña «On Hold» de Calidad & Cumplimiento: todos los Proyectos y PML que
// todavía no se completan, con o sin On Hold, para poder pausarlos o reactivarlos desde ahí.
// Módulo PURO. Recibe el dashboard COMPLETO (`dataTodo`, con lo pausado incluido).

import { enOnHold as estaPausado, type OnHoldTipo } from "@/lib/onHold";
import { splitBoardName } from "@/lib/proj";
import { buildProjectSummary, currentPhaseIndex } from "@/lib/projSummary";
import type { DashboardData } from "@/types";

export interface FilaOnHold {
  tipo: OnHoldTipo;
  /** Id del board (proyecto) o del item (PML): el que se manda a /api/on-hold. */
  id: string;
  /** «PM-015» para un proyecto; el PML ID para un PML. */
  codigo: string;
  nombre: string;
  pm: string;
  /** Fase en la que está hoy (proyecto: la primera que aún no está 100 % Done). */
  fase: string;
  enOnHold: boolean;
  /** Por qué se pausó; "" si no está en On Hold o se pausó antes de que existiera el motivo. */
  motivo: string;
}

/** Proyectos aún sin completar y PML que no están CERRADOS: primero los proyectos, ordenados por
 *  su ID (PM-015 antes que PM-016), y luego los PML por su PML ID (PML-2 antes que PML-10). Un
 *  proyecto sin items (no hay con qué juzgarlo) cuenta como
 *  no completado, igual que en las tarjetas del Control Tower. */
export function filasOnHold(data: DashboardData): FilaOnHold[] {
  const pausados = estaPausado(data);
  const proyectosPausados = new Set(pausados.proyectos.map((b) => b.id));
  const pmlPausados = new Set(pausados.pml.map((r) => r.id));

  const filas: FilaOnHold[] = [];

  for (const b of data.projBoards) {
    const items = data.proj.filter((p) => p.boardId === b.id);
    const resumen = buildProjectSummary(items);
    if (resumen.completion.isComplete) continue;
    const { code, name } = splitBoardName(b.name);
    const i = currentPhaseIndex(resumen.phases);
    filas.push({
      tipo: "proyecto", id: b.id, codigo: code || b.name, nombre: code ? name : "", pm: b.pm,
      fase: i >= 0 ? resumen.phases[i].grupo : "—", enOnHold: proyectosPausados.has(b.id),
      motivo: data.onHold.proyectos[b.id]?.motivo ?? "",
    });
  }

  for (const r of data.req) {
    if (r.estado === "CERRADO") continue;
    filas.push({
      tipo: "pml", id: r.id, codigo: r.id, nombre: r.name, pm: r.pm, fase: r.grupo || "—", enOnHold: pmlPausados.has(r.id),
      motivo: data.onHold.pml[r.id]?.motivo ?? "",
    });
  }

  return filas.sort((a, b) =>
    (a.tipo === b.tipo ? 0 : a.tipo === "proyecto" ? -1 : 1)
    || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
}
