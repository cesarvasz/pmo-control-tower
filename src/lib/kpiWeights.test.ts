import { describe, it, expect } from "vitest";
import { computeKpi, KPI_W, KPI_W_CKU } from "@/lib/kpi";

const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);
const input = { evm: 0.8, nps: 50, benefitAprobado: 85000, benefitConfirmado: 85000, entregasPct: 50, reprocesoPct: 50, month: 12 };

describe("pesos del KPI", () => {
  it("PM y CKU suman 100", () => {
    expect(sum(KPI_W)).toBe(100);
    expect(sum(KPI_W_CKU)).toBe(100);
  });
  it("los CKU usan EVM 25 · Beneficio 25 · Compromiso 20 · Calidad 20 · NPS 10", () => {
    expect(KPI_W_CKU).toEqual({ evm: 25, benefit: 25, entregas: 20, reproceso: 20, nps: 10, metodologia: 0 });
    const k = computeKpi({ ...input, weights: KPI_W_CKU });
    const w = Object.fromEntries(k.components.map((c) => [c.key, c.weight]));
    expect(w).toEqual({ evm: 25, nps: 10, benefit: 25, entregas: 20, reproceso: 20 });
    // 0.8×25 + 1×10 + 1×25 + 0.5×20 + 0.5×20 = 75
    expect(Math.round(k.score)).toBe(75);
  });
  it("los PM usan Beneficio 25 · EVM 25 · Compromiso 10 · Calidad 10 · NPS 15 · Metodología VALOR 15", () => {
    expect(KPI_W).toEqual({ evm: 25, benefit: 25, entregas: 10, reproceso: 10, nps: 15, metodologia: 15 });
  });
  it("sin weights el KPI de PM usa KPI_W (metodología sin calificar no suma)", () => {
    const k = computeKpi(input);
    // 0.8×25 + 1×15 + 1×25 + 0.5×10 + 0.5×10 = 70
    expect(k.score).toBeCloseTo(70);
    // con metodología al 60%: + 0.6×15 = 79
    expect(computeKpi({ ...input, metodologiaPct: 60 }).score).toBeCloseTo(79);
  });
});
