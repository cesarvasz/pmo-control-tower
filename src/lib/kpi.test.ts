import { describe, it, expect } from "vitest";
import {
  computeKpi,
  kpiColorFor,
  kpiBgFor,
  kpiCompColor,
  KPI_W,
  type KpiComponent,
} from "./kpi";

// Pesos: EVM 30 · NPS 10 · Beneficio 25 · Entregas 15 · Reproceso 20.
// Sin reprocesoPct (null) el 5º queda pendiente → máximo alcanzable = 80.
describe("computeKpi", () => {
  it("sin reproceso: logro perfecto en los otros 4 → score 80, achievable 80, ratio 1", () => {
    const r = computeKpi({ evm: 1.0, nps: 50, benefit: 11000, entregasPct: 100 });
    expect(r.score).toBeCloseTo(80, 5);
    expect(r.achievable).toBe(80);
    expect(r.ratio).toBeCloseTo(1, 5);
  });

  it("con reproceso 100%: logro perfecto en los 5 → score 100, achievable 100", () => {
    const r = computeKpi({ evm: 1.0, nps: 50, benefit: 11000, entregasPct: 100, reprocesoPct: 100 });
    expect(r.score).toBeCloseTo(100, 5);
    expect(r.achievable).toBe(100);
    const rep = r.components.find((c) => c.key === "reproceso")!;
    expect(rep.pending).toBe(false);
    expect(rep.logro).toBeCloseTo(1, 5);
  });

  it("reproceso 50% aporta 10 (0.5 × 20)", () => {
    const r = computeKpi({ evm: null, nps: null, benefit: 0, entregasPct: null, reprocesoPct: 50 });
    expect(r.score).toBeCloseTo(10, 5);
    expect(r.achievable).toBe(100);
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

  it("entregas: el % es directamente la fracción del peso (85% → logro 0.85)", () => {
    const r = computeKpi({ evm: null, nps: null, benefit: 0, entregasPct: 85 });
    const ent = r.components.find((c) => c.key === "entregas")!;
    expect(ent.logro).toBeCloseTo(0.85, 5);
    expect(r.score).toBeCloseTo(0.85 * KPI_W.entregas, 5); // 12.75
  });

  it("NPS: meta 50 — <0 → logro 0, proporcional 0–50, tope en 50", () => {
    const neg = computeKpi({ evm: null, nps: -10, benefit: 0, entregasPct: null }).components.find((c) => c.key === "nps")!;
    expect(neg.logro).toBe(0);
    const mid = computeKpi({ evm: null, nps: 25, benefit: 0, entregasPct: null }).components.find((c) => c.key === "nps")!;
    expect(mid.logro).toBeCloseTo(0.5, 5);
    const over = computeKpi({ evm: null, nps: 80, benefit: 0, entregasPct: null }).components.find((c) => c.key === "nps")!;
    expect(over.logro).toBe(1);
  });

  it("expone 5 componentes; el 5º es 'reproceso', pendiente cuando no se pasa su %", () => {
    const r = computeKpi({ evm: 1, nps: 30, benefit: 11000, entregasPct: 85 });
    expect(r.components).toHaveLength(5);
    const rep = r.components.find((c) => c.key === "reproceso")!;
    expect(rep.pending).toBe(true);
    expect(rep.logro).toBe(0);
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
