import { describe, it, expect } from "vitest";
import { CKU_SURVEY_QUESTIONS, ckuIsComplete, enlaceEncuestaCku, entregableCompletado, esCorreoValido } from "@/lib/surveyCku";
import { ckuNpsRecordsDe, ckuSurveyResponseDe } from "@/lib/storeRows";
import { emailDeCkuPorNombre, nombreCkuCanonico } from "@/lib/players";

const completas = () => Object.fromEntries(CKU_SURVEY_QUESTIONS.map((q) => [q.id, q.type === "nps" ? 9 : "De acuerdo"]));

describe("encuesta de CKU", () => {
  it("tiene las 10 preguntas de la propuesta: NPS, abierta y 8 dimensiones", () => {
    expect(CKU_SURVEY_QUESTIONS.map((q) => q.id)).toEqual(["nps", "mejora", "G1", "G2", "I1", "I2", "T1", "T2", "H1", "H2"]);
  });
  it("completa solo con todas las preguntas contestadas", () => {
    expect(ckuIsComplete(completas())).toBe(true);
    expect(ckuIsComplete({ ...completas(), mejora: "  " })).toBe(false);
    const sinNps: Record<string, string | number> = completas(); delete sinNps.nps;
    expect(ckuIsComplete(sinNps)).toBe(false);
    expect(ckuIsComplete({ ...completas(), nps: 0 })).toBe(true);
  });
  it("valida el correo", () => {
    expect(esCorreoValido(" a@b.com ")).toBe(true);
    for (const m of ["", "a", "a@b", "a b@c.com"]) expect(esCorreoValido(m)).toBe(false);
  });
  it("un entregable está completado solo con Status Done", () => {
    for (const s of ["Done", " done ", "DONE"]) expect(entregableCompletado(s)).toBe(true);
    for (const s of ["Working on it", "Future steps", "Stuck", "", null, undefined]) expect(entregableCompletado(s)).toBe(false);
  });
  it("arma el enlace público", () => expect(enlaceEncuestaCku("https://x.app", "t1")).toBe("https://x.app/encuesta/cku/t1"));
});

describe("filas de las encuestas de CKU", () => {
  const s = { token: "t1", cku: "Javier Juarez", cku_email: "j@c807.com", nombre: "Capacitación", created_by_email: "j@c807.com", entregable_id: null, created_at: "2026-11-10T10:00:00+00:00" };
  const r = { id: "r1", survey_token: "t1", respondent_name: "Ana", respondent_email: "ana@x.com", answers: { nps: 10 }, invalidated: false, submitted_at: "2026-11-10T11:00:00+00:00" };

  it("convierte una respuesta", () => {
    expect(ckuSurveyResponseDe(r)).toMatchObject({ id: "r1", surveyToken: "t1", respondentName: "Ana", respondentEmail: "ana@x.com", invalidated: false });
  });
  it("las pasa a NpsRecord con el CKU como dueño, sin PM ni PML, y descarta las huérfanas", () => {
    const out = ckuNpsRecordsDe([r, { ...r, id: "r2", survey_token: "otra" }], [s]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ pm: "", reqId: "", cku: "Javier Juarez", ckuEncuesta: true, token: "t1", respondentName: "Ana" });
  });
});

describe("CKU en el Directorio RH", () => {
  const hr = [{ id: "1", name: "Javier Juárez", column_values: [{ id: "email_mkz5qg4v", text: "Javier@C807.com" }] }] as never;
  it("nombre canónico del player (sin tildes ni mayúsculas)", () => {
    expect(nombreCkuCanonico("Javier Juárez")).toBe("Javier Juarez");
    expect(nombreCkuCanonico("Otra Persona")).toBe("Otra Persona");
  });
  it("correo de un CKU por su nombre", () => {
    expect(emailDeCkuPorNombre(hr, "Javier Juarez")).toBe("javier@c807.com");
    expect(emailDeCkuPorNombre(hr, "Nadie")).toBe("");
  });
});
