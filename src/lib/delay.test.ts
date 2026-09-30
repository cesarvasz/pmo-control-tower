import { describe, it, expect } from "vitest";
import { atrasoReparto, foldAtrasoTramos, savedAtrasoTramos } from "./delay";

describe("savedAtrasoTramos", () => {
  it("sin detalle → [] (no inventa 'Sin asignar')", () => {
    expect(savedAtrasoTramos(undefined, 5)).toEqual([]);
  });
  it("responsable legacy → un tramo con TODOS los días", () => {
    expect(savedAtrasoTramos({ responsable: "PM" }, 5)).toEqual([{ dias: 5, resp: "PM" }]);
  });
  it("reparto guardado se devuelve tal cual", () => {
    const reparto = [{ dias: 2, resp: "VPA" }, { dias: 3, resp: "PM" }];
    expect(savedAtrasoTramos({ reparto }, 5)).toBe(reparto);
  });
});

describe("foldAtrasoTramos", () => {
  it("un solo tramo SIN marcar → NO se autocompleta (podría ser un desglose a medias, no se adivina)", () => {
    const base = [{ dias: 5, resp: "PM" }];
    expect(foldAtrasoTramos(base, 8)).toBe(base);
  });

  it("un solo tramo marcado 'actual' → el remanente se le suma", () => {
    const r = foldAtrasoTramos([{ dias: 5, resp: "PM", actual: true }], 8);
    expect(r).toEqual([{ dias: 8, resp: "PM", actual: true }]);
  });

  it("2+ tramos, uno marcado 'actual' → el remanente se le suma SOLO a ese", () => {
    const r = foldAtrasoTramos(
      [{ dias: 2, resp: "VPA" }, { dias: 3, resp: "PM", actual: true }],
      8,
    );
    expect(r).toEqual([{ dias: 2, resp: "VPA" }, { dias: 6, resp: "PM", actual: true }]);
  });

  it("la etiqueta es única: si por error hay 2 tramos marcados 'actual', solo se usa el PRIMERO", () => {
    const r = foldAtrasoTramos(
      [{ dias: 2, resp: "VPA", actual: true }, { dias: 3, resp: "PM", actual: true }],
      8,
    );
    expect(r).toEqual([{ dias: 5, resp: "VPA", actual: true }, { dias: 3, resp: "PM", actual: true }]);
  });

  it("2+ tramos, ninguno marcado → no adivina, devuelve tal cual (remanente queda fuera)", () => {
    const base = [{ dias: 2, resp: "VPA" }, { dias: 3, resp: "PM" }];
    expect(foldAtrasoTramos(base, 8)).toBe(base);
  });

  it("sin remanente (ya repartido completo) → tal cual, sin tocar nada", () => {
    const base = [{ dias: 5, resp: "PM" }];
    expect(foldAtrasoTramos(base, 5)).toBe(base);
  });

  it("[] (nunca se asignó nada) → [] (no hay dónde plegar el remanente)", () => {
    expect(foldAtrasoTramos([], 5)).toEqual([]);
  });
});

describe("atrasoReparto (efectivo, para agregación)", () => {
  it("un solo tramo guardado SIN marcar 'actual' → el remanente aparece como 'Sin asignar' (no se traga un desglose a medias)", () => {
    const r = atrasoReparto({ reparto: [{ dias: 5, resp: "PM" }] }, 9);
    expect(r).toEqual([{ dias: 5, resp: "PM" }, { dias: 4, resp: "Sin asignar" }]);
  });

  it("un solo tramo marcado 'actual' → crece solo con los días nuevos, sin quedar 'Sin asignar'", () => {
    const r = atrasoReparto({ reparto: [{ dias: 5, resp: "PM", actual: true }] }, 9);
    expect(r).toEqual([{ dias: 9, resp: "PM", actual: true }]);
  });

  it("2+ tramos con uno marcado 'actual' → el remanente diario se acredita ahí, no aparece 'Sin asignar'", () => {
    const det = { reparto: [{ dias: 2, resp: "VPA" }, { dias: 3, resp: "PM", actual: true }] };
    const r = atrasoReparto(det, 9);
    expect(r.find((x) => x.resp === "Sin asignar")).toBeUndefined();
    expect(r.find((x) => x.resp === "PM")?.dias).toBe(7); // 3 + (9 - 5)
    expect(r.reduce((s, x) => s + x.dias, 0)).toBe(9);
  });

  it("2+ tramos sin marcar → el remanente SÍ aparece como 'Sin asignar' (ambiguo, no se adivina)", () => {
    const det = { reparto: [{ dias: 2, resp: "VPA" }, { dias: 3, resp: "PM" }] };
    const r = atrasoReparto(det, 9);
    expect(r).toContainEqual({ dias: 4, resp: "Sin asignar" });
  });

  it("responsable legacy (sin reparto) sigue funcionando igual que antes", () => {
    expect(atrasoReparto({ responsable: "CKU" }, 4)).toEqual([{ dias: 4, resp: "CKU" }]);
  });

  it("sin ningún detalle → un tramo 'Sin asignar' con todos los días", () => {
    expect(atrasoReparto(undefined, 4)).toEqual([{ dias: 4, resp: "Sin asignar" }]);
  });
});
