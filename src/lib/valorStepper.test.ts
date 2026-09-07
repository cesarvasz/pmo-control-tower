import { describe, it, expect } from "vitest";
import { valorStageOf, valorProgress } from "./valorStepper";
import type { PhaseSummary } from "./projSummary";

const phase = (grupo: string, o: Partial<PhaseSummary> = {}): PhaseSummary =>
  ({ grupo, total: 1, done: 0, offTrack: false, started: false, ...o });

describe("valorStageOf", () => {
  it("mapea los nombres de grupo reales a su etapa VALOR", () => {
    expect(valorStageOf("Valuación | Formulación del proyecto")).toBe(0);
    expect(valorStageOf("Aprobación | Value Gate")).toBe(1);
    expect(valorStageOf("Launch | Lanzamiento")).toBe(2);
    expect(valorStageOf("Launch | Desarrollo")).toBe(2);
    expect(valorStageOf("Operación | Implementación")).toBe(3);
    expect(valorStageOf("Revisión | Cierre ROI")).toBe(4);
  });

  it("devuelve -1 para un grupo que no matchea ninguna etapa", () => {
    expect(valorStageOf("Backlog")).toBe(-1);
    expect(valorStageOf("")).toBe(-1);
  });
});

describe("valorProgress", () => {
  const fases = [
    "Valuación | Formulación del proyecto",
    "Aprobación | Value Gate",
    "Launch | Lanzamiento",
    "Operación | Implementación",
    "Revisión | Cierre ROI",
  ];

  it("la etapa actual es la de la primera fase sin completar", () => {
    const phases = fases.map((g, i) => phase(g, { done: i < 2 ? 1 : 0 }));
    expect(valorProgress(phases)).toEqual({ current: 2, allDone: false });
  });

  it("marca allDone cuando todas las fases están completas", () => {
    const phases = fases.map((g) => phase(g, { done: 1 }));
    expect(valorProgress(phases)).toEqual({ current: 4, allDone: true });
  });

  it("no revienta sin fases", () => {
    expect(valorProgress([])).toEqual({ current: 0, allDone: false });
  });
});
