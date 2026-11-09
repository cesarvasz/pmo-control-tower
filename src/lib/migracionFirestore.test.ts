import { describe, expect, it } from "vitest";
import { aIso, llaveDe, planMigracion, type FirestoreCrudo } from "@/lib/migracionFirestore";

const AT = "2026-03-04T15:16:17.123Z";

describe("aIso", () => {
  it("entiende el string ISO de la app, Date y Timestamp de Firestore", () => {
    expect(aIso(AT)).toBe(AT);
    expect(aIso(new Date(AT))).toBe(AT);
    expect(aIso({ toDate: () => new Date(AT) })).toBe(AT);
  });
  it("lo que no es fecha → undefined", () => {
    expect(aIso(undefined)).toBeUndefined();
    expect(aIso("")).toBeUndefined();
    expect(aIso("no-es-fecha")).toBeUndefined();
    expect(aIso(123)).toBeUndefined();
  });
});

describe("planMigracion", () => {
  it("baselines: copia montos y fecha; un costo no numérico va a 0 con aviso", () => {
    const { filas, avisos } = planMigracion({
      req_baselines: [
        { id: "R1", data: { costRH: 1234.56, costSft: 0.1, savedAt: AT } },
        { id: "R2", data: { costRH: "x", costSft: 5 } },
      ],
      proj_item_baselines: [
        { id: "I1", data: { boardId: "B1", cost: 99.99, savedAt: AT } },
        { id: "I2", data: { cost: 1 } },
      ],
    });
    expect(filas.req_baselines).toEqual([
      { req_id: "R1", cost_rh: 1234.56, cost_sft: 0.1, saved_at: AT },
      { req_id: "R2", cost_rh: 0, cost_sft: 5 },          // sin saved_at → default now()
    ]);
    expect(filas.proj_item_baselines).toEqual([{ item_id: "I1", board_id: "B1", cost: 99.99, saved_at: AT }]);
    expect(avisos).toHaveLength(2);
  });

  it("las 4 colecciones de atribuciones van a una tabla con su kind, sin tocar el nombre del rol", () => {
    const { filas } = planMigracion({
      delay_attributions: [{ id: "1", data: { responsible: "Desarrollador", by: "a@c807.com", at: AT } }],
      cku_reproceso_attributions: [{ id: "2", data: { responsible: "PM" } }],
    });
    expect(filas.responsible_attributions).toEqual([
      { kind: "delay", item_id: "1", responsible: "Desarrollador", updated_by: "a@c807.com", updated_at: AT },
      { kind: "reproceso-cku", item_id: "2", responsible: "PM", updated_by: null },
    ]);
  });

  it("metodología: score fuera de 0-100 se omite", () => {
    const { filas, avisos } = planMigracion({
      metodologia_califs: [
        { id: "2026-01::Ana", data: { score: 87.5, by: "x", at: AT, comentario: "ok" } },
        { id: "malo", data: { score: 120 } },
      ],
    });
    expect(filas.metodologia_califs).toEqual([
      { key: "2026-01::Ana", score: 87.5, comentario: "ok", updated_by: "x", updated_at: AT },
    ]);
    expect(avisos).toHaveLength(1);
  });

  it("VPA: un doc por mes → una fila por indicador; ids que no son mes se omiten", () => {
    const { filas, avisos } = planMigracion({
      vpa_califs: [
        { id: "2026-02", data: { notas: { noExiste: 50 }, by: "x", at: AT } },
        { id: "basura", data: { notas: {} } },
      ],
    });
    expect(filas.vpa_califs).toEqual([]);
    expect(avisos.some((a) => a.includes("noExiste"))).toBe(true);
    expect(avisos.some((a) => a.includes("basura"))).toBe(true);
  });

  it("on hold y clasificación: mapas de un doc → una fila por entrada", () => {
    const { filas } = planMigracion({
      on_hold: [{ id: "actual", data: {
        proyectos: { "123": { by: "a@c807.com", at: AT, motivo: "pausa" } },
        pml: { "456": { by: "b@c807.com", at: AT } },
      } }],
      clasificacion: [{ id: "actual", data: { "123": { clase: "B", by: "a@c807.com", at: AT }, "9": { clase: "Z" } } }],
    });
    expect(filas.on_hold).toContainEqual({ tipo: "proyecto", id: "123", motivo: "pausa", created_by: "a@c807.com", created_at: AT });
    expect(filas.on_hold.find((r) => r.tipo === "pml")?.created_by).toBe("b@c807.com");
    expect(filas.clasificacion).toEqual([{ id: "123", clase: "B", updated_by: "a@c807.com", updated_at: AT }]);
  });

  it("atraso legacy (responsable sin reparto) se conserva en responsable_legacy", () => {
    const { filas } = planMigracion({
      atraso_detalles: [{ id: "7", data: { responsable: "Desarrollador", motivo: "m", by: "x", at: AT } }],
    });
    expect(filas.atraso_detalles).toEqual([
      { item_id: "7", reparto: null, responsable_legacy: "Desarrollador", motivo: "m", updated_by: "x", updated_at: AT },
    ]);
  });

  it("preprod y buenas noticias: docs únicos → una fila por fecha / semana", () => {
    const { filas, avisos } = planMigracion({
      preprod_restore_dates: [{ id: "list", data: { dates: ["2026-01-05", "2026-01-05", "mal"], by: "x", at: AT } }],
      buenas_noticias_suplentes: [{ id: "list", data: { suplentes: { "2026-11-09": "Ana" }, by: "y", at: AT } }],
    });
    expect(filas.preprod_restore_dates).toEqual([{ fecha: "2026-01-05", updated_by: "x", updated_at: AT }]);
    expect(filas.buenas_noticias_suplentes).toEqual([{ semana: "2026-11-09", nombre: "Ana", updated_by: "y", updated_at: AT }]);
    expect(avisos).toHaveLength(1);
  });

  it("encuestas: dos links pendientes iguales → queda el más reciente; las contestadas no chocan", () => {
    const base = { reqId: "R", assignedEmail: "Ana@C807.com", cku: "" };
    const { filas, avisos } = planMigracion({
      surveys: [
        { id: "viejo", data: { ...base, createdAt: "2026-01-01T00:00:00.000Z" } },
        { id: "nuevo", data: { ...base, createdAt: "2026-02-01T00:00:00.000Z" } },
        { id: "contestada", data: { ...base, answered: true, answeredAt: AT } },
      ],
      survey_responses: [{ id: "contestada", data: { answers: { nps: 9 }, respondentEmail: "ana@c807.com", submittedAt: AT } }],
    });
    expect(filas.surveys.map((s) => s.token).sort()).toEqual(["contestada", "nuevo"]);
    expect(filas.surveys.every((s) => s.assigned_email === "ana@c807.com")).toBe(true);
    expect(filas.survey_responses).toEqual([
      { token: "contestada", answers: { nps: 9 }, respondent_email: "ana@c807.com", submitted_at: AT },
    ]);
    expect(avisos).toHaveLength(1);
  });

  it("usuarios: rol inexistente → en espera; modelo viejo `role: admin` → admin", () => {
    const fs: FirestoreCrudo = {
      roles: [{ id: "admin", data: { name: "Administrador", isSystem: true, permissions: { pages: {} } } }],
      users: [
        { id: "u1", data: { email: "Ana@c807.com", displayName: "Ana", roleId: "fantasma" } },
        { id: "u2", data: { email: "beto@c807.com", role: "admin" } },
        { id: "u3", data: { displayName: "sin correo" } },
      ],
    };
    const { usuarios, avisos } = planMigracion(fs);
    expect(usuarios).toEqual([
      { firebaseUid: "u1", email: "ana@c807.com", displayName: "Ana", roleId: null, defaultPage: null, createdAt: undefined, updatedAt: undefined },
      { firebaseUid: "u2", email: "beto@c807.com", displayName: "beto@c807.com", roleId: "admin", defaultPage: null, createdAt: undefined, updatedAt: undefined },
    ]);
    expect(avisos).toHaveLength(2);
  });

  it("llaveDe arma la llave compuesta", () => {
    expect(llaveDe("responsible_attributions", { kind: "delay", item_id: "5", responsible: "PM" })).toBe("delay\u00015");
  });
});
