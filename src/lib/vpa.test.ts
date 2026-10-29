import { describe, it, expect } from "vitest";
import {
  VPA_INDICADORES, VPA_INICIO, VPA_PESO_TOTAL, conNotaVpa, esIndicadorVpa, leerCalifVpa, normalizarNotaVpa, puntosVpa, vpaMeses,
} from "./vpa";

const TODOS = (n: number) => Object.fromEntries(VPA_INDICADORES.map((i) => [i.key, n]));

describe("catálogo de indicadores", () => {
  it("son los 5 de «Objetivos de Calidad», con meta 100% y pesos 20 · 20 · 20 · 25 · 15 que suman 100", () => {
    expect(VPA_INDICADORES.map((i) => i.indicador)).toEqual([
      "Entrega de reportes Claves", "Optimización de Negocio", "Calidad & Consistencia de los Datos",
      "Control del Portafolio", "Cumplimiento Metodología VALOR",
    ]);
    expect(VPA_INDICADORES.map((i) => i.peso)).toEqual([20, 20, 20, 25, 15]);
    expect(VPA_INDICADORES.every((i) => i.meta === 100)).toBe(true);
    expect(VPA_PESO_TOTAL).toBe(100);
  });

  it("agrupa en Requisitos del Cliente (2) y Productividad (3)", () => {
    expect(VPA_INDICADORES.filter((i) => i.objetivo === "Requisitos del Cliente")).toHaveLength(2);
    expect(VPA_INDICADORES.filter((i) => i.objetivo === "Productividad")).toHaveLength(3);
  });

  it("las claves son únicas y esIndicadorVpa solo reconoce las del catálogo", () => {
    const keys = VPA_INDICADORES.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(esIndicadorVpa("control-portafolio")).toBe(true);
    expect(esIndicadorVpa("otro")).toBe(false);
    expect(esIndicadorVpa(undefined)).toBe(false);
  });
});

describe("vpaMeses", () => {
  it("va de VPA_INICIO al mes en curso, cronológico", () => {
    expect(VPA_INICIO).toBe("2026-10");
    expect(vpaMeses(new Date(2026, 9, 29))).toEqual(["2026-10"]);
    expect(vpaMeses(new Date(2027, 1, 3))).toEqual(["2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("antes del primer mes no hay columnas", () => {
    expect(vpaMeses(new Date(2026, 8, 30))).toEqual([]);
  });
});

describe("normalizarNotaVpa", () => {
  it("acepta de 0 a 100 y redondea a 2 decimales", () => {
    expect(normalizarNotaVpa(0)).toBe(0);
    expect(normalizarNotaVpa(100)).toBe(100);
    expect(normalizarNotaVpa(87.456)).toBe(87.46);
  });

  it("rechaza lo que no sea un número entre 0 y 100", () => {
    for (const v of [-1, 100.01, NaN, Infinity, "90", null, undefined, {}]) expect(normalizarNotaVpa(v)).toBeNull();
  });
});

describe("puntosVpa (total ponderado del mes)", () => {
  it("todo en 100 vale 100; todo en 0 vale 0", () => {
    expect(puntosVpa(TODOS(100))).toMatchObject({ puntos: 100, completo: true, calificados: 5, logro: 1 });
    expect(puntosVpa(TODOS(0))).toMatchObject({ puntos: 0, completo: true, logro: 0 });
  });

  it("suma nota × peso ÷ 100 de cada indicador", () => {
    const p = puntosVpa({ "reportes-claves": 90, "optimizacion-negocio": 80, "calidad-datos": 100, "control-portafolio": 60, "metodologia-valor": 100 });
    // 18 + 16 + 20 + 15 + 15
    expect(p.puntos).toBeCloseTo(84, 5);
    expect(p.completo).toBe(true);
  });

  it("un mes a medias cuenta solo lo calificado: puntos, peso calificado y logro sobre ese peso", () => {
    const p = puntosVpa({ "reportes-claves": 50, "control-portafolio": 100 });   // 10 + 25 de 20 + 25 de peso
    expect(p.puntos).toBeCloseTo(35, 5);
    expect(p.pesoCalificado).toBe(45);
    expect(p.calificados).toBe(2);
    expect(p.completo).toBe(false);
    expect(p.logro).toBeCloseTo(35 / 45, 5);
  });

  it("sin notas no hay logro (no es un 0%)", () => {
    expect(puntosVpa(undefined)).toMatchObject({ puntos: 0, calificados: 0, logro: null, completo: false });
    expect(puntosVpa({})).toMatchObject({ calificados: 0, logro: null });
  });

  it("un 0 calificado cuenta (es una nota), a diferencia de un indicador vacío", () => {
    expect(puntosVpa({ "reportes-claves": 0 })).toMatchObject({ calificados: 1, puntos: 0, logro: 0 });
  });
});

describe("leerCalifVpa / conNotaVpa", () => {
  it("lee las notas válidas y descarta lo ilegible o de indicadores que ya no existen", () => {
    const c = leerCalifVpa({ notas: { "reportes-claves": 90, "calidad-datos": "x", "control-portafolio": 120, viejo: 50 }, by: "a@c807.com", at: "2026-10-29" });
    expect(c).toEqual({ notas: { "reportes-claves": 90 }, by: "a@c807.com", at: "2026-10-29" });
  });

  it("un doc vacío o roto queda sin notas", () => {
    expect(leerCalifVpa(undefined)).toEqual({ notas: {} });
    expect(leerCalifVpa({ notas: "nada" })).toEqual({ notas: {} });
  });

  it("conNotaVpa pone, cambia y quita una nota sin tocar la original ni los demás indicadores", () => {
    const base = { "2026-10": { notas: { "reportes-claves": 80 } } };
    const a = conNotaVpa(base, "2026-10", "calidad-datos", 95);
    expect(a["2026-10"].notas).toEqual({ "reportes-claves": 80, "calidad-datos": 95 });
    expect(base["2026-10"].notas).toEqual({ "reportes-claves": 80 });
    expect(conNotaVpa(a, "2026-10", "reportes-claves", 70)["2026-10"].notas["reportes-claves"]).toBe(70);
    expect(conNotaVpa(a, "2026-10", "reportes-claves", null)["2026-10"].notas).toEqual({ "calidad-datos": 95 });
  });

  it("conNotaVpa crea el mes si no existía", () => {
    expect(conNotaVpa({}, "2026-11", "control-portafolio", 100)).toEqual({ "2026-11": { notas: { "control-portafolio": 100 } } });
  });
});
