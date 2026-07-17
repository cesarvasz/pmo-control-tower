import { describe, it, expect } from "vitest";
import { nextOrLatest, iniItemStatus, INI_ACTIVE_STS } from "./ini";
import { today } from "./business";
import type { IniItem, CalMap } from "@/types";

const daysFromToday = (n: number): Date => {
  const d = today();
  d.setDate(d.getDate() + n);
  return d;
};

describe("nextOrLatest", () => {
  const mk = (d: Date) => ({ inicio: d, fin: d });
  it("null para vacío o indefinido", () => {
    expect(nextOrLatest(undefined)).toBeNull();
    expect(nextOrLatest([])).toBeNull();
  });
  it("prefiere la próxima futura", () => {
    const past = mk(daysFromToday(-5));
    const future = mk(daysFromToday(5));
    expect(nextOrLatest([past, future])).toBe(future);
  });
  it("si todas son pasadas, devuelve la última", () => {
    const a = mk(daysFromToday(-10));
    const b = mk(daysFromToday(-2));
    expect(nextOrLatest([a, b])).toBe(b);
  });
});

const iniItem = (o: Partial<IniItem>): IniItem => ({
  id: "A", name: "Ini", grupo: "New", pm: "PM", status: "New", benefit: "",
  estado: "EN TIEMPO", dias: 1, limite: 10, deadline: null, creacion: null, ...o,
});
const emptyCal: CalMap = new Map();
const calWithM1: CalMap = new Map([["A", { M1: [{ inicio: new Date(), fin: new Date() }], M2: [] }]]);

describe("iniItemStatus", () => {
  it("ATRASADO → off-track", () => {
    expect(iniItemStatus(iniItem({ estado: "ATRASADO" }))).toBe("off-track");
  });
  it("activa sin reunión: <3 días hábiles = in-risk, ≥3 = off-track", () => {
    expect(iniItemStatus(iniItem({ dias: 1 }), emptyCal)).toBe("in-risk");
    expect(iniItemStatus(iniItem({ dias: 5 }), emptyCal)).toBe("off-track");
  });
  it("con reunión agendada → on-track", () => {
    expect(iniItemStatus(iniItem({ dias: 5 }), calWithM1)).toBe("on-track");
  });
  it("estado no activo → on-track", () => {
    expect(INI_ACTIVE_STS.has("PM Aprobado")).toBe(false);
    expect(iniItemStatus(iniItem({ status: "PM Aprobado", dias: 5 }), emptyCal)).toBe("on-track");
  });
});
