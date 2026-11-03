// src/lib/claseCard.ts
// Cómo se divide la tarjeta de cada PM en el Control Tower: Iniciativas y, en vez de PML y
// Proyectos por separado, una sección por CLASE (A, B, C) con los Proyectos y PML de esa clase,
// según lo que se asignó en Calidad & Cumplimiento → Clasificación. Son las mismas clases en las
// que se pondera el EVM del PM (Iniciativas 10 % · Clase A 35 % · B 30 % · C 25 %, ver calcPmEvm);
// aquí solo se resumen para mostrarlas en la tarjeta.
// Módulo PURO.

import { claseDeBoard, claseDePml, codigoDeBoard, type Clase } from "@/lib/claseProyecto";
import { healthStatusFromIndex, type HealthStatus } from "@/lib/health";
import type { ClaseEntry, ProjBoard, ReqItem } from "@/types";

/** Las secciones que siempre salen en la tarjeta, aunque estén vacías. */
export const CLASES_TARJETA: readonly Clase[] = ["A", "B", "C"];

/** Un proyecto del PM, con lo que la tarjeta ya sabe de él. */
export interface ProyectoTarjeta {
  board: ProjBoard;
  /** Índice de salud 0–1 (EVM del proyecto); null si no se pudo calcular. */
  healthIndex: number | null;
  /** Si la tarjeta lo cuenta: sin completar y no oculto del Control Tower. */
  visible: boolean;
}

/** Un Proyecto o PML de una clase, tal como se lista en su sección de la tarjeta. */
export interface ItemClase {
  tipo: "proyecto" | "pml";
  /** «PM-003» para un proyecto; el PML ID para un PML. */
  id: string;
  /** Nombre completo, para el tooltip. */
  nombre: string;
  /** Salud 0–1 (EVM del proyecto, o VEM del PML); null si no se pudo calcular. */
  healthIndex: number | null;
  estado: HealthStatus | null;
}

export interface ResumenClase {
  clase: Clase;
  /** Proyectos visibles + PML activos de esta clase. */
  total: number;
  /** Esos mismos, uno por uno (primero los proyectos por su ID y luego los PML), para listar sus IDs. */
  items: ItemClase[];
  offTrack: number;
  inRisk: number;
  onTrack: number;
  /** Promedio de salud de TODOS los proyectos de la clase (también los completos, como antes en la
   *  sección de Proyectos) y de sus PML activos con VEM; null si no hay ninguno con índice. */
  promedio: number | null;
  /** Estado del promedio (el del distintivo de la sección). */
  estado: HealthStatus | null;
  /** Hay algo de esta clase para este PM (aunque todo esté completo y el total sea 0). */
  hay: boolean;
  /** Para el tooltip: los IDs de los proyectos y de los PML de la clase. */
  proyectos: string[];
  pml: string[];
}

const idDeProyecto = (b: ProjBoard) => codigoDeBoard(b.name) || b.name.trim();

/**
 * Resume por clase los Proyectos y PML activos de UN PM. Devuelve siempre A, B y C (en ese orden);
 * «Sin clasificar» solo si el PM tiene algún proyecto sin clase (para que nada se pierda de la
 * tarjeta). Los PML valen Clase C mientras nadie les asigne otra.
 */
export function resumenPorClase(
  proyectos: ProyectoTarjeta[],
  pmlActivos: ReqItem[],
  clases: Record<string, ClaseEntry>,
): ResumenClase[] {
  const vacio = (clase: Clase) => ({
    clase, total: 0, items: [] as ItemClase[], offTrack: 0, inRisk: 0, onTrack: 0,
    indices: [] as number[], hay: false, proyectos: [] as string[], pml: [] as string[],
  });
  const porClase = new Map<Clase, ReturnType<typeof vacio>>();
  const de = (c: Clase) => {
    let r = porClase.get(c);
    if (!r) { r = vacio(c); porClase.set(c, r); }
    return r;
  };
  const contar = (r: ReturnType<typeof vacio>, estado: HealthStatus | null) => {
    if (estado === "off-track") r.offTrack++;
    else if (estado === "in-risk") r.inRisk++;
    else if (estado === "on-track") r.onTrack++;
  };

  for (const c of CLASES_TARJETA) de(c);

  for (const { board, healthIndex, visible } of proyectos) {
    const r = de(claseDeBoard(board, clases));
    r.hay = true;
    const id = idDeProyecto(board);
    r.proyectos.push(id);
    if (healthIndex != null) r.indices.push(healthIndex);
    if (visible) {
      const estado = healthStatusFromIndex(healthIndex);
      r.total++;
      r.items.push({ tipo: "proyecto", id, nombre: board.name, healthIndex, estado });
      contar(r, estado);
    }
  }

  for (const req of pmlActivos) {
    const r = de(claseDePml(req.id, clases));
    r.hay = true;
    r.pml.push(req.id);
    r.total++;
    const healthIndex = req.vem ?? null;
    const estado = healthStatusFromIndex(healthIndex);
    r.items.push({ tipo: "pml", id: req.id, nombre: req.name, healthIndex, estado });
    if (healthIndex !== null) { r.indices.push(healthIndex); contar(r, estado); }
  }

  const orden: Clase[] = [...CLASES_TARJETA];
  if (porClase.has("Sin clasificar")) orden.push("Sin clasificar");

  // Los proyectos van primero (por su ID, PM-004 antes que PM-010) y luego los PML (PML-2 antes que PML-10).
  const porId = (a: ItemClase, b: ItemClase) =>
    (a.tipo === b.tipo ? 0 : a.tipo === "proyecto" ? -1 : 1) || a.id.localeCompare(b.id, "es", { numeric: true });

  return orden.map((c) => {
    const { indices, items, ...r } = porClase.get(c)!;
    const promedio = indices.length ? indices.reduce((s, v) => s + v, 0) / indices.length : null;
    return { ...r, items: [...items].sort(porId), promedio, estado: healthStatusFromIndex(promedio) };
  });
}
