// src/lib/clasificacion.ts
// La lista de la pestaña «Clasificación» de Calidad & Cumplimiento: TODOS los Proyectos y PML
// (completos, cerrados y en On Hold incluidos) con su ID, nombre, PM, CKU y Sponsor.
// Módulo PURO. Recibe el dashboard COMPLETO (`dataTodo`).

import { claseDePml, claseDeProyecto, type Clase } from "@/lib/claseProyecto";
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
}

/** ID y nombre de un board. Si Monday lo nombró sin la barra («PM-017 Impala 2.0»), igual se separa
 *  el ID del nombre; un board sin ningún ID («Sin barra») se queda entero como ID, sin nombre. */
function codigoYNombre(boardName: string): { code: string; name: string } {
  const partido = splitBoardName(boardName);
  if (partido.code) return partido;
  const m = boardName.trim().match(/^(PM[- ]?\d{3})\s+(.+)$/i);
  return m ? { code: m[1], name: m[2].trim() } : partido;
}

/** Primero los proyectos, ordenados por su ID (PM-015 antes que PM-016), y luego los PML por su
 *  PML ID (PML-2 antes que PML-10). El Sponsor de un proyecto viene de su Iniciativa; el de un PML,
 *  de la Estrategia a la que cuelga (el PML no trae Sponsor propio). */
export function filasClasificacion(data: Pick<DashboardData, "projBoards" | "req" | "estrategiaMap" | "clases">): FilaClasificacion[] {
  const filas: FilaClasificacion[] = [];

  for (const b of data.projBoards) {
    const { code, name } = codigoYNombre(b.name);
    filas.push({
      tipo: "proyecto", id: b.id, codigo: code || b.name, nombre: code ? name : "",
      pm: b.pm || "", cku: b.cku || "", sponsor: b.sponsor || "",
      clase: claseDeProyecto(code, b.id, data.clases),
    });
  }

  for (const r of data.req) {
    filas.push({
      tipo: "pml", id: r.id, codigo: r.id, nombre: r.name,
      pm: r.pm || "", cku: r.cku || "", sponsor: lookupEstrategia(data.estrategiaMap, r.estrategia)?.sponsor || "",
      clase: claseDePml(r.id, data.clases),
    });
  }

  return filas.sort((a, b) =>
    (a.tipo === b.tipo ? 0 : a.tipo === "proyecto" ? -1 : 1)
    || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
}
