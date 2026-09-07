// src/lib/valorStepper.ts
// Stepper "VALOR" (Valuación · Aprobación · Launch · Operación · Revisión) del
// encabezado del Reporte Ejecutivo de un proyecto — mapea cada fase (grupo de
// Monday) a una de las 5 etapas canónicas y deriva cuál es la etapa actual.
// Puro: sin React ni red — reutilizado por la vista en pantalla
// (resumen-ejecutivo/page.tsx) y por el PDF (ProjectPdfReport.tsx).

import { currentPhaseIndex, type PhaseSummary } from "@/lib/projSummary";

export interface ValorStage { key: "V" | "A" | "L" | "O" | "R"; label: string }

export const VALOR_STAGES: ValorStage[] = [
  { key: "V", label: "Valuación" },
  { key: "A", label: "Aprobación" },
  { key: "L", label: "Launch" },
  { key: "O", label: "Operación" },
  { key: "R", label: "Revisión" },
];

/** Etapa VALOR (0–4) a la que pertenece una fase, por el nombre de su grupo de
 *  Monday. -1 si el grupo no matchea ninguna etapa canónica (board atípico). */
export function valorStageOf(grupo: string): number {
  const g = (grupo ?? "").trim().toLowerCase();
  if (!g) return -1;
  if (g.startsWith("launch")) return 2;
  if (/operaci[oó]n|implementaci[oó]n/.test(g)) return 3;
  if (/revisi[oó]n|cierre\s*roi/.test(g)) return 4;
  if (/aprobaci[oó]n|value\s*gate/.test(g)) return 1;
  if (/valuaci[oó]n|formulaci[oó]n/.test(g)) return 0;
  return -1;
}

/** Estado del stepper: índice (0–4) de la etapa actual y si el proyecto ya
 *  cerró todas sus fases. La etapa "actual" es la de la primera fase sin
 *  completar (currentPhaseIndex, mismo criterio que el Gantt); si esa fase
 *  tiene un grupo atípico, se busca la etapa reconocible más cercana. */
export function valorProgress(phases: PhaseSummary[]): { current: number; allDone: boolean } {
  if (phases.length === 0) return { current: 0, allDone: false };
  const idx = currentPhaseIndex(phases);
  if (idx === -1) return { current: 4, allDone: true };
  let stage = valorStageOf(phases[idx]?.grupo ?? "");
  for (let i = idx + 1; i < phases.length && stage === -1; i++) stage = valorStageOf(phases[i].grupo);
  for (let i = idx - 1; i >= 0 && stage === -1; i--) stage = valorStageOf(phases[i].grupo);
  return { current: stage === -1 ? Math.min(idx, 4) : stage, allDone: false };
}
