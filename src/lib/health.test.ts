import { describe, it, expect } from "vitest";
import { calcVem, healthStatusFromIndex, vemCfg, weightedEvm, EVM_WEIGHTS } from "./health";

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
  it("umbrales 0.95 (on-track) / 0.85 (in-risk) / resto (off-track)", () => {
    expect(healthStatusFromIndex(0.95)).toBe("on-track");
    expect(healthStatusFromIndex(0.94)).toBe("in-risk");
    expect(healthStatusFromIndex(0.85)).toBe("in-risk");
    expect(healthStatusFromIndex(0.84)).toBe("off-track");
  });
  it("null → null", () => {
    expect(healthStatusFromIndex(null)).toBeNull();
  });
});

describe("weightedEvm", () => {
  it("pondera Iniciativas 10% · REQ 20% · Proyectos 70%", () => {
    expect(EVM_WEIGHTS).toEqual({ ini: 0.1, req: 0.2, proj: 0.7 });
    // 1·0.1 + 0.5·0.2 + 0.8·0.7 = 0.1 + 0.1 + 0.56 = 0.76
    expect(weightedEvm({ ini: 1, req: 0.5, proj: 0.8 })).toBeCloseTo(0.76, 10);
  });

  it("Proyectos domina la nota", () => {
    // Proyectos en 0.6, el resto perfecto → la nota se acerca a 0.6, no a ~0.87
    expect(weightedEvm({ ini: 1, req: 1, proj: 0.6 })).toBeCloseTo(0.72, 10);
  });

  it("una fuente ausente reparte su peso a prorrata entre las presentes", () => {
    // Sin REQ: pesos 0.1 y 0.7 se renormalizan a 0.125 / 0.875
    expect(weightedEvm({ ini: 1, req: null, proj: 0.8 })).toBeCloseTo(1 * 0.125 + 0.8 * 0.875, 10);
    // Solo Proyectos → la nota ES la de Proyectos
    expect(weightedEvm({ ini: null, req: null, proj: 0.42 })).toBeCloseTo(0.42, 10);
  });

  it("null si no hay ninguna fuente", () => {
    expect(weightedEvm({ ini: null, req: null, proj: null })).toBeNull();
  });

  it("una fuente en 0 sí cuenta (no se confunde con ausente)", () => {
    expect(weightedEvm({ ini: 0, req: 1, proj: 1 })).toBeCloseTo(0 * 0.1 + 1 * 0.2 + 1 * 0.7, 10);
  });
});

describe("vemCfg", () => {
  it("mapea el índice a la config visual de salud", () => {
    expect(vemCfg(1).label).toBe("On Track");
    expect(vemCfg(0.9).label).toBe("At Risk");
    expect(vemCfg(0.5).label).toBe("Off Track");
  });
});
