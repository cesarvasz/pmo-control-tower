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
  it("aparece aunque el status esté vacío, si está en la fase 2", () => {
    const items = [
      proj({ id: "1", name: "Plan de beneficios acordados con CFO", grupo: "Aprobación | Value Gate", status: "" }),
    ];
    const actions = buildVpaActions(items, []);
    expect(actions.map((a) => a.id)).toContain("pm-1");
    expect(actions[0].subtitle).toBe("Plan de beneficios acordados con CFO · Aprobación | Value Gate");
    expect(actions[0].done).toBe(false);
  });

  it("acepta otros nombres de la fase 2 (no solo 'Aprobación | Value Gate')", () => {
    for (const grupo of ["Aprobación | Value Gate", "Aprobación | Firma del Value Gate", "Value Gate"]) {
      const actions = buildVpaActions(
        [proj({ id: "x", name: "Plan de beneficios acordados con CFO", grupo, status: "" })],
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
