import { describe, it, expect } from "vitest";
import {
  mesesDesde, metodologiaMeses, metodologiaKey, metodologiaNota, metodologiaActual, metodologiaPromedioActual,
  metodologiaPersonas, esMesValido, METODOLOGIA_INICIO,
} from "./metodologia";

const d = (y: number, m: number, dia = 15) => new Date(y, m - 1, dia);

describe("mesesDesde / metodologiaMeses", () => {
  it("lista los meses de inicio a fin, cruzando el año", () => {
    expect(mesesDesde("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(mesesDesde("2026-10", "2026-10")).toEqual(["2026-10"]);
    expect(mesesDesde("2026-10", "2026-09")).toEqual([]);
  });

  it("cada mes nuevo agrega una columna; antes del inicio no hay ninguna", () => {
    expect(METODOLOGIA_INICIO).toBe("2026-10");
    expect(metodologiaMeses(d(2026, 10))).toEqual(["2026-10"]);
    expect(metodologiaMeses(d(2026, 12))).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(metodologiaMeses(d(2026, 9))).toEqual([]);
  });
});

describe("notas", () => {
  const califs = {
    [metodologiaKey("2026-10", "Luis Aguilar")]: { score: 85 },
    [metodologiaKey("2026-11", "Luis Aguilar")]: { score: 70 },
  };

  it("sin nota guardada un mes arranca en 100%", () => {
    expect(metodologiaNota(califs, "David Guzmán", "2026-10")).toBe(100);
    expect(metodologiaNota(califs, "Luis Aguilar", "2026-12")).toBe(100);
    expect(metodologiaNota(califs, "Luis Aguilar", "2026-10")).toBe(85);
  });

  it("la nota vigente es la del mes en curso: un mes nuevo vuelve a 100% aunque el anterior bajara", () => {
    expect(metodologiaActual(califs, "Luis Aguilar", d(2026, 10))).toBe(85);
    expect(metodologiaActual(califs, "Luis Aguilar", d(2026, 11))).toBe(70);
    expect(metodologiaActual(califs, "Luis Aguilar", d(2026, 12))).toBe(100); // diciembre recién abre
  });

  it("antes de que empiece la medición no hay nota vigente", () => {
    expect(metodologiaActual(califs, "Luis Aguilar", d(2026, 9))).toBeNull();
    expect(metodologiaPromedioActual(califs, ["Luis Aguilar"], d(2026, 9))).toBeNull();
  });

  it("el promedio del equipo usa la nota vigente de cada persona", () => {
    expect(metodologiaPromedioActual(califs, ["Luis Aguilar", "David Guzmán"], d(2026, 10))).toBe(93); // (85 + 100) / 2 = 92.5
  });
});

describe("metodologiaPersonas", () => {
  it("agrega a Cesar Vasquez al final y no lo duplica si ya es PM (sin importar tildes ni mayúsculas)", () => {
    expect(metodologiaPersonas(["Luis Aguilar", "David Guzmán"])).toEqual(["Luis Aguilar", "David Guzmán", "Cesar Vasquez"]);
    expect(metodologiaPersonas(["César Vásquez", "Luis Aguilar"])).toEqual(["César Vásquez", "Luis Aguilar"]);
  });
});

describe("esMesValido", () => {
  it("solo acepta YYYY-MM", () => {
    expect(esMesValido("2026-10")).toBe(true);
    expect(esMesValido("2026-13")).toBe(false);
    expect(esMesValido("2026-1")).toBe(false);
    expect(esMesValido(202610)).toBe(false);
  });
});
