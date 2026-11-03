// src/lib/clasificacion.ts
// La lista de la pestaña «Clasificación» de Calidad & Cumplimiento: TODOS los Proyectos y PML
// (completos, cerrados y en On Hold incluidos) con su ID, nombre, PM, CKU, Sponsor, Clase (A, B o C)
// y su situación de On Hold (fase, si está pausado y su motivo). Esta pestaña unificó a la que
// antes era solo de On Hold.
// Módulo PURO. Recibe el dashboard COMPLETO (`dataTodo`).

import { claseDeBoard, claseDePml, type Clase } from "@/lib/claseProyecto";
import { filasOnHold } from "@/lib/onHoldLista";
import { lookupEstrategia, splitBoardName } from "@/lib/proj";
import type { DashboardData } from "@/types";

export type TipoClasificacion = "proyecto" | "pml";

export interface FilaClasificacion {
  tipo: TipoClasificacion;
  /** Id del board (proyecto) o del item (PML). */
  id: string;
  /** «PM-015» para un proyecto; el PML ID para un PML. */
  codigo: string;
  nombre: string;
  pm: string;
  cku: string;
  sponsor: string;
  /** La asignada a mano; si no hay, la de siempre (proyecto: su tabla en claseProyecto.ts; PML: C). */
  clase: Clase;
  /** Fase en la que está hoy (proyecto: la primera que aún no está 100 % Done); «Completado» /
   *  «Cerrado» cuando ya no hay nada que hacer. */
  fase: string;
  /** Se puede pausar: un proyecto sin completar o un PML que no está CERRADO. Un proyecto completo o
   *  un PML cerrado ya no tiene nada que pausar (ver filasOnHold). */
  pausable: boolean;
  enOnHold: boolean;
  /** Por qué se pausó; "" si no está en On Hold o se pausó antes de que existiera el motivo. */
  motivo: string;
}

/** ID y nombre de un board. Si Monday lo nombró sin la barra («PM-017 Impala 2.0»), igual se separa
 *  el ID del nombre; un board sin ningún ID («Sin barra») se queda entero como ID, sin nombre. */
export function codigoYNombre(boardName: string): { code: string; name: string } {
  const partido = splitBoardName(boardName);
  if (partido.code) return partido;
  const m = boardName.trim().match(/^(PM[- ]?\d{3})\s+(.+)$/i);
  return m ? { code: m[1], name: m[2].trim() } : partido;
}

/** Primero los proyectos, ordenados por su ID (PM-015 antes que PM-016), y luego los PML por su
 *  PML ID (PML-2 antes que PML-10). El Sponsor de un proyecto viene de su Iniciativa; el de un PML,
 *  de la Estrategia a la que cuelga (el PML no trae Sponsor propio). */
export function filasClasificacion(data: DashboardData): FilaClasificacion[] {
  // Lo que se puede pausar, con su fase, su On Hold y su motivo (la lógica de On Hold vive ahí).
  const pausables = new Map(filasOnHold(data).map((f) => [`${f.tipo}:${f.id}`, f]));
  const filas: FilaClasificacion[] = [];

  for (const b of data.projBoards) {
    const { code, name } = codigoYNombre(b.name);
    const oh = pausables.get(`proyecto:${b.id}`);
    filas.push({
      tipo: "proyecto", id: b.id, codigo: code || b.name, nombre: code ? name : "",
      pm: b.pm || "", cku: b.cku || "", sponsor: b.sponsor || "",
      clase: claseDeBoard(b, data.clases),
      fase: oh ? oh.fase : "Completado", pausable: !!oh, enOnHold: oh?.enOnHold ?? false, motivo: oh?.motivo ?? "",
    });
  }

  for (const r of data.req) {
    const oh = pausables.get(`pml:${r.id}`);
    filas.push({
      tipo: "pml", id: r.id, codigo: r.id, nombre: r.name,
      pm: r.pm || "", cku: r.cku || "", sponsor: lookupEstrategia(data.estrategiaMap, r.estrategia)?.sponsor || "",
      clase: claseDePml(r.id, data.clases),
      fase: oh ? oh.fase : "Cerrado", pausable: !!oh, enOnHold: oh?.enOnHold ?? false, motivo: oh?.motivo ?? "",
    });
  }

  return filas.sort((a, b) =>
    (a.tipo === b.tipo ? 0 : a.tipo === "proyecto" ? -1 : 1)
    || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
}
