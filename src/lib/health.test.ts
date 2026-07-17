import { describe, it, expect } from "vitest";
import { calcVem, healthStatusFromIndex, vemCfg } from "./health";

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

describe("vemCfg", () => {
  it("mapea el índice a la config visual de salud", () => {
    expect(vemCfg(1).label).toBe("On Track");
    expect(vemCfg(0.9).label).toBe("At Risk");
    expect(vemCfg(0.5).label).toBe("Off Track");
  });
});
