import { describe, it, expect } from "vitest";
import { esSponsorDe, nombreDeEmail, scopeToSponsor } from "./sponsorScope";
import { esRolSponsor } from "./permissions";
import type { DashboardData, EstrategiaInfo, NpsRecord } from "@/types";

const directorio = [
  { name: "Patricia López", email: "PLopez@c807.com" },
  { name: "Aaron Herwing", email: "aherwing@c807.com" },
];

describe("nombreDeEmail / esRolSponsor", () => {
  it("liga el correo con su nombre en el Directorio sin importar mayúsculas ni espacios", () => {
    expect(nombreDeEmail(directorio, "  plopez@C807.com ")).toBe("Patricia López");
    expect(nombreDeEmail(directorio, "desconocido@c807.com")).toBeNull();
    expect(nombreDeEmail(directorio, "")).toBeNull();
  });

  it("esRolSponsor reconoce el rol por nombre", () => {
    for (const r of ["Sponsor", "sponsor", " SPONSOR "]) expect(esRolSponsor(r)).toBe(true);
    for (const r of ["CKU", "PM", "Sponsor Senior", "", undefined]) expect(esRolSponsor(r)).toBe(false);
  });
});

describe("esSponsorDe", () => {
  it("compara por nombre completo, sin acentos ni mayúsculas", () => {
    expect(esSponsorDe("Patricia López", "patricia lopez")).toBe(true);
    expect(esSponsorDe("Patricia López", "Aaron Herwing")).toBe(false);
  });

  it("un valor con varias personas cuenta si alguna es el Sponsor (separadas por coma o punto y coma)", () => {
    expect(esSponsorDe("Aaron Herwing, Patricia López", "Patricia López")).toBe(true);
    expect(esSponsorDe("Aaron Herwing; Patricia López", "Aaron Herwing")).toBe(true);
  });

  it("no hace match parcial (Ana ≠ Ana María) ni con vacíos", () => {
    expect(esSponsorDe("Ana María Ruiz", "Ana")).toBe(false);
    expect(esSponsorDe("", "Patricia López")).toBe(false);
    expect(esSponsorDe(undefined, "Patricia López")).toBe(false);
    expect(esSponsorDe("Patricia López", "")).toBe(false);
  });
});

describe("scopeToSponsor", () => {
  const est = (sponsor: string): EstrategiaInfo => ({ uNeg: "", pais: "", sponsor });
  const rec = (reqId: string): NpsRecord => ({
    answers: { nps: 10 }, pm: "", invalidated: false, respondentEmail: "", submittedAt: "", reqCode: "", reqId,
  });

  // Claves del mapa en forma normalizada (como las arma buildEstrategiaMap).
  const data = {
    ini: [{ id: "I1", sponsor: "Patricia López" }, { id: "I2", sponsor: "Aaron Herwing" }, { id: "I3", sponsor: "" }],
    req: [{ id: "R1", estrategia: "Estrategia A" }, { id: "R2", estrategia: "Estrategia B" }, { id: "R3", estrategia: "" }],
    projBoards: [{ id: "b1", sponsor: "Patricia López" }, { id: "b2", sponsor: "Aaron Herwing" }],
    proj: [
      { id: "p1", boardId: "b1", name: "Kick Off", subitems: [] },
      { id: "p2", boardId: "b1", name: "Encuesta para NPS", subitems: [{ id: "s1" }] },
      { id: "p3", boardId: "b2", name: "Kick Off", subitems: [] },
    ],
    npsRecords: [rec("R1"), rec("R2"), rec("s1"), rec("otro")],
    estrategiaMap: new Map([["estrategia a", est("Patricia López")], ["estrategia b", est("Aaron Herwing")]]),
    nps: { nps: 0 },
  } as unknown as DashboardData;

  it("deja solo lo ligado al Sponsor: Iniciativas, PML (vía su Estrategia) y Proyectos con sus items", () => {
    const s = scopeToSponsor(data, "Patricia López");
    expect(s.ini.map((i) => i.id)).toEqual(["I1"]);
    expect(s.req.map((r) => r.id)).toEqual(["R1"]);
    expect(s.projBoards.map((b) => b.id)).toEqual(["b1"]);
    expect(s.proj.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("las encuestas de NPS se recortan a sus PML y a los steps de encuesta de sus proyectos, y el NPS se recalcula", () => {
    const s = scopeToSponsor(data, "Patricia López");
    expect(s.npsRecords.map((r) => r.reqId).sort()).toEqual(["R1", "s1"]);
    expect(s.nps.total).toBe(2); // recalculado, no el que traía `data`
  });

  it("un PML sin Estrategia (o con una que no está en el mapa) no se le muestra a nadie", () => {
    const s = scopeToSponsor(data, "Aaron Herwing");
    expect(s.req.map((r) => r.id)).toEqual(["R2"]); // R3 sin estrategia queda fuera
  });

  it("sin nombre (el correo no está en el Directorio) no se muestra nada — nunca todo por omisión", () => {
    const s = scopeToSponsor(data, null);
    expect(s.ini).toEqual([]);
    expect(s.req).toEqual([]);
    expect(s.projBoards).toEqual([]);
    expect(s.proj).toEqual([]);
    expect(s.npsRecords).toEqual([]);
  });

  it("no modifica el dashboard original", () => {
    scopeToSponsor(data, "Patricia López");
    expect(data.ini).toHaveLength(3);
    expect(data.proj).toHaveLength(3);
  });
});
