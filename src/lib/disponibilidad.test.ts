import { describe, expect, it } from "vitest";
import { añosSinAsuetos, diasLaborales, huecosLibres, unirOcupados } from "@/lib/disponibilidad";

const sinAsuetos = new Set<string>();
// 2026-11-16 es lunes. Guatemala = UTC-6: 8:00 local = 14:00Z.
const LUN = "2026-11-16";
const z = (dia: string, h: number, m = 0) => `${dia}T${String(h + 6).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
const ANTES = Date.parse("2026-11-01T00:00:00Z");

describe("diasLaborales", () => {
  it("solo lunes a viernes y sin asuetos", () => {
    expect(diasLaborales("2026-11-13", "2026-11-17", sinAsuetos)).toEqual(["2026-11-13", "2026-11-16", "2026-11-17"]);
    expect(diasLaborales("2026-12-24", "2026-12-28", new Set(["2026-12-25"]))).toEqual(["2026-12-24", "2026-12-28"]);
  });
  it("rangos inválidos o invertidos → vacío", () => {
    expect(diasLaborales("x", "2026-11-17", sinAsuetos)).toEqual([]);
    expect(diasLaborales("2026-11-17", "2026-11-16", sinAsuetos)).toEqual([]);
  });
});

describe("unirOcupados", () => {
  it("une solapados y pegados; ignora basura", () => {
    const r = unirOcupados([
      { inicio: z(LUN, 10), fin: z(LUN, 11) }, { inicio: z(LUN, 8), fin: z(LUN, 9) }, { inicio: z(LUN, 9), fin: z(LUN, 9, 30) },
      { inicio: "mal", fin: z(LUN, 12) }, { inicio: z(LUN, 13), fin: z(LUN, 13) },
    ]);
    expect(r).toEqual([[Date.parse(z(LUN, 8)), Date.parse(z(LUN, 9, 30))], [Date.parse(z(LUN, 10)), Date.parse(z(LUN, 11))]]);
  });
});

describe("huecosLibres", () => {
  const base = { desde: LUN, hasta: LUN, duracionMin: 60, asuetos: sinAsuetos, ahoraMs: ANTES };
  it("día libre: de 8:00 a 17:00 cada 30 min, nada que termine después de las 18:00", () => {
    const h = huecosLibres({ ...base, ocupados: [], max: 100 });
    expect(h[0]).toEqual({ inicio: z(LUN, 8), fin: z(LUN, 9) });
    expect(h[h.length - 1]).toEqual({ inicio: z(LUN, 17), fin: "2026-11-17T00:00:00.000Z" });
    expect(h).toHaveLength(19);
  });
  it("respeta lo ocupado (un hueco no puede rozar un evento)", () => {
    const h = huecosLibres({ ...base, ocupados: [{ inicio: z(LUN, 9), fin: z(LUN, 10) }], max: 100 }).map((x) => x.inicio);
    expect(h).toContain(z(LUN, 8));
    expect(h).not.toContain(z(LUN, 8, 30)); // 8:30–9:30 choca
    expect(h).not.toContain(z(LUN, 9));
    expect(h).not.toContain(z(LUN, 9, 30));
    expect(h).toContain(z(LUN, 10));
  });
  it("no sugiere el pasado ni sábados, domingos o asuetos", () => {
    const hoyAlas10 = Date.parse(z(LUN, 10));
    expect(huecosLibres({ ...base, ocupados: [], ahoraMs: hoyAlas10, max: 100 })[0].inicio).toBe(z(LUN, 10));
    expect(huecosLibres({ ...base, desde: "2026-11-14", hasta: "2026-11-15", ocupados: [] })).toEqual([]);
    expect(huecosLibres({ ...base, ocupados: [], asuetos: new Set([LUN]) })).toEqual([]);
  });
  it("respeta el tope, el paso y la duración", () => {
    expect(huecosLibres({ ...base, ocupados: [], max: 3 })).toHaveLength(3);
    const h = huecosLibres({ ...base, duracionMin: 30, pasoMin: 15, ocupados: [], max: 100 });
    expect(h[1].inicio).toBe(z(LUN, 8, 15));
    expect(huecosLibres({ ...base, duracionMin: 11 * 60, ocupados: [] })).toEqual([]);
    expect(huecosLibres({ ...base, duracionMin: 0, ocupados: [] })).toEqual([]);
  });
});

describe("añosSinAsuetos", () => {
  it("avisa de los años sin asuetos cargados", () => {
    const a = new Set(["2026-01-01"]);
    expect(añosSinAsuetos("2026-12-20", "2027-01-05", a)).toEqual([2027]);
    expect(añosSinAsuetos("2026-02-01", "2026-03-01", a)).toEqual([]);
  });
});
