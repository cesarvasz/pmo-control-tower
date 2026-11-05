// Prueba de integración CONTRA LA BASE REAL de Supabase (lee .env.local).
// No corre en `npm test` ni en CI: solo con  SUPABASE_IT=1 npx vitest run src/lib/store.integration.test.ts
// Usa ids con prefijo "__it__" y borra todo lo que crea. Las tablas que se reemplazan
// completas (metas de Implementación, fechas de pre-producción) se guardan y se restauran.

import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ACTIVO = process.env.SUPABASE_IT === "1";
if (ACTIVO && existsSync(".env.local")) process.loadEnvFile(".env.local");

const P = "__it__";
const YO = "it@c807.com";

// Cada test hace varias idas y vueltas a la base real: el límite de 5 s por defecto no alcanza.
describe.skipIf(!ACTIVO)("Supabase · capa de datos (integración)", { timeout: 60_000 }, async () => {
  const store = await import("@/lib/store");
  const roles = await import("@/lib/roles");
  const groups = await import("@/lib/groups");
  const surveys = await import("@/lib/surveys");
  const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
  const db = () => getSupabaseAdmin(); // perezoso: con la suite saltada no hay llaves

  let metasPrevias: Awaited<ReturnType<typeof store.getMetasImplementacion>>;
  let fechasPrevias: string[];

  beforeAll(async () => {
    metasPrevias = await store.getMetasImplementacion();
    fechasPrevias = await store.getPreprodRestoreDates();
  });

  afterAll(async () => {
    const like = `${P}%`;
    await db().from("req_baselines").delete().like("req_id", like);
    await db().from("proj_item_baselines").delete().like("item_id", like);
    await db().from("responsible_attributions").delete().like("item_id", like);
    await db().from("metodologia_califs").delete().like("key", like);
    await db().from("vpa_califs").delete().eq("mes", "1999-01");
    await db().from("on_hold").delete().like("id", like);
    await db().from("atraso_detalles").delete().like("item_id", like);
    await db().from("board_alcance").delete().like("board_id", like);
    await db().from("clasificacion").delete().like("id", like);
    await db().from("weekly_snapshots").delete().eq("week_of", "1999-01-04");
    await db().from("survey_responses").delete().like("token", like);
    await db().from("surveys").delete().like("req_id", like);
    await db().from("roles").delete().like("name", like);
    await db().from("menu_groups").delete().like("name", like);
    await store.saveMetasImplementacion(metasPrevias.metas, metasPrevias.objetivos, metasPrevias.by || YO);
    await store.savePreprodRestoreDates(fechasPrevias, YO);
  });

  it("baselines: guardar, leer todo y leer por ids", async () => {
    await store.saveReqBaseline(`${P}req1`, { costRH: 1234.567, costSft: 0.1 });
    await store.saveProjItemBaseline(`${P}it1`, { boardId: `${P}b1`, cost: 99.99 });
    const req = (await store.getReqBaselines())[`${P}req1`];
    expect(req).toMatchObject({ costRH: 1234.567, costSft: 0.1 });
    expect(req.savedAt).toMatch(/Z$/);
    expect((await store.getProjItemBaselines())[`${P}it1`]).toMatchObject({ boardId: `${P}b1`, cost: 99.99 });
    expect(Object.keys(await store.getProjItemBaselinesFor([`${P}it1`, `${P}nada`]))).toEqual([`${P}it1`]);
  });

  it("atribuciones: por kind, sin mezclarse, y se borran", async () => {
    await store.saveAttribution("delay", `${P}a1`, "PM", YO);
    await store.saveAttribution("delay-cku", `${P}a1`, "CKU", YO);
    expect((await store.getAttributions("delay"))[`${P}a1`]).toMatchObject({ responsible: "PM", by: YO });
    expect((await store.getAttributions("delay-cku"))[`${P}a1`]).toMatchObject({ responsible: "CKU" });
    await store.deleteAttribution("delay", `${P}a1`);
    expect((await store.getAttributions("delay"))[`${P}a1`]).toBeUndefined();
    expect((await store.getAttributions("delay-cku"))[`${P}a1`]).toBeDefined();
  });

  it("metodología y VPA (quitar una nota no toca las otras)", async () => {
    await store.saveMetodologiaCalif(`${P}m1`, 87.5, YO, "bien");
    expect((await store.getMetodologiaCalifs())[`${P}m1`]).toMatchObject({ score: 87.5, comentario: "bien" });
    await store.deleteMetodologiaCalif(`${P}m1`);
    expect((await store.getMetodologiaCalifs())[`${P}m1`]).toBeUndefined();

    await store.saveVpaNota("1999-01", "reportes-claves", 90, YO);
    await store.saveVpaNota("1999-01", "calidad-datos", 70, YO);
    await store.saveVpaNota("1999-01", "reportes-claves", null, YO);
    expect((await store.getVpaCalifs())["1999-01"].notas).toEqual({ "calidad-datos": 70 });
  });

  it("metas de Implementación: reemplazo completo", async () => {
    await store.saveMetasImplementacion([{ cliente: `${P}Z`, vol: 10, cm1: 5.5 }, { cliente: `${P}A`, vol: 1, cm1: 2, desde: "2026-01" }], [{ mes: "2026-03", objetivo: 90 }], YO);
    await store.saveMetasImplementacion([{ cliente: `${P}B`, vol: 3, cm1: 4 }], [], YO);
    const doc = await store.getMetasImplementacion();
    expect(doc.metas).toEqual([{ cliente: `${P}B`, vol: 3, cm1: 4 }]);
    expect(doc.objetivos).toEqual([]);
    expect(doc.by).toBe(YO);
  });

  it("On Hold: pausar, cambiar motivo, reactivar", async () => {
    await store.setOnHold("proyecto", `${P}p1`, true, YO, "presupuesto");
    expect((await store.getOnHold()).proyectos[`${P}p1`]).toMatchObject({ by: YO, motivo: "presupuesto" });
    expect(await store.setMotivoOnHold("proyecto", `${P}p1`, "otro")).toBe(true);
    expect((await store.getOnHold()).proyectos[`${P}p1`].motivo).toBe("otro");
    await store.setOnHold("proyecto", `${P}p1`, false, YO);
    expect(await store.setMotivoOnHold("proyecto", `${P}p1`, "x")).toBe(false);
  });

  it("atrasos, alcance y clase", async () => {
    await store.saveAtrasoDetalle(`${P}at1`, [{ dias: 2, resp: "PM" }, { dias: 1, resp: "IT", actual: true }], "motivo", YO);
    expect((await store.getAtrasoDetalles())[`${P}at1`]).toMatchObject({ reparto: [{ dias: 2, resp: "PM" }, { dias: 1, resp: "IT", actual: true }], motivo: "motivo" });
    await store.saveBoardAlcance(`${P}b1`, "alcance", YO);
    expect((await store.getBoardAlcances())[`${P}b1`].alcance).toBe("alcance");
    await store.saveClase(`${P}c1`, "B", YO);
    await store.saveClase(`${P}c1`, "A", YO);
    expect((await store.getClases())[`${P}c1`].clase).toBe("A");
  });

  it("snapshot semanal y fechas de pre-producción", async () => {
    await store.saveWeeklySnapshot("1999-01-04", { evm: 96.4, beneficioConfirmado: 1500.25, calidad: null, cumplimiento: 88, nps: -10 });
    const snap = (await store.listWeeklySnapshots()).find((s) => s.weekOf === "1999-01-04");
    expect(snap).toMatchObject({ evm: 96.4, beneficioConfirmado: 1500.25, calidad: null, cumplimiento: 88, nps: -10 });
    expect(await store.savePreprodRestoreDates(["1999-02-01", "1999-01-15", "1999-02-01"], YO)).toEqual(["1999-01-15", "1999-02-01"]);
    expect(await store.getPreprodRestoreDates()).toEqual(["1999-01-15", "1999-02-01"]);
  });

  it("roles y grupos: crear, editar, borrar (borrar grupo lo quita del rol)", async () => {
    const g = await groups.createGroup(`${P}grupo`, "🧪", ["overview", "no-existe"]);
    expect(g.pageKeys).toEqual(["overview"]);
    const r = await roles.createRole(`${P}rol`, { pages: {}, actions: {}, groups: { [g.id]: true } });
    expect((await roles.updateRole(r.id, { name: `${P}rol2` })).name).toBe(`${P}rol2`);
    await groups.deleteGroup(g.id);
    roles.invalidateRolesCache();
    expect((await roles.getRole(r.id))?.permissions.groups).toEqual({});
    await expect(groups.deleteGroup(g.id)).rejects.toThrow("group-not-found");
    await roles.deleteRole(r.id);
    await expect(roles.deleteRole(r.id)).rejects.toThrow("role-not-found");
  });

  it("encuestas: link pendiente único, respuesta única, reabrir, invalidar, NPS", async () => {
    const base = { reqId: `${P}R1`, reqCode: "REQ-IT", reqName: "Prueba", pm: "Ana", assignedEmail: "X@c807.com", assignedName: "X", createdByEmail: YO };
    const s1 = await surveys.createSurvey(base);
    const s2 = await surveys.createSurvey({ ...base, assignedName: "X bis" });
    expect(s2.token).toBe(s1.token);
    expect(s2.assignedName).toBe("X bis");
    expect(s1.assignedEmail).toBe("x@c807.com");
    const otroCku = await surveys.createSurvey({ ...base, cku: "Javier" });
    expect(otroCku.token).not.toBe(s1.token);

    // tokens de prueba con prefijo para la limpieza: se re-etiquetan a mano
    await surveys.saveResponse(s1.token, { nps: 9 }, "x@c807.com");
    await expect(surveys.saveResponse(s1.token, { nps: 1 }, "x@c807.com")).rejects.toThrow("already-answered");
    expect((await surveys.getSurvey(s1.token))?.answered).toBe(true);
    expect((await surveys.getResponse(s1.token))?.answers).toEqual({ nps: 9 });

    const rec = (await surveys.listNpsRecords()).find((n) => n.token === s1.token);
    expect(rec).toMatchObject({ pm: "Ana", reqId: `${P}R1`, invalidated: false });
    expect((await surveys.setInvalidated(s1.token, true))?.invalidated).toBe(true);

    await expect(surveys.deleteSurvey(s1.token)).rejects.toThrow("survey-answered");
    const reabierta = await surveys.reopenSurvey(s1.token);
    expect(reabierta).toMatchObject({ answered: false, invalidated: false, answeredAt: null });
    expect(await surveys.getResponse(s1.token)).toBeNull();

    await surveys.deleteSurvey(s1.token);
    await surveys.deleteSurvey(otroCku.token);
    await expect(surveys.deleteSurvey(s1.token)).rejects.toThrow("survey-not-found");
  });
});
