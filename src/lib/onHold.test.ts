import { describe, it, expect } from "vitest";
import {
  aplicarOnHold, cantidadOnHold, conMotivoOnHold, conOnHold, enOnHold, esTipoOnHold, estaEnOnHold, leerOnHold, MOTIVO_ON_HOLD_MAX,
  normalizarIdOnHold, normalizarMotivoOnHold, onHoldVacio,
} from "./onHold";
import type { DashboardData, NpsRecord, OnHoldDoc } from "@/types";

const ent = { by: "admin@c807.com", at: "2026-10-28T10:00:00.000Z", motivo: "Cliente pausó el proyecto" };

const rec = (reqId: string, score: number): NpsRecord => ({
  answers: { nps: score }, pm: "", invalidated: false, respondentEmail: "", submittedAt: "", reqCode: "", reqId,
});

const base = (onHold: OnHoldDoc) => ({
  ini: [{ id: "I1" }],
  req: [{ id: "R1", pm: "Ana" }, { id: "R2", pm: "Ana" }],
  projBoards: [{ id: "b1", name: "PM-001", pm: "Ana" }, { id: "b2", name: "PM-002", pm: "Luis" }],
  proj: [
    { id: "p1", boardId: "b1", name: "Kick Off", subitems: [] },
    { id: "p2", boardId: "b1", name: "Encuesta para NPS", subitems: [{ id: "s1" }] },
    { id: "p3", boardId: "b2", name: "Kick Off", subitems: [] },
    { id: "p4", boardId: "b2", name: "Encuesta para NPS", subitems: [{ id: "s2" }] },
  ],
  projItemBaselines: {
    p1: { boardId: "b1", cost: 10, savedAt: "" },
    p3: { boardId: "b2", cost: 20, savedAt: "" },
  },
  npsRecords: [rec("R1", 10), rec("R2", 0), rec("s1", 0), rec("s2", 10), rec("", 10)],
  nps: { nps: 0, total: 5 },
  onHold,
}) as unknown as DashboardData;

describe("leerOnHold", () => {
  it("sin documento (o con basura) no hay nada en On Hold", () => {
    for (const raw of [undefined, null, 5, "x", [], {}, { proyectos: 3, pml: "x" }]) {
      expect(leerOnHold(raw)).toEqual({ proyectos: {}, pml: {} });
    }
  });

  it("lee proyectos y PML con quién, cuándo y por qué; lo incompleto se rellena con vacío", () => {
    const d = leerOnHold({ proyectos: { b1: ent, b2: {} }, pml: { R1: { by: "x@c807.com" } } });
    expect(d.proyectos.b1).toEqual(ent);
    expect(d.proyectos.b2).toEqual({ by: "", at: "", motivo: "" });
    expect(d.pml.R1).toEqual({ by: "x@c807.com", at: "", motivo: "" });
  });

  it("descarta ids que no sirven de llave", () => {
    const d = leerOnHold({ proyectos: { "a.b": ent, "": ent, ok_1: ent } });
    expect(Object.keys(d.proyectos)).toEqual(["ok_1"]);
  });
});

describe("normalizarIdOnHold / esTipoOnHold", () => {
  it("acepta ids de Monday y rechaza lo demás", () => {
    expect(normalizarIdOnHold("18413204916")).toBe("18413204916");
    for (const x of ["", "a.b", "a/b", "a b", 12, null, undefined, "x".repeat(65)]) expect(normalizarIdOnHold(x)).toBeNull();
  });

  it("solo proyecto o pml", () => {
    expect(esTipoOnHold("proyecto")).toBe(true);
    expect(esTipoOnHold("pml")).toBe(true);
    expect(esTipoOnHold("req")).toBe(false);
    expect(esTipoOnHold(undefined)).toBe(false);
  });
});

describe("conOnHold / estaEnOnHold / cantidadOnHold", () => {
  it("pone y quita sin tocar el original", () => {
    const a = onHoldVacio();
    const b = conOnHold(a, "proyecto", "b1", true, ent);
    expect(estaEnOnHold(a, "proyecto", "b1")).toBe(false);
    expect(estaEnOnHold(b, "proyecto", "b1")).toBe(true);
    expect(estaEnOnHold(b, "pml", "b1")).toBe(false); // son listas distintas
    expect(cantidadOnHold(b)).toBe(1);

    const c = conOnHold(conOnHold(b, "pml", "R1", true, ent), "proyecto", "b1", false, ent);
    expect(estaEnOnHold(c, "proyecto", "b1")).toBe(false);
    expect(estaEnOnHold(c, "pml", "R1")).toBe(true);
    expect(cantidadOnHold(c)).toBe(1);
  });

  it("un id como «constructor» no cuenta como presente", () => {
    expect(estaEnOnHold(onHoldVacio(), "proyecto", "constructor")).toBe(false);
  });
});

describe("aplicarOnHold", () => {
  it("sin nada en On Hold devuelve el mismo objeto", () => {
    const d = base(onHoldVacio());
    expect(aplicarOnHold(d)).toBe(d);
  });

  it("un proyecto en On Hold sale con su board, sus items y sus baselines; el otro queda", () => {
    const d = aplicarOnHold(base({ proyectos: { b1: ent }, pml: {} }));
    expect(d.projBoards.map((b) => b.id)).toEqual(["b2"]);
    expect(d.proj.map((p) => p.id)).toEqual(["p3", "p4"]);
    expect(Object.keys(d.projItemBaselines)).toEqual(["p3"]);
    expect(d.req.map((r) => r.id)).toEqual(["R1", "R2"]); // los PML no se tocan
  });

  it("un PML en On Hold sale; los demás quedan", () => {
    const d = aplicarOnHold(base({ proyectos: {}, pml: { R1: ent } }));
    expect(d.req.map((r) => r.id)).toEqual(["R2"]);
    expect(d.projBoards).toHaveLength(2);
    expect(d.proj).toHaveLength(4);
  });

  it("las encuestas de NPS del proyecto (step de NPS) y del PML en On Hold salen y el NPS se recalcula", () => {
    const d = aplicarOnHold(base({ proyectos: { b1: ent }, pml: { R2: ent } }));
    // Fuera: s1 (step de b1) y R2. Quedan R1 (10), s2 (10) y la sin reqId (10).
    expect(d.npsRecords.map((r) => r.reqId).sort()).toEqual(["", "R1", "s2"]);
    expect(d.nps.total).toBe(3);
    expect(d.nps.nps).toBe(100);
  });

  it("si ninguna encuesta es de lo pausado, conserva el NPS que ya traía", () => {
    const original = base({ proyectos: { b2: ent }, pml: {} });
    const d = aplicarOnHold({ ...original, npsRecords: [rec("R1", 10)], nps: { nps: 42 } as DashboardData["nps"] });
    expect(d.nps.nps).toBe(42);
  });

  it("no modifica el dashboard original", () => {
    const d = base({ proyectos: { b1: ent }, pml: { R1: ent } });
    aplicarOnHold(d);
    expect(d.proj).toHaveLength(4);
    expect(d.req).toHaveLength(2);
    expect(d.projBoards).toHaveLength(2);
    expect(d.npsRecords).toHaveLength(5);
  });
});

describe("enOnHold", () => {
  it("lista los boards y PML en On Hold, con todo el dashboard", () => {
    const r = enOnHold(base({ proyectos: { b2: ent }, pml: { R1: ent, noExiste: ent } }));
    expect(r.proyectos.map((b) => b.id)).toEqual(["b2"]);
    expect(r.pml.map((x) => x.id)).toEqual(["R1"]);
  });

  it("vacío cuando no hay nada", () => {
    expect(enOnHold(base(onHoldVacio()))).toEqual({ proyectos: [], pml: [] });
  });
});

describe("normalizarMotivoOnHold", () => {
  it("recorta espacios y deja pasar hasta el máximo", () => {
    expect(normalizarMotivoOnHold("  Esperando al cliente \n")).toBe("Esperando al cliente");
    expect(normalizarMotivoOnHold("x".repeat(MOTIVO_ON_HOLD_MAX))).toHaveLength(MOTIVO_ON_HOLD_MAX);
  });

  it("vacío es válido (quien lo exige lo revisa aparte); texto de más o lo que no es texto, no", () => {
    expect(normalizarMotivoOnHold("   ")).toBe("");
    expect(normalizarMotivoOnHold("x".repeat(MOTIVO_ON_HOLD_MAX + 1))).toBeNull();
    for (const x of [undefined, null, 5, {}, []]) expect(normalizarMotivoOnHold(x)).toBeNull();
  });
});

describe("conMotivoOnHold", () => {
  it("cambia solo el motivo y conserva quién y cuándo, sin tocar el original", () => {
    const a = conOnHold(onHoldVacio(), "pml", "R1", true, ent);
    const b = conMotivoOnHold(a, "pml", "R1", "Nuevo motivo");
    expect(b.pml.R1).toEqual({ ...ent, motivo: "Nuevo motivo" });
    expect(a.pml.R1.motivo).toBe(ent.motivo);
  });

  it("si no está en On Hold no lo crea", () => {
    const a = onHoldVacio();
    expect(conMotivoOnHold(a, "proyecto", "b1", "x")).toBe(a);
  });
});
