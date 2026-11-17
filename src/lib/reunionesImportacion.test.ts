import { describe, expect, it } from "vitest";
import { aImportable, llaveReunion, planImportacion, unirCalendarios } from "@/lib/reunionesImportacion";

const e = (codigo: string, meeting: string, inicio: string, fin: string) => ({ codigo, meeting, inicio, fin });
const A = e("IN-120", "M1", "2026-11-20T16:00:00.000Z", "2026-11-20T17:00:00.000Z");

describe("aImportable", () => {
  it("normaliza código, tipo y fechas", () => {
    expect(aImportable(e(" in-120 ", "m2", "2026-11-20T10:00:00-06:00", "2026-11-20T11:00:00-06:00"))).toEqual({
      codigo: "IN-120", tipo: "M2", inicio: "2026-11-20T16:00:00.000Z", fin: "2026-11-20T17:00:00.000Z",
    });
  });
  it("descarta lo que no sirve", () => {
    for (const x of [e("120", "M1", A.inicio, A.fin), e("IN-1", "M3", A.inicio, A.fin), e("IN-1", "M1", "no", A.fin), e("IN-1", "M1", A.fin, A.inicio), e("IN-1", "M1", A.inicio, A.inicio)]) {
      expect(aImportable(x)).toBeNull();
    }
  });
});

describe("planImportacion", () => {
  it("separa nuevas, ya guardadas, repetidas e inválidas", () => {
    const B = e("IN-121", "M2", "2026-11-23T16:00:00.000Z", "2026-11-23T17:00:00.000Z");
    const existentes = new Set([llaveReunion("IN-121", "M2", B.inicio)]);
    const p = planImportacion([A, { ...A }, B, e("xx", "M1", A.inicio, A.fin)], existentes);
    expect(p.nuevas).toHaveLength(1);
    expect(p.nuevas[0].codigo).toBe("IN-120");
    expect(p).toMatchObject({ yaEstaban: 1, repetidas: 1, invalidas: 1 });
  });
  it("es idempotente: lo importado la primera vez ya no es nuevo la segunda", () => {
    const primera = planImportacion([A], new Set());
    const segunda = planImportacion([A], new Set(primera.nuevas.map((n) => llaveReunion(n.codigo, n.tipo, n.inicio))));
    expect(primera.nuevas).toHaveLength(1);
    expect(segunda.nuevas).toHaveLength(0);
    expect(segunda.yaEstaban).toBe(1);
  });
  it("la misma hora escrita con otra zona es la misma reunión", () => {
    expect(llaveReunion("IN-120", "M1", "2026-11-20T10:00:00-06:00")).toBe(llaveReunion("in-120", "m1", "2026-11-20T16:00:00.000Z"));
  });
});

describe("unirCalendarios", () => {
  it("no repite la misma reunión que viene de la base y del Apps Script", () => {
    const igual = { ...A, inicio: "2026-11-20T10:00:00-06:00" };
    const otra = e("IN-9", "M1", "2026-11-21T16:00:00.000Z", "2026-11-21T17:00:00.000Z");
    expect(unirCalendarios([A], [igual, otra])).toEqual([A, otra]);
  });
});
