import { describe, it, expect } from "vitest";
import {
  computeKpi,
  computeBenefitKpi,
  computeBenefitKpiCku,
  colorIndicadorCku,
  tonoIndicadorCku,
  kpiColorFor,
  kpiBgFor,
  kpiCompColor,
  KPI_W,
  KPI_W_CKU,
  metaConfirmacionAcumulada,
  ratioConfirmacion,
  type KpiComponent,
} from "./kpi";

// Pesos: EVM 25 · NPS 15 · Beneficio 25 · Entregas 10 · Reproceso 10 · Metodología VALOR 15.
// Beneficio (peso 25) = 90% Aprobación + 10% Confirmación, cada mitad contra su meta
// ($84,000/12 = $7,000 por mes). month=12 (meta acumulada = meta anual completa,
// $84,000 — un número redondo) se usa en la mayoría de estos tests para que sea fácil
// de razonar; month=7 solo en el test del prorrateo en sí.
describe("computeBenefitKpi (90% Aprobación / 10% Confirmación contra meta acumulada)", () => {
  it("meta acumulada = (84000/12) × mes", () => {
    const b = computeBenefitKpi(0, 0, 7);
    expect(b.metaAnual).toBe(84000);
    expect(b.metaMensual).toBeCloseTo(7000, 5);
    expect(b.metaAcumulada).toBeCloseTo(7000 * 7, 5);
  });

  it("logro 100% en ambas mitades cuando el beneficio iguala la meta acumulada → total 25", () => {
    const b = computeBenefitKpi(84000, 77000, 12); // aprobación = meta anual; confirmación = meta a 11 meses terminados
    expect(b.logroAprobacion).toBeCloseTo(1, 5);
    expect(b.logroConfirmacion).toBeCloseTo(1, 5);
    expect(b.pesoAprobacion).toBeCloseTo(22.5, 5);  // 90% de 25
    expect(b.pesoConfirmacion).toBeCloseTo(2.5, 5); // 10% de 25
    expect(b.ptsAprobacion).toBeCloseTo(22.5, 5);
    expect(b.ptsConfirmacion).toBeCloseTo(2.5, 5);
    expect(b.total).toBeCloseTo(25, 5);
  });

  it("topa el logro en 100% aunque el beneficio supere la meta acumulada", () => {
    const b = computeBenefitKpi(200000, 200000, 12);
    expect(b.logroAprobacion).toBe(1);
    expect(b.logroConfirmacion).toBe(1);
    expect(b.total).toBeCloseTo(25, 5);
  });

  it("cada mitad se mide independiente (Aprobación al 50%, Confirmación en 0)", () => {
    const b = computeBenefitKpi(42000, 0, 12); // 42000 = 50% de 84000
    expect(b.logroAprobacion).toBeCloseTo(0.5, 5);
    expect(b.logroConfirmacion).toBe(0);
    expect(b.ptsAprobacion).toBeCloseTo(11.25, 5); // 50% de 22.5
    expect(b.ptsConfirmacion).toBe(0);
    expect(b.total).toBeCloseTo(11.25, 5);
  });

  it("Confirmación se mide contra los meses TERMINADOS (octubre → 9, no 10); Aprobación sigue con el mes en curso", () => {
    const b = computeBenefitKpi(63_000, 63_000, 10);
    expect(b.mesesTerminados).toBe(9);
    expect(b.metaConfirmacion).toBeCloseTo(63_000, 5);            // 84000/12 × 9
    expect(b.logroConfirmacion).toBeCloseTo(1, 5);                // 63,000 / 63,000
    expect(b.logroAprobacion).toBeCloseTo(63_000 / 70_000, 5);    // 0.9 — Aprobación usa 10 meses
    expect(metaConfirmacionAcumulada(10)).toBeCloseTo(63_000, 5);
    expect(ratioConfirmacion(31_500, 10)).toBeCloseTo(0.5, 5);
  });

  it("en enero no hay mes terminado: meta de Confirmación 0 y su logro 0", () => {
    const b = computeBenefitKpi(0, 10_000, 1);
    expect(b.metaConfirmacion).toBe(0);
    expect(b.logroConfirmacion).toBe(0);
    expect(ratioConfirmacion(10_000, 1)).toBe(0);
  });

  it("usa el mes calendario actual si no se pasa `month`", () => {
    const b = computeBenefitKpi(0, 0);
    expect(b.month).toBe(new Date().getMonth() + 1);
  });
});

describe("computeKpi", () => {
  it("sin reproceso ni metodología: logro perfecto en los otros 4 → score 75, achievable 75, ratio 1", () => {
    const r = computeKpi({ evm: 1.0, nps: 50, benefitAprobado: 85000, benefitConfirmado: 85000, entregasPct: 100, month: 12 });
    expect(r.score).toBeCloseTo(75, 5);
    expect(r.achievable).toBe(75);
    expect(r.ratio).toBeCloseTo(1, 5);
  });

  it("con reproceso y metodología 100%: logro perfecto en los 6 → score 100, achievable 100", () => {
    const r = computeKpi({ evm: 1.0, nps: 50, benefitAprobado: 85000, benefitConfirmado: 85000, entregasPct: 100, reprocesoPct: 100, metodologiaPct: 100, month: 12 });
    expect(r.score).toBeCloseTo(100, 5);
    expect(r.achievable).toBe(100);
    const rep = r.components.find((c) => c.key === "reproceso")!;
    expect(rep.pending).toBe(false);
    expect(rep.logro).toBeCloseTo(1, 5);
  });

  it("reproceso 50% aporta 5 (0.5 × 10)", () => {
    const r = computeKpi({ evm: null, nps: null, benefitAprobado: 0, benefitConfirmado: 0, entregasPct: null, reprocesoPct: 50 });
    expect(r.score).toBeCloseTo(5, 5);
    expect(r.achievable).toBe(85); // metodología sigue pendiente
  });

  it("todo nulo/cero → score 0, achievable 75, ratio 0", () => {
    const r = computeKpi({ evm: null, nps: null, benefitAprobado: 0, benefitConfirmado: 0, entregasPct: null });
    expect(r.score).toBe(0);
    expect(r.achievable).toBe(75);
    expect(r.ratio).toBe(0);
  });

  it("clampa el logro a 100% aunque el real supere la meta", () => {
    const r = computeKpi({ evm: 1.5, nps: 60, benefitAprobado: 999999, benefitConfirmado: 999999, entregasPct: 200, month: 7 });
    expect(r.score).toBeCloseTo(75, 5);
    const evm = r.components.find((c) => c.key === "evm")!;
    expect(evm.logro).toBe(1);
    const benefit = r.components.find((c) => c.key === "benefit")!;
    expect(benefit.logro).toBeCloseTo(1, 5);
  });

  it("aporta proporcionalmente por componente", () => {
    // Solo EVM al 90%: 0.9 * 25 = 22.5
    const r = computeKpi({ evm: 0.9, nps: null, benefitAprobado: 0, benefitConfirmado: 0, entregasPct: null });
    expect(r.score).toBeCloseTo(22.5, 5);
    expect(r.ratio).toBeCloseTo(22.5 / 75, 5);
  });

  it("entregas: el % es directamente la fracción del peso (85% → logro 0.85)", () => {
    const r = computeKpi({ evm: null, nps: null, benefitAprobado: 0, benefitConfirmado: 0, entregasPct: 85 });
    const ent = r.components.find((c) => c.key === "entregas")!;
    expect(ent.logro).toBeCloseTo(0.85, 5);
    expect(r.score).toBeCloseTo(0.85 * KPI_W.entregas, 5); // 8.5
  });

  it("NPS: ≤0 → 0%, 0 < NPS ≤ 50 proporcional (NPS/50), > 50 → 100%", () => {
    const logroFor = (nps: number | null) =>
      computeKpi({ evm: null, nps, benefitAprobado: 0, benefitConfirmado: 0, entregasPct: null }).components.find((c) => c.key === "nps")!.logro;
    expect(logroFor(null)).toBe(0);
    expect(logroFor(-10)).toBe(0);
    expect(logroFor(0)).toBe(0);
    expect(logroFor(25)).toBeCloseTo(0.5, 5);  // 25/50
    expect(logroFor(1)).toBeCloseTo(0.02, 5);  // 1/50
    expect(logroFor(50)).toBe(1);
    expect(logroFor(51)).toBe(1);
    expect(logroFor(70)).toBe(1);
    expect(logroFor(100)).toBe(1);
  });

  it("beneficio: el componente refleja el reparto 90/10 de computeBenefitKpi", () => {
    const r = computeKpi({ evm: null, nps: null, benefitAprobado: 42000, benefitConfirmado: 0, entregasPct: null, month: 12 });
    const benefit = r.components.find((c) => c.key === "benefit")!;
    expect(benefit.logro).toBeCloseTo(0.45, 5); // 11.25 / 25
    expect(r.score).toBeCloseTo(11.25, 5);
  });

  it("expone 6 componentes; reproceso y metodología quedan pendientes cuando no se pasa su %", () => {
    const r = computeKpi({ evm: 1, nps: 30, benefitAprobado: 78750, benefitConfirmado: 0, entregasPct: 85, month: 7 });
    expect(r.components).toHaveLength(6);
    const rep = r.components.find((c) => c.key === "reproceso")!;
    expect(rep.pending).toBe(true);
    expect(rep.logro).toBe(0);
    expect(r.components.find((c) => c.key === "metodologia")!.pending).toBe(true);
  });

  it("metodología: el promedio de notas es directamente la fracción del peso (80% → 0.8 × 15 = 12)", () => {
    const r = computeKpi({ evm: null, nps: null, benefitAprobado: 0, benefitConfirmado: 0, entregasPct: null, metodologiaPct: 80 });
    const m = r.components.find((c) => c.key === "metodologia")!;
    expect(m.weight).toBe(15);
    expect(m.pending).toBeFalsy();
    expect(m.logro).toBeCloseTo(0.8, 5);
    expect(r.score).toBeCloseTo(12, 5);
  });
});

// CKU (peso 25 de KPI_W_CKU): un solo porcentaje que vale todo el peso. Meta = beneficio aprobado
// HardSaving de sus proyectos y PML; cumplimiento = lo generado (ROI). A diferencia de los PM, sin
// reparto 90/10 Aprobación/Confirmación.
describe("computeBenefitKpiCku (meta = lo aprobado HardSaving del CKU; cumplimiento = el ROI generado)", () => {
  it("cumplimiento de meta = ROI ÷ meta, y vale todo el peso", () => {
    const b = computeBenefitKpiCku(80_000, 20_000);
    expect(b.metaTotal).toBe(80_000);
    expect(b.real).toBe(20_000);
    expect(b.logro).toBeCloseTo(0.25, 5);
    expect(b.peso).toBe(25);
    expect(b.total).toBeCloseTo(6.25, 5);   // 0.25 × 25, no 0.25 × 2.5
  });

  it("tope en 100%: generar más que la meta no da puntos extra", () => {
    const b = computeBenefitKpiCku(22_530, 50_376);
    expect(b.logro).toBe(1);
    expect(b.total).toBeCloseTo(25, 5);
  });

  it("sin meta: logro 0 y en computeKpi el componente queda pendiente", () => {
    const b = computeBenefitKpiCku(0, 5_000);
    expect(b.total).toBe(0);
    const r = computeKpi({ evm: null, nps: null, benefitAprobado: 0, benefitConfirmado: 0, beneficioCku: b, entregasPct: null, weights: KPI_W_CKU });
    expect(r.components.find((c) => c.key === "benefit")!.pending).toBe(true);
  });

  it("con Implementación: (ROI + Profit del mes) ÷ (meta + meta de Implementación del mes)", () => {
    const b = computeBenefitKpiCku(20_000, 5_000, KPI_W_CKU, { mes: "2026-10", meta: 30_000, profit: 20_000 });
    expect(b.metaTotal).toBe(50_000);
    expect(b.real).toBe(25_000);
    expect(b.logro).toBeCloseTo(0.5, 5);
    expect(b.total).toBeCloseTo(12.5, 5);
    // lo que no es Implementación se conserva para mostrarlo aparte
    expect(b.meta).toBe(20_000);
    expect(b.benefitConfirmado).toBe(5_000);
  });

  it("con Implementación: un Profit negativo no deja el cumplimiento bajo 0", () => {
    const b = computeBenefitKpiCku(0, 0, KPI_W_CKU, { mes: "2026-10", meta: 30_000, profit: -5_000 });
    expect(b.logro).toBe(0);
    // Solo con meta de Implementación el componente ya se mide (no queda pendiente).
    const r = computeKpi({ evm: null, nps: null, benefitAprobado: 0, benefitConfirmado: 0, beneficioCku: b, entregasPct: null, weights: KPI_W_CKU });
    expect(r.components.find((c) => c.key === "benefit")!.pending).toBe(false);
  });

  it("computeKpi usa el beneficio del CKU en vez de la meta acumulada de los PM", () => {
    const b = computeBenefitKpiCku(80_000, 20_000);
    const r = computeKpi({ evm: null, nps: null, benefitAprobado: 999_999, benefitConfirmado: 999_999, beneficioCku: b, entregasPct: null, weights: KPI_W_CKU });
    const c = r.components.find((x) => x.key === "benefit")!;
    expect(c.logro).toBeCloseTo(0.25, 5);
    expect(c.meta).toBe("$80,000");
    expect(c.real).toBe("$20,000");
  });
});

// CKU que lleva Implementación (Victoria): su Beneficio es lo cumplido ÷ la meta del mes SUMANDO Implementación y
// Ducafast Mesa 2 (en dólares), y ya no mira los dólares del ROI ni lo aprobado.
describe("computeBenefitKpiCku con Ducafast (cumplido total ÷ meta total de Implementación y Ducafast Mesa 2)", () => {
  const impl = { mes: "2026-11", meta: 40_000, profit: 10_000 };                                   // 25 %
  const duca = { mes: "2026-11", files: 40, filesCon: 4, metaUsd: 400, ahorroUsd: 40 };            // 10 %

  it("logro = (Profit + Beneficio Ducafast) ÷ (meta Implementación + meta Ducafast), y vale todo el peso", () => {
    const b = computeBenefitKpiCku(80_000, 70_000, KPI_W_CKU, impl, duca);
    expect(b.metricasMes).toEqual({
      pctImplementacion: 0.25, pctDucafast: 0.1,
      metaTotal: 40_400, realTotal: 10_040, pctTotal: 10_040 / 40_400,
    });
    // no es el promedio de los dos % (17.5 %): Ducafast pesa lo que pesan sus dólares
    expect(b.metricasMes!.pctTotal).not.toBeCloseTo(0.175, 3);
    expect(b.logro).toBeCloseTo(10_040 / 40_400, 9);
    expect(b.total).toBeCloseTo((10_040 / 40_400) * 25, 9);
    expect(b.ducafast).toEqual(duca);   // los Files viajan para el detalle del popup
    // el ROI y lo aprobado ya no entran en el porcentaje (siguen disponibles para el popup)
    expect(b.benefitConfirmado).toBe(70_000);
  });

  it("sin Files de la Mesa 2 (null) cuenta solo Implementación", () => {
    const b = computeBenefitKpiCku(0, 0, KPI_W_CKU, impl, null);
    expect(b.metricasMes).toEqual({ pctImplementacion: 0.25, pctDucafast: null, metaTotal: 40_000, realTotal: 10_000, pctTotal: 0.25 });
    expect(b.ducafast).toBeUndefined();
  });

  it("si Implementación no tiene meta, cuenta solo Ducafast (y su Profit no suma)", () => {
    const b = computeBenefitKpiCku(0, 0, KPI_W_CKU, { mes: "2026-11", meta: 0, profit: 5 }, duca);
    expect(b.metricasMes!.pctImplementacion).toBeNull();
    expect(b.metricasMes!.pctTotal).toBeCloseTo(0.1, 9);
  });

  it("si al mes le falta un grupo de Ducafast (sin dólares), sus dólares no cuentan pero su % de Files sí se muestra", () => {
    const b = computeBenefitKpiCku(0, 0, KPI_W_CKU, impl, { mes: "2026-11", files: 10, filesCon: 0, metaUsd: null, ahorroUsd: null });
    expect(b.metricasMes!.pctDucafast).toBe(0);
    expect(b.metricasMes!.metaTotal).toBe(40_000);
    expect(b.metricasMes!.pctTotal).toBeCloseTo(0.25, 9);
  });

  it("el porcentaje se muestra sin tope, pero los puntos topan en el peso", () => {
    const b = computeBenefitKpiCku(0, 0, KPI_W_CKU, { mes: "2026-11", meta: 10, profit: 30 }, { mes: "2026-11", files: 10, filesCon: 10, metaUsd: 10, ahorroUsd: 10 });
    expect(b.metricasMes!.pctTotal).toBeCloseTo(2, 9);   // 40 ÷ 20
    expect(b.logro).toBe(1);
    expect(b.total).toBeCloseTo(25, 9);
  });

  it("un Profit negativo no baja los puntos de 0", () => {
    const b = computeBenefitKpiCku(0, 0, KPI_W_CKU, { mes: "2026-11", meta: 10, profit: -50 }, { mes: "2026-11", files: 10, filesCon: 0, metaUsd: 10, ahorroUsd: 0 });
    expect(b.logro).toBe(0);
  });

  it("sin nada que medir queda pendiente; midiendo, computeKpi muestra el % contra 100%", () => {
    const vacio = computeBenefitKpiCku(0, 0, KPI_W_CKU, undefined, null);
    expect(vacio.metricasMes!.pctTotal).toBeNull();
    const rVacio = computeKpi({ evm: null, nps: null, benefitAprobado: 0, benefitConfirmado: 0, beneficioCku: vacio, entregasPct: null, weights: KPI_W_CKU });
    expect(rVacio.components.find((c) => c.key === "benefit")!.pending).toBe(true);

    const b = computeBenefitKpiCku(80_000, 70_000, KPI_W_CKU, impl, duca);
    const c = computeKpi({ evm: null, nps: null, benefitAprobado: 0, benefitConfirmado: 0, beneficioCku: b, entregasPct: null, weights: KPI_W_CKU }).components.find((x) => x.key === "benefit")!;
    expect(c.pending).toBeFalsy();
    expect(c.real).toBe("25%");   // 24.85 % redondeado
    expect(c.meta).toBe("100%");
    expect(c.logro).toBeCloseTo(10_040 / 40_400, 9);
  });

  it("sin el parámetro Ducafast (Javier, PM) todo sigue como antes: dólares", () => {
    const b = computeBenefitKpiCku(80_000, 20_000, KPI_W_CKU, impl);
    expect(b.metricasMes).toBeUndefined();
    expect(b.logro).toBeCloseTo((20_000 + 10_000) / (80_000 + 40_000), 9);
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

describe("colores de los indicadores de un CKU: 100 % verde · 95–99 amarillo · menos de 95 rojo", () => {
  it("tonoIndicadorCku respeta los tres rangos y sus bordes", () => {
    expect(tonoIndicadorCku(100)).toBe("ok");
    expect(tonoIndicadorCku(99.99)).toBe("warn");
    expect(tonoIndicadorCku(99)).toBe("warn");
    expect(tonoIndicadorCku(95)).toBe("warn");
    expect(tonoIndicadorCku(94.99)).toBe("bad");
    expect(tonoIndicadorCku(0)).toBe("bad");
    expect(tonoIndicadorCku(100 - 1e-12)).toBe("ok");   // ruido de punto flotante
  });

  it("nunca pasa de 100 %: un valor por encima cuenta como 100", () => {
    expect(tonoIndicadorCku(130)).toBe("ok");
    expect(colorIndicadorCku(250)).toBe("var(--ok)");
  });

  it("colorIndicadorCku devuelve la variable de tema del tono", () => {
    expect(colorIndicadorCku(100)).toBe("var(--ok)");
    expect(colorIndicadorCku(97)).toBe("var(--warn)");
    expect(colorIndicadorCku(80)).toBe("var(--bad)");
  });

  it("es una escala distinta de la del KPI/Player de los PM (90/75)", () => {
    expect(kpiColorFor(0.92)).toBe("var(--ok)");
    expect(colorIndicadorCku(92)).toBe("var(--bad)");
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
