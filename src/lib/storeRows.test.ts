import { describe, expect, it } from "vitest";
import {
  atrasoDetallesDe, attributionsDe, clasesDe, iso, metasImplementacionDe, metodologiaDe,
  npsRecordsDe, onHoldDe, surveyDe, vpaDe, weeklySnapshotDe,
} from "@/lib/storeRows";
import type { Tables } from "@/types/supabase";

const T1 = "2026-11-05T16:28:01.333+00:00";
const T1_ISO = "2026-11-05T16:28:01.333Z";
const T2 = "2026-11-06T10:00:00+00:00";
const T2_ISO = "2026-11-06T10:00:00.000Z";

describe("iso", () => {
  it("convierte el timestamptz de PostgREST al ISO de JS", () => {
    expect(iso(T1)).toBe(T1_ISO);
    expect(iso("2026-11-05T10:28:01.333-06:00")).toBe(T1_ISO);
  });
  it("vacío / null → undefined", () => {
    expect(iso(null)).toBeUndefined();
    expect(iso("")).toBeUndefined();
  });
});

describe("attributionsDe", () => {
  it("aplica el alias de responsable y omite by cuando no hay", () => {
    const rows: Tables<"responsible_attributions">[] = [
      { kind: "delay", item_id: "1", responsible: "Desarrollador", updated_by: "a@c807.com", updated_at: T1 },
      { kind: "delay", item_id: "2", responsible: "PM", updated_by: null, updated_at: T1 },
    ];
    expect(attributionsDe(rows)).toEqual({
      "1": { responsible: "Desarrollo", by: "a@c807.com", at: T1_ISO },
      "2": { responsible: "PM", at: T1_ISO },
    });
  });
});

describe("metodologiaDe", () => {
  it("mapea score, comentario y autor", () => {
    expect(metodologiaDe([{ key: "k", score: 87.5, comentario: "ok", updated_by: "a", updated_at: T1 }]))
      .toEqual({ k: { score: 87.5, comentario: "ok", by: "a", at: T1_ISO } });
  });
});

describe("vpaDe", () => {
  it("agrupa por mes, toma el autor de la nota más reciente y descarta indicadores inexistentes", () => {
    const rows: Tables<"vpa_califs">[] = [
      { mes: "2026-10", indicador: "reportes-claves", nota: 90, updated_by: "a", updated_at: T1 },
      { mes: "2026-10", indicador: "calidad-datos", nota: 100, updated_by: "b", updated_at: T2 },
      { mes: "2026-10", indicador: "ya-no-existe", nota: 50, updated_by: "c", updated_at: T1 },
      { mes: "2026-11", indicador: "control-portafolio", nota: 70, updated_by: null, updated_at: T1 },
    ];
    expect(vpaDe(rows)).toEqual({
      "2026-10": { notas: { "reportes-claves": 90, "calidad-datos": 100 }, by: "b", at: T2_ISO },
      "2026-11": { notas: { "control-portafolio": 70 }, at: T1_ISO },
    });
  });
});

describe("metasImplementacionDe", () => {
  it("arma el documento ordenado, con el último autor, y sin objetivos de 100 %", () => {
    const doc = metasImplementacionDe(
      [
        { cliente: "Zeta", vol: 10, cm1: 5.5, desde: null, updated_by: "a", updated_at: T1 },
        { cliente: "Alfa", vol: 3, cm1: 2, desde: "2026-01", updated_by: "a", updated_at: T1 },
      ],
      [
        { mes: "2026-03", objetivo: 90, updated_by: "b", updated_at: T2 },
        { mes: "2026-02", objetivo: 100, updated_by: "b", updated_at: T2 },
      ],
    );
    expect(doc).toEqual({
      metas: [
        { cliente: "Alfa", vol: 3, cm1: 2, desde: "2026-01" },
        { cliente: "Zeta", vol: 10, cm1: 5.5 },
      ],
      objetivos: [{ mes: "2026-03", objetivo: 90 }],
      by: "b",
      at: T2_ISO,
    });
  });
  it("sin filas → documento vacío como antes", () => {
    expect(metasImplementacionDe([], [])).toEqual({ metas: [], objetivos: [], by: "", at: "" });
  });
});

describe("onHoldDe", () => {
  it("reparte por tipo y conserva quién/cuándo/motivo", () => {
    const rows: Tables<"on_hold">[] = [
      { tipo: "proyecto", id: "123", motivo: "presupuesto", created_by: "a", created_at: T1 },
      { tipo: "pml", id: "456", motivo: "", created_by: "b", created_at: T2 },
    ];
    expect(onHoldDe(rows)).toEqual({
      proyectos: { "123": { by: "a", at: T1_ISO, motivo: "presupuesto" } },
      pml: { "456": { by: "b", at: T2_ISO, motivo: "" } },
    });
  });
});

describe("atrasoDetallesDe", () => {
  it("reparto con alias, y el responsable legacy solo cuando existe", () => {
    const rows: Tables<"atraso_detalles">[] = [
      { item_id: "1", reparto: [{ dias: 2, resp: "Desarrollador" }, { dias: 1, resp: "PM", actual: true }], responsable_legacy: null, motivo: "m", updated_by: "a", updated_at: T1 },
      { item_id: "2", reparto: null, responsable_legacy: "Desarrollador", motivo: "", updated_by: null, updated_at: T1 },
    ];
    expect(atrasoDetallesDe(rows)).toEqual({
      "1": { reparto: [{ dias: 2, resp: "Desarrollo" }, { dias: 1, resp: "PM", actual: true }], motivo: "m", by: "a", at: T1_ISO },
      "2": { responsable: "Desarrollo", motivo: "", at: T1_ISO },
    });
  });
});

describe("clasesDe", () => {
  it("mapea la clase con autor", () => {
    expect(clasesDe([{ id: "9", clase: "B", updated_by: "a", updated_at: T1 }]))
      .toEqual({ "9": { clase: "B", by: "a", at: T1_ISO } });
  });
});

describe("weeklySnapshotDe", () => {
  it("mapea a camelCase con nulls intactos", () => {
    expect(weeklySnapshotDe({ week_of: "2026-11-02", evm: 96.4, beneficio_confirmado: 1500.25, calidad: null, cumplimiento: 88, nps: -10, created_at: T1 }))
      .toEqual({ weekOf: "2026-11-02", evm: 96.4, beneficioConfirmado: 1500.25, calidad: null, cumplimiento: 88, nps: -10, createdAt: T1_ISO });
  });
});

const survey = (over: Partial<Tables<"surveys">> = {}): Tables<"surveys"> => ({
  token: "t1", req_id: "R1", req_code: "REQ-1", req_name: "Req", pm: "Ana",
  assigned_email: "x@c807.com", assigned_name: "X", created_by_email: "a@c807.com", cku: "",
  answered: false, answered_at: null, invalidated: false, created_at: T1, ...over,
});

describe("surveyDe", () => {
  it("mapea la encuesta (answeredAt null si no se contestó)", () => {
    expect(surveyDe(survey())).toEqual({
      token: "t1", reqId: "R1", reqCode: "REQ-1", reqName: "Req", pm: "Ana",
      assignedEmail: "x@c807.com", assignedName: "X", createdByEmail: "a@c807.com", createdAt: T1_ISO,
      answered: false, answeredAt: null, invalidated: false, cku: "",
    });
  });
});

describe("npsRecordsDe", () => {
  it("une la respuesta con su encuesta; las importadas sin encuesta quedan con pm vacío", () => {
    const out = npsRecordsDe(
      [
        { token: "t1", answers: { nps: 9 }, respondent_email: "x@c807.com", submitted_at: T2 },
        { token: "sheet-7", answers: { nps: 4 }, respondent_email: "y@c807.com", submitted_at: T1 },
      ],
      [survey({ invalidated: true, cku: "Javier" })],
    );
    expect(out).toEqual([
      { answers: { nps: 9 }, pm: "Ana", invalidated: true, respondentEmail: "x@c807.com", submittedAt: T2_ISO, reqCode: "REQ-1", reqId: "R1", cku: "Javier", token: "t1" },
      { answers: { nps: 4 }, pm: "", invalidated: false, respondentEmail: "y@c807.com", submittedAt: T1_ISO, reqCode: "", reqId: "", cku: "", token: "sheet-7" },
    ]);
  });
});
