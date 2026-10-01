import { describe, it, expect } from "vitest";
import { buildVpaActions } from "./vpaActions";
import type { ProjItem, ReqItem } from "@/types";

const proj = (o: Partial<ProjItem>): ProjItem => ({
  boardId: "b", boardName: "PM-012 DUCAfast", id: "i", name: "", grupo: "", pm: "", resp: "",
  responsible: "", status: "", deadline: null, startDate: null, endDate: null, entrega: null,
  cost: 0, benefit: 0, valueNet: 0, estado: "EN TIEMPO", subitems: [], ...o,
}) as ProjItem;

const req = (o: Partial<ReqItem>): ReqItem => ({
  id: "r", name: "", grupo: "", pm: "", resp: "", status: "", estrategia: "", cku: "",
  costRH: 0, costSft: 0, benefit: 0, valueNet: 0, tld: "", type: "", cpmEndEst: null,
  creation: "", estado: "EN TIEMPO", deadline: null, inicioReq: null, inicio: null, dias: null,
  limite: null, elapsed: null, expectedDays: null, estDev: null, phases: [], onTime: {} as ReqItem["onTime"],
  benefitType: "", ev: 0, pv: 0, ac: 0, spi: null, cpi: null, scope: null, vem: null, ...o,
}) as ReqItem;

describe("buildVpaActions — Plan de beneficios acordados con CFO (fase 2)", () => {
  it("aparece aunque el status esté vacío, si está en la fase 2 y ya urge (atrasado/para hoy)", () => {
    const items = [
      proj({ id: "1", name: "Plan de beneficios acordados con CFO", grupo: "Aprobación | Value Gate", status: "", estado: "ATRASADO" }),
    ];
    const actions = buildVpaActions(items, []);
    expect(actions.map((a) => a.id)).toContain("pm-1");
    expect(actions[0].subtitle).toBe("Plan de beneficios acordados con CFO · Aprobación | Value Gate");
    expect(actions[0].done).toBe(false);
  });

  it("NO aparece con status vacío si todavía no urge (EN TIEMPO) — misma regla que cualquier Future Steps", () => {
    const actions = buildVpaActions(
      [proj({ id: "1b", name: "Plan de beneficios acordados con CFO", grupo: "Aprobación | Value Gate", status: "", estado: "EN TIEMPO" })],
      [],
    );
    expect(actions.map((a) => a.id)).not.toContain("pm-1b");
  });

  it("acepta otros nombres de la fase 2 (no solo 'Aprobación | Value Gate')", () => {
    for (const grupo of ["Aprobación | Value Gate", "Aprobación | Firma del Value Gate", "Value Gate"]) {
      const actions = buildVpaActions(
        [proj({ id: "x", name: "Plan de beneficios acordados con CFO", grupo, status: "", estado: "PARA HOY" })],
        [],
      );
      expect(actions.map((a) => a.id)).toContain("pm-x");
    }
  });

  it("NO aparece si el step 'CFO' está fuera de la fase 2 y sin status útil", () => {
    const actions = buildVpaActions(
      [proj({ id: "2", name: "Plan de beneficios acordados con CFO", grupo: "Launch | Lanzamiento", status: "" })],
      [],
    );
    expect(actions.map((a) => a.id)).not.toContain("pm-2");
  });

  it("marca done cuando el step CFO está en Done", () => {
    const actions = buildVpaActions(
      [proj({ id: "3", name: "Plan de beneficios acordados con CFO", grupo: "Aprobación | Value Gate", status: "Done" })],
      [],
    );
    expect(actions.find((a) => a.id === "pm-3")?.done).toBe(true);
  });
});

describe("buildVpaActions — regresión", () => {
  it("incluye los otros steps del VPA solo en Working on it / Done", () => {
    const items = [
      proj({ id: "a", name: "VPA valida Business Case", grupo: "Valuación | Formulación del proyecto", status: "Working on it" }),
      proj({ id: "b", name: "VPA valida Business Case", grupo: "Valuación | Formulación del proyecto", status: "Stuck" }),
      proj({ id: "c", name: "Value Gate (BC) - Firmado y aprobado", grupo: "Aprobación | Value Gate", status: "Done" }),
      proj({ id: "d", name: "Kick off", grupo: "Valuación | Formulación del proyecto", status: "Working on it" }),
    ];
    const ids = buildVpaActions(items, []).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["pm-a", "pm-c"]));
    expect(ids).not.toContain("pm-b");
    expect(ids).not.toContain("pm-d");
  });

  it("incluye cualquier item de fase 1/2/5 con César Vásquez como Responsible, sin importar el nombre del step", () => {
    const items = [
      proj({ id: "e", name: "Cierre VMO (VPA) del proyecto", grupo: "Revisión | Cierre ROI", responsible: "César Vásquez", status: "Future steps", estado: "ATRASADO" }),
      proj({ id: "f", name: "Benefit Owner certifica realización", grupo: "Revisión | Cierre ROI", responsible: "César Vásquez", status: "Stuck" }),
      proj({ id: "g", name: "Otro item cualquiera", grupo: "Launch | Lanzamiento", responsible: "César Vásquez", status: "Working on it" }), // fase 3 → excluido
      proj({ id: "h", name: "Otro item cualquiera", grupo: "Valuación | Formulación del proyecto", responsible: "Luis Aguilar", status: "Stuck" }), // otro responsible → excluido
    ];
    const ids = buildVpaActions(items, []).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["pm-e", "pm-f"]));
    expect(ids).not.toContain("pm-g");
    expect(ids).not.toContain("pm-h");
  });

  it("un 'Future steps' sin urgencia (EN TIEMPO) no cuenta; atrasado o para hoy sí", () => {
    const items = [
      proj({ id: "j", name: "VPA CONFIRMADO a 90 dias", grupo: "Revisión | Cierre ROI", responsible: "César Vásquez", status: "Future steps", estado: "EN TIEMPO" }),
      proj({ id: "k", name: "VPA CONFIRMADO a 60 dias", grupo: "Revisión | Cierre ROI", responsible: "César Vásquez", status: "Future steps", estado: "ATRASADO" }),
      proj({ id: "l", name: "VPA CONFIRMADO a 30 dias", grupo: "Revisión | Cierre ROI", responsible: "César Vásquez", status: "Future steps", estado: "PARA HOY" }),
    ];
    const ids = buildVpaActions(items, []).map((a) => a.id);
    expect(ids).not.toContain("pm-j");
    expect(ids).toEqual(expect.arrayContaining(["pm-k", "pm-l"]));
  });

  it("un status VACÍO (Monday lo pinta como Future Steps) sin urgencia tampoco cuenta (regresión PM-011)", () => {
    const items = [
      proj({ id: "m", name: "Cierre VMO (VPA) del proyecto", grupo: "Revisión | Cierre ROI", responsible: "César Vásquez", status: "", estado: "EN TIEMPO" }),
      proj({ id: "n", name: "Cierre VMO (VPA) del proyecto", grupo: "Revisión | Cierre ROI", responsible: "César Vásquez", status: "", estado: "ATRASADO" }),
    ];
    const ids = buildVpaActions(items, []).map((a) => a.id);
    expect(ids).not.toContain("pm-m");
    expect(ids).toContain("pm-n");
  });

  it("un item de César en Done no cuenta como pendiente (solo historial)", () => {
    const actions = buildVpaActions([
      proj({ id: "i", name: "VPA APROBADO", grupo: "Aprobación | Value Gate", responsible: "César Vásquez", status: "Done" }),
    ], []);
    const a = actions.find((x) => x.id === "pm-i");
    expect(a?.done).toBe(true);
  });

  it("incluye REQ en fase 2 y fase 6", () => {
    const actions = buildVpaActions([], [
      req({ id: "1", name: "REQ A", grupo: "Aprobación" }),
      req({ id: "2", name: "REQ B", grupo: "Cierre ROI" }),
      req({ id: "3", name: "REQ C", grupo: "Desarrollo" }),
    ]);
    const ids = actions.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["req-1", "req-2"]));
    expect(ids).not.toContain("req-3");
  });
});
