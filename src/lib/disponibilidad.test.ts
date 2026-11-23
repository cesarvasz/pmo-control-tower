import { describe, expect, it } from "vitest";
import { añosSinAsuetos, bloquesDelDia, chocaCon, diasLaborales, huecosLibres, minutosDelDia, unirOcupados } from "@/lib/disponibilidad";

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

describe("agenda de un día por persona", () => {
  // 2026-11-16 (lunes). 9:00 GT = 15:00Z
  const dia = "2026-11-16";
  it("minutosDelDia cuenta desde la medianoche de Guatemala", () => {
    expect(minutosDelDia(dia, "2026-11-16T15:00:00Z")).toBe(9 * 60);
  });
  it("une, recorta a la ventana y descarta lo de otros días", () => {
    const b = bloquesDelDia(dia, [
      { inicio: "2026-11-16T15:00:00Z", fin: "2026-11-16T16:00:00Z" }, // 9–10
      { inicio: "2026-11-16T15:30:00Z", fin: "2026-11-16T16:30:00Z" }, // 9:30–10:30 (se une)
      { inicio: "2026-11-16T12:00:00Z", fin: "2026-11-16T14:00:00Z" }, // 6–8 → 7–8
      { inicio: "2026-11-17T15:00:00Z", fin: "2026-11-17T16:00:00Z" }, // otro día
    ]);
    expect(b).toEqual([[7 * 60, 8 * 60], [9 * 60, 10.5 * 60]]);
  });
  it("chocaCon: toca solo si se traslapan (bordes no cuentan)", () => {
    const b: [number, number][] = [[540, 600]];
    expect(chocaCon(b, 600, 660)).toBe(false);
    expect(chocaCon(b, 480, 540)).toBe(false);
    expect(chocaCon(b, 570, 630)).toBe(true);
  });
});
