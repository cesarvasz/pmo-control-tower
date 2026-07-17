import { describe, it, expect } from "vitest";
import {
  computeKpi,
  kpiColorFor,
  kpiBgFor,
  kpiCompColor,
  KPI_W,
  type KpiComponent,
} from "./kpi";

// Pesos: EVM 30 · NPS 10 · Beneficio 25 · Entregas 15 · Pendiente 20 (aporta 0).
// Máximo alcanzable hoy = 80.
describe("computeKpi", () => {
  it("logro perfecto → score 80 (máx actual), ratio 1", () => {
    const r = computeKpi({ evm: 1.0, nps: 30, benefit: 11000, entregasPct: 85 });
    expect(r.score).toBeCloseTo(80, 5);
    expect(r.achievable).toBe(80);
    expect(r.ratio).toBeCloseTo(1, 5);
  });

  it("todo nulo/cero → score 0, achievable 80, ratio 0", () => {
    const r = computeKpi({ evm: null, nps: null, benefit: 0, entregasPct: null });
    expect(r.score).toBe(0);
    expect(r.achievable).toBe(80);
    expect(r.ratio).toBe(0);
  });

  it("clampa el logro a 100% aunque el real supere la meta", () => {
    const r = computeKpi({ evm: 1.5, nps: 60, benefit: 20000, entregasPct: 200 });
    expect(r.score).toBeCloseTo(80, 5);
    const evm = r.components.find((c) => c.key === "evm")!;
    expect(evm.logro).toBe(1);
  });

  it("aporta proporcionalmente por componente", () => {
    // Solo EVM al 90%: 0.9 * 30 = 27
    const r = computeKpi({ evm: 0.9, nps: null, benefit: 0, entregasPct: null });
    expect(r.score).toBeCloseTo(27, 5);
    expect(r.ratio).toBeCloseTo(27 / 80, 5);
  });

  it("entregas: 85% sobre meta 85% = logro 1", () => {
    const r = computeKpi({ evm: null, nps: null, benefit: 0, entregasPct: 85 });
    const ent = r.components.find((c) => c.key === "entregas")!;
    expect(ent.logro).toBeCloseTo(1, 5);
    expect(r.score).toBeCloseTo(KPI_W.entregas, 5);
  });

  it("expone 5 componentes; el 5º es 'pendiente' con logro 0", () => {
    const r = computeKpi({ evm: 1, nps: 30, benefit: 11000, entregasPct: 85 });
    expect(r.components).toHaveLength(5);
    const pend = r.components.find((c) => c.key === "pendiente")!;
    expect(pend.pending).toBe(true);
    expect(pend.logro).toBe(0);
  });
});

describe("kpiColorFor", () => {
  it("umbrales 0.9 (ok) / 0.75 (warn) / resto (bad)", () => {
    expect(kpiColorFor(0.95)).toBe("var(--ok)");
    expect(kpiColorFor(0.9)).toBe("var(--ok)");
    expect(kpiColorFor(0.8)).toBe("var(--warn)");
    expect(kpiColorFor(0.75)).toBe("var(--warn)");
    expect(kpiColorFor(0.5)).toBe("var(--bad)");
  });
});

describe("kpiBgFor", () => {
  it("mismos umbrales con variantes -bg", () => {
    expect(kpiBgFor(0.9)).toBe("var(--ok-bg)");
    expect(kpiBgFor(0.8)).toBe("var(--warn-bg)");
    expect(kpiBgFor(0.5)).toBe("var(--bad-bg)");
  });
});

describe("kpiCompColor", () => {
  const comp = (logro: number, pending = false): KpiComponent => ({
    key: "x", label: "X", weight: 10, logro, real: "", meta: "", pending,
  });

  it("gris si está pendiente, sin importar el logro", () => {
    expect(kpiCompColor(comp(1, true))).toBe("#6b7280");
  });

  it("color por umbral de logro", () => {
    expect(kpiCompColor(comp(0.95))).toBe("var(--ok)");
    expect(kpiCompColor(comp(0.8))).toBe("var(--warn)");
    expect(kpiCompColor(comp(0.5))).toBe("var(--bad)");
  });
});
