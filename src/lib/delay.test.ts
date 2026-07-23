import { describe, it, expect } from "vitest";
import { countByResponsible, RESPONSIBLE_COLOR } from "./delay";
import type { DelayMap } from "./delay";

describe("countByResponsible", () => {
  it("agrupa por responsable; sin atribución cae en 'Sin asignar'", () => {
    const map: DelayMap = { "1": { responsible: "VPA" }, "2": { responsible: "PM" } };
    expect(countByResponsible(["1", "2", "3"], map)).toEqual({ VPA: 1, PM: 1, "Sin asignar": 1 });
  });

  it("cuenta repeticiones del mismo responsable", () => {
    const map: DelayMap = { "1": { responsible: "PM" }, "2": { responsible: "PM" }, "3": { responsible: "PM" } };
    expect(countByResponsible(["1", "2", "3"], map)).toEqual({ PM: 3 });
  });

  it("lista vacía → objeto vacío", () => {
    expect(countByResponsible([], {})).toEqual({});
  });
});

describe("RESPONSIBLE_COLOR", () => {
  it("tiene una entrada para cada responsable posible + Sin asignar", () => {
    for (const k of ["VPA", "CKU", "PM", "Sponsor", "Desarrollador", "BRM", "Sin reproceso", "Sin asignar"]) {
      expect(RESPONSIBLE_COLOR[k]).toBeDefined();
    }
  });
});
