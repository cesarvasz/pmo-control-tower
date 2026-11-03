// src/lib/evmClase.ts
// Reparte las notas EVM de los Proyectos y PML en sus fuentes por CLASE (A, B, C) para ponderarlas con
// weightedEvm (lib/health.ts). La clase es la que se asigna en Calidad & Cumplimiento → Clasificación
// (lib/claseProyecto.ts). Módulo PURO.

import { claseDeBoard, claseDePml, fuenteDeClase, type Clase } from "@/lib/claseProyecto";
import type { PartesEvm } from "@/lib/health";
import type { ClaseEntry, ProjBoard, ReqItem } from "@/types";

/** Una nota (0–1) de un Proyecto o PML, con la clase en la que cuenta. */
export interface NotaConClase { clase: Clase; valor: number }

/**
 * Las fuentes del EVM: Iniciativas tal cual y, por cada clase A/B/C, el PROMEDIO de las notas de sus
 * Proyectos y PML. Una clase sin notas queda en null (su peso se reparte entre las demás); lo que no
 * tiene clase («Sin clasificar») no cuenta en ninguna hasta que se le asigne una.
 */
export function partesEvm(ini: number | null, notas: NotaConClase[]): PartesEvm {
  const suma = { A: 0, B: 0, C: 0 };
  const n = { A: 0, B: 0, C: 0 };
  for (const { clase, valor } of notas) {
    const f = fuenteDeClase(clase);
    if (!f) continue;
    suma[f] += valor;
    n[f]++;
  }
  const media = (f: "A" | "B" | "C") => (n[f] ? suma[f] / n[f] : null);
  return { ini, A: media("A"), B: media("B"), C: media("C") };
}

/** Las notas de salud de los PML (VEM) y de los proyectos (índice del board) con la clase de cada uno.
 *  `pmlActivos` ya viene filtrado a los que cuentan; un PML o board sin nota no se incluye. */
export function notasPorClase(
  pmlActivos: ReqItem[],
  boards: { board: ProjBoard; healthIndex: number | null | undefined }[],
  clases: Record<string, ClaseEntry>,
): NotaConClase[] {
  const notas: NotaConClase[] = [];
  for (const r of pmlActivos) if (r.vem != null) notas.push({ clase: claseDePml(r.id, clases), valor: r.vem });
  for (const { board, healthIndex } of boards) if (healthIndex != null) notas.push({ clase: claseDeBoard(board, clases), valor: healthIndex });
  return notas;
}
