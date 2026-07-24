import { describe, it, expect } from "vitest";
import {
  computeKpi,
  computeBenefitKpi,
  kpiColorFor,
  kpiBgFor,
  kpiCompColor,
  KPI_W,
  type KpiComponent,
} from "./kpi";

// Pesos: EVM 30 · NPS 10 · Beneficio 25 · Entregas 15 · Reproceso 20.
// Beneficio (peso 25) = 70% Aprobación + 30% Confirmación, cada mitad contra la meta
// mensual acumulada ($135,000/12 × mes). month=12 (meta acumulada = meta anual completa)
// se usa en la mayoría de estos tests para que $11,250×12=135,000 sea fácil de razonar.
describe("computeBenefitKpi (70% Aprobación / 30% Confirmación contra meta acumulada)", () => {
  it("meta acumulada = (135000/12) × mes", () => {
    const b = computeBenefitKpi(0, 0, 7);
    expect(b.metaMensual).toBeCloseTo(11250, 5);
    expect(b.metaAcumulada).toBeCloseTo(78750, 5); // 11250 × 7
  });

  it("logro 100% en ambas mitades cuando el beneficio iguala la meta acumulada → total 25", () => {
    const b = computeBenefitKpi(78750, 78750, 7);
    expect(b.logroAprobacion).toBeCloseTo(1, 5);
    expect(b.logroConfirmacion).toBeCloseTo(1, 5);
    expect(b.ptsAprobacion).toBeCloseTo(17.5, 5); // 70% de 25
    expect(b.ptsConfirmacion).toBeCloseTo(7.5, 5); // 30% de 25
    expect(b.total).toBeCloseTo(25, 5);
  });

  it("topa el logro en 100% aunque el beneficio supere la meta acumulada", () => {
    const b = computeBenefitKpi(200000, 200000, 7);
    expect(b.logroAprobacion).toBe(1);
    expect(b.logroConfirmacion).toBe(1);
    expect(b.total).toBeCloseTo(25, 5);
  });

  it("cada mitad se mide independiente (Aprobación al 50%, Confirmación en 0)", () => {
    const b = computeBenefitKpi(39375, 0, 7); // 39375 = 50% de 78750
    expect(b.logroAprobacion).toBeCloseTo(0.5, 5);
    expect(b.logroConfirmacion).toBe(0);
    expect(b.ptsAprobacion).toBeCloseTo(8.75, 5); // 50% de 17.5
    expect(b.ptsConfirmacion).toBe(0);
    expect(b.total).toBeCloseTo(8.75, 5);
  });

  it("usa el mes calendario actual si no se pasa `month`", () => {
    const b = computeBenefitKpi(0, 0);
    expect(b.month).toBe(new Date().getMonth() + 1);
  });
});

describe("computeKpi", () => {
  it("sin reproceso: logro perfecto en los otros 4 → score 80, achievable 80, ratio 1", () => {
    const r = computeKpi({ evm: 1.0, nps: 50, benefitAprobado: 78750, benefitConfirmado: 78750, entregasPct: 100, month: 7 });
    expect(r.score).toBeCloseTo(80, 5);
    expect(r.achievable).toBe(80);
    expect(r.ratio).toBeCloseTo(1, 5);
  });

  it("con reproceso 100%: logro perfecto en los 5 → score 100, achievable 100", () => {
    const r = computeKpi({ evm: 1.0, nps: 50, benefitAprobado: 78750, benefitConfirmado: 78750, entregasPct: 100, reprocesoPct: 100, month: 7 });
    expect(r.score).toBeCloseTo(100, 5);
    expect(r.achievable).toBe(100);
    const rep = r.components.find((c) => c.key === "reproceso")!;
    expect(rep.pending).toBe(false);
    expect(rep.logro).toBeCloseTo(1, 5);
  });

  it("reproceso 50% aporta 10 (0.5 × 20)", () => {
    const r = computeKpi({ evm: null, nps: null, benefitAprobado: 0, benefitConfirmado: 0, entregasPct: null, reprocesoPct: 50 });
    expect(r.score).toBeCloseTo(10, 5);
    expect(r.achievable).toBe(100);
  });

  it("todo nulo/cero → score 0, achievable 80, ratio 0", () => {
    const r = computeKpi({ evm: null, nps: null, benefitAprobado: 0, benefitConfirmado: 0, entregasPct: null });
    expect(r.score).toBe(0);
    expect(r.achievable).toBe(80);
    expect(r.ratio).toBe(0);
  });

  it("clampa el logro a 100% aunque el real supere la meta", () => {
    const r = computeKpi({ evm: 1.5, nps: 60, benefitAprobado: 999999, benefitConfirmado: 999999, entregasPct: 200, month: 7 });
    expect(r.score).toBeCloseTo(80, 5);
    const evm = r.components.find((c) => c.key === "evm")!;
    expect(evm.logro).toBe(1);
    const benefit = r.components.find((c) => c.key === "benefit")!;
    expect(benefit.logro).toBeCloseTo(1, 5);
  });

  it("aporta proporcionalmente por componente", () => {
    // Solo EVM al 90%: 0.9 * 30 = 27
    const r = computeKpi({ evm: 0.9, nps: null, benefitAprobado: 0, benefitConfirmado: 0, entregasPct: null });
    expect(r.score).toBeCloseTo(27, 5);
    expect(r.ratio).toBeCloseTo(27 / 80, 5);
  });

  it("entregas: el % es directamente la fracción del peso (85% → logro 0.85)", () => {
    const r = computeKpi({ evm: null, nps: null, benefitAprobado: 0, benefitConfirmado: 0, entregasPct: 85 });
    const ent = r.components.find((c) => c.key === "entregas")!;
    expect(ent.logro).toBeCloseTo(0.85, 5);
    expect(r.score).toBeCloseTo(0.85 * KPI_W.entregas, 5); // 12.75
  });

  it("NPS: logro escalonado por rango (PMO Riesgo/Soporte/Táctica/Gobernanza/Estratégica)", () => {
    const logroFor = (nps: number | null) =>
      computeKpi({ evm: null, nps, benefitAprobado: 0, benefitConfirmado: 0, entregasPct: null }).components.find((c) => c.key === "nps")!.logro;
    expect(logroFor(null)).toBe(0);
    expect(logroFor(-10)).toBe(0);            // PMO Riesgo
    expect(logroFor(0)).toBeCloseTo(0.25, 5);  // PMO Soporte
    expect(logroFor(29)).toBeCloseTo(0.25, 5);
    expect(logroFor(30)).toBeCloseTo(0.50, 5); // PMO Táctica
    expect(logroFor(49)).toBeCloseTo(0.50, 5);
    expect(logroFor(50)).toBe(1);              // PMO Gobernanza (100% por ahora)
    expect(logroFor(69)).toBe(1);
    expect(logroFor(70)).toBe(1);              // PMO Estratégica
    expect(logroFor(100)).toBe(1);
  });

  it("beneficio: el componente refleja el reparto 70/30 de computeBenefitKpi", () => {
    const r = computeKpi({ evm: null, nps: null, benefitAprobado: 39375, benefitConfirmado: 0, entregasPct: null, month: 7 });
    const benefit = r.components.find((c) => c.key === "benefit")!;
    expect(benefit.logro).toBeCloseTo(0.35, 5); // 8.75 / 25
    expect(r.score).toBeCloseTo(8.75, 5);
  });

  it("expone 5 componentes; el 5º es 'reproceso', pendiente cuando no se pasa su %", () => {
    const r = computeKpi({ evm: 1, nps: 30, benefitAprobado: 78750, benefitConfirmado: 0, entregasPct: 85, month: 7 });
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
