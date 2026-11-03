import { describe, it, expect } from "vitest";
import { calcVem, healthStatusFromIndex, pmHealthStatus, vemCfg, weightedEvm, EVM_PESOS_TXT, EVM_WEIGHTS, FUENTES_EVM, VEM_RANGOS_TXT, VEM_THRESHOLDS } from "./health";

describe("calcVem", () => {
  it("promedia SPI, CPI y Scope", () => {
    expect(calcVem(1, 1, 1)).toBe(1);
    expect(calcVem(0.9, 1, 1)).toBeCloseTo(0.9667, 3);
  });
  it("null si falta cualquiera de los tres", () => {
    expect(calcVem(null, 1, 1)).toBeNull();
    expect(calcVem(1, null, 1)).toBeNull();
    expect(calcVem(1, 1, null)).toBeNull();
  });
});

describe("healthStatusFromIndex", () => {
  it("95 o más On Track · 90 a 94 At Risk · 89 o menos Off Track", () => {
    expect(VEM_THRESHOLDS).toEqual({ onTrack: 95, inRisk: 90 });
    expect(healthStatusFromIndex(1)).toBe("on-track");
    expect(healthStatusFromIndex(0.95)).toBe("on-track");
    expect(healthStatusFromIndex(0.94)).toBe("in-risk");
    expect(healthStatusFromIndex(0.9)).toBe("in-risk");
    expect(healthStatusFromIndex(0.89)).toBe("off-track");
    expect(healthStatusFromIndex(0)).toBe("off-track");
  });
  it("compara el % redondeado, el que se ve: 94.6% sale «95%» y es On Track; 89.6% sale «90%» y es At Risk", () => {
    expect(healthStatusFromIndex(0.946)).toBe("on-track");
    expect(healthStatusFromIndex(0.944)).toBe("in-risk");
    expect(healthStatusFromIndex(0.896)).toBe("in-risk");
    expect(healthStatusFromIndex(0.894)).toBe("off-track");
  });
  it("el texto de los rangos sale de los mismos umbrales", () => {
    expect(VEM_RANGOS_TXT).toBe("≥95% On Track · 90–94% At Risk · <90% Off Track");
  });
  it("null → null", () => {
    expect(healthStatusFromIndex(null)).toBeNull();
  });
});

describe("weightedEvm", () => {
  it("pondera Iniciativas 10% · Clase A 35% · Clase B 30% · Clase C 25%", () => {
    expect(EVM_WEIGHTS).toEqual({ ini: 0.1, A: 0.35, B: 0.3, C: 0.25 });
    expect(EVM_PESOS_TXT).toBe("Iniciativas 10% · Clase A 35% · Clase B 30% · Clase C 25%");
    // Los pesos suman 1.
    expect(FUENTES_EVM.reduce((s, f) => s + EVM_WEIGHTS[f], 0)).toBeCloseTo(1, 10);
    // 1·0.1 + 0.5·0.35 + 0.8·0.3 + 0.2·0.25 = 0.1 + 0.175 + 0.24 + 0.05 = 0.565
    expect(weightedEvm({ ini: 1, A: 0.5, B: 0.8, C: 0.2 })).toBeCloseTo(0.565, 10);
  });

  it("la Clase A manda más que la B y que la C", () => {
    // Una clase en 0.6 y el resto perfecto: el golpe es mayor cuanto más pesa la clase.
    const nota = (c: "A" | "B" | "C") => weightedEvm({ ini: 1, A: 1, B: 1, C: 1, [c]: 0.6 });
    expect(nota("A")!).toBeCloseTo(1 - 0.35 * 0.4, 10);
    expect(nota("B")!).toBeCloseTo(1 - 0.3 * 0.4, 10);
    expect(nota("C")!).toBeCloseTo(1 - 0.25 * 0.4, 10);
    expect(nota("A")!).toBeLessThan(nota("B")!);
    expect(nota("B")!).toBeLessThan(nota("C")!);
  });

  it("una fuente ausente reparte su peso a prorrata entre las presentes", () => {
    // Sin Clase B: pesos 0.1, 0.35 y 0.25 se renormalizan sobre 0.7
    expect(weightedEvm({ ini: 1, A: 0.8, B: null, C: 0.6 })).toBeCloseTo((1 * 0.1 + 0.8 * 0.35 + 0.6 * 0.25) / 0.7, 10);
    // Solo una clase → la nota ES la de esa clase
    expect(weightedEvm({ ini: null, A: null, B: 0.42, C: null })).toBeCloseTo(0.42, 10);
  });

  it("null si no hay ninguna fuente", () => {
    expect(weightedEvm({ ini: null, A: null, B: null, C: null })).toBeNull();
  });

  it("una fuente en 0 sí cuenta (no se confunde con ausente)", () => {
    expect(weightedEvm({ ini: 0, A: 1, B: 1, C: 1 })).toBeCloseTo(0 * 0.1 + 1 * 0.35 + 1 * 0.3 + 1 * 0.25, 10);
  });
});

describe("pmHealthStatus (estado del PM = el de su nota EVM)", () => {
  it("usa los mismos umbrales: 95+ On Track · 90–94 At Risk · 89− Off Track", () => {
    expect(pmHealthStatus(1)).toBe("on-track");
    expect(pmHealthStatus(0.95)).toBe("on-track");
    expect(pmHealthStatus(0.94)).toBe("in-risk");
    expect(pmHealthStatus(0.9)).toBe("in-risk");
    expect(pmHealthStatus(0.89)).toBe("off-track");
    expect(pmHealthStatus(0)).toBe("off-track");
  });
  it("sin nota (nada que medir) queda On Track, como sus bloques vacíos", () => {
    expect(pmHealthStatus(null)).toBe("on-track");
  });
});

describe("vemCfg", () => {
  it("mapea el índice a la config visual de salud", () => {
    expect(vemCfg(1).label).toBe("On Track");
    expect(vemCfg(0.9).label).toBe("At Risk");
    expect(vemCfg(0.5).label).toBe("Off Track");
  });
});
