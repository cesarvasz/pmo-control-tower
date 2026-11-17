// Conexión con Google y reuniones agendadas, DE PUNTA A PUNTA contra la base real (lee .env.local): el Vault, las restricciones de la
// tabla y las funciones de lib/reuniones.ts. Crea un usuario de prueba y lo BORRA al final (también si falla); no habla con Google.
// No corre en `npm test` ni en CI: solo con  REUNIONES_IT=1 npx vitest run src/lib/reuniones.integration.test.ts

import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ACTIVO = process.env.REUNIONES_IT === "1";
if (ACTIVO && existsSync(".env.local")) process.loadEnvFile(".env.local");

describe.skipIf(!ACTIVO)("Reuniones · conexión con Google y reuniones agendadas (integración)", { timeout: 60_000 }, async () => {
  const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
  const R = await import("@/lib/reuniones");
  const db = () => getSupabaseAdmin();

  const CODIGO = "IN-999999";
  const email = `prueba-reuniones-${randomUUID().slice(0, 8)}@example.com`;
  let usuarioId = "";

  const limpiarReuniones = async () => { await db().from("reuniones").delete().eq("codigo", CODIGO); };
  const ventana = { inicio: "2026-11-20T16:00:00.000Z", fin: "2026-11-20T17:00:00.000Z" };

  // El usuario de prueba: una cuenta de Auth (el app_users cuelga de ella) que se borra al final.
  beforeAll(async () => {
    const creado = await db().auth.admin.createUser({ email, email_confirm: true });
    if (creado.error || !creado.data.user) throw new Error(`No se pudo crear el usuario de prueba: ${creado.error?.message}`);
    usuarioId = creado.data.user.id;
    const alta = await db().from("app_users").upsert({ id: usuarioId, email, display_name: "Prueba reuniones" });
    if (alta.error) throw new Error(`No se pudo crear el app_user de prueba: ${alta.error.message}`);
  });

  afterAll(async () => {
    await limpiarReuniones();
    if (usuarioId) await db().auth.admin.deleteUser(usuarioId); // borra app_users, su conexión y (trigger) el secreto del Vault
  });

  it("guarda la conexión con su token en el Vault, lo renueva y lo lee; la conexión pública no trae el token", async () => {
    expect(await R.getConexion(usuarioId)).toBeNull();
    expect(await R.leerRefreshToken(usuarioId)).toBeNull();

    await R.guardarConexion({ usuarioId, googleEmail: "PM@C807.com", googleSub: "sub-1", scopes: ["openid", "email"], refreshToken: "token-uno" });
    const c = await R.getConexion(usuarioId);
    expect(c).toMatchObject({ usuarioId, googleEmail: "pm@c807.com", estado: "activa", scopes: ["openid", "email"], ultimoError: null });
    expect(JSON.stringify(c)).not.toContain("token-uno");
    expect(await R.leerRefreshToken(usuarioId)).toBe("token-uno");

    // Volver a conectar renueva el token (y reactiva la conexión) sin duplicar nada
    await R.marcarConexion(usuarioId, "reconectar", "invalid_grant");
    expect(await R.getConexion(usuarioId)).toMatchObject({ estado: "reconectar", ultimoError: "invalid_grant" });
    await R.guardarConexion({ usuarioId, googleEmail: "pm@c807.com", googleSub: "sub-1", scopes: ["openid"], refreshToken: "token-dos" });
    expect(await R.getConexion(usuarioId)).toMatchObject({ estado: "activa", ultimoError: null, scopes: ["openid"] });
    expect(await R.leerRefreshToken(usuarioId)).toBe("token-dos");
    const filas = await db().from("google_conexiones").select("usuario_id").eq("usuario_id", usuarioId);
    expect(filas.data).toHaveLength(1);

    await expect(R.guardarConexion({ usuarioId, googleEmail: "a@c807.com", googleSub: "s", scopes: [], refreshToken: "" })).rejects.toThrow(/token-vacio/);
  });

  it("el servidor sí abre el Vault y cualquier otro rol no", async () => {
    // Sin la llave del servidor (con la publishable, o sea anon) las funciones y las tablas no se pueden usar
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
    const cabeceras = { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, "Content-Type": "application/json" };
    const t = await fetch(`${base}/rpc/google_leer_token`, { method: "POST", headers: cabeceras, body: JSON.stringify({ p_usuario: usuarioId }) });
    expect(t.ok).toBe(false);
    expect(await t.text()).not.toContain("token-dos");
    const g = await fetch(`${base}/rpc/google_guardar_conexion`, {
      method: "POST", headers: cabeceras,
      body: JSON.stringify({ p_usuario: usuarioId, p_google_email: "x@x.com", p_google_sub: "x", p_scopes: [], p_refresh_token: "intruso" }),
    });
    expect(g.ok).toBe(false);
    const l = await fetch(`${base}/google_conexiones?select=*`, { headers: cabeceras });
    expect(l.ok ? await l.json() : []).toEqual([]);
    expect(await R.leerRefreshToken(usuarioId)).toBe("token-dos"); // el intruso no cambió nada
  });

  it("agenda una reunión; una segunda vigente del mismo tipo choca, pero otro tipo no", async () => {
    await limpiarReuniones();
    const r = await R.crearReunion({
      codigo: CODIGO, tipo: "M1", titulo: "IN-999999 M1 · Prueba", ...ventana, organizadorId: usuarioId, organizadorEmail: email,
      googleEventId: "ev-1", googleEtag: '"1"', meetUrl: "https://meet.google.com/xxx-xxxx-xxx", creadoPor: usuarioId,
      invitados: [{ personaId: null, email: "ana@c807.com", nombre: "Ana" }],
    });
    expect(r).toMatchObject({ codigo: CODIGO, tipo: "M1", estado: "agendada", origen: "app", zona: "America/Guatemala", organizadorId: usuarioId });
    expect(r.invitados).toEqual([{ personaId: null, email: "ana@c807.com", nombre: "Ana" }]);

    await expect(R.crearReunion({ codigo: CODIGO, tipo: "M1", titulo: "otra", ...ventana })).rejects.toThrow("reunion-ya-agendada");
    const m2 = await R.crearReunion({ codigo: CODIGO, tipo: "M2", titulo: "IN-999999 M2 · Prueba", inicio: "2026-11-27T15:00:00.000Z", fin: "2026-11-27T16:00:00.000Z" });
    expect(m2.tipo).toBe("M2");

    expect((await R.reunionesVigentesDe(CODIGO, "M1")).map((x) => x.id)).toEqual([r.id]);
    expect(await R.getReunion(r.id)).toMatchObject({ id: r.id, googleEventId: "ev-1" });
    expect(await R.getReunion("no-es-un-uuid")).toBeNull();
  });

  it("las restricciones de la tabla frenan lo que no tiene sentido", async () => {
    await expect(R.crearReunion({ codigo: CODIGO, tipo: "M1", titulo: "x", inicio: ventana.fin, fin: ventana.inicio, origen: "google" })).rejects.toMatchObject({ code: "23514" });
    await expect(R.crearReunion({ codigo: "XX-1", tipo: "M1", titulo: "x", ...ventana, origen: "google" })).rejects.toMatchObject({ code: "23514" });
    // El mismo evento de Google del mismo organizador no entra dos veces
    await R.crearReunion({ codigo: CODIGO, tipo: "M1", titulo: "reconocida", ...ventana, origen: "google", organizadorId: usuarioId, googleEventId: "ev-dup" });
    await expect(R.crearReunion({ codigo: CODIGO, tipo: "M2", titulo: "dup", ...ventana, origen: "google", organizadorId: usuarioId, googleEventId: "ev-dup" })).rejects.toMatchObject({ code: "23505" });
  });

  it("entrega el calendario con la forma de siempre y la cancelada deja de contar", async () => {
    const vigentes = (await R.reunionesParaCalendario()).filter((e) => e.codigo === CODIGO);
    expect(vigentes).toEqual(expect.arrayContaining([
      { codigo: CODIGO, meeting: "M1", inicio: ventana.inicio, fin: ventana.fin },
      { codigo: CODIGO, meeting: "M2", inicio: "2026-11-27T15:00:00.000Z", fin: "2026-11-27T16:00:00.000Z" },
    ]));

    const r = (await R.reunionesVigentesDe(CODIGO, "M1")).find((x) => x.origen === "app")!;
    const editada = await R.actualizarReunion(r.id, { inicio: "2026-11-21T16:00:00.000Z", fin: "2026-11-21T17:30:00.000Z", googleEtag: '"2"', invitados: [] });
    expect(editada).toMatchObject({ inicio: "2026-11-21T16:00:00.000Z", fin: "2026-11-21T17:30:00.000Z", googleEtag: '"2"', invitados: [], titulo: r.titulo });

    const cancelada = await R.cancelarReunion(r.id);
    expect(cancelada.estado).toBe("cancelada");
    expect(cancelada.canceladaAt).not.toBeNull();
    expect((await R.cancelarReunion(r.id)).estado).toBe("cancelada"); // idempotente
    expect((await R.reunionesParaCalendario()).filter((e) => e.codigo === CODIGO && e.meeting === "M1" && e.inicio === "2026-11-21T16:00:00.000Z")).toEqual([]);

    // Cancelada, la iniciativa puede volver a agendar esa reunión
    const nueva = await R.crearReunion({ codigo: CODIGO, tipo: "M1", titulo: "reagendada", inicio: "2026-11-23T16:00:00.000Z", fin: "2026-11-23T17:00:00.000Z" });
    expect(nueva.estado).toBe("agendada");

    await expect(R.actualizarReunion(randomUUID(), { titulo: "x" })).rejects.toThrow("reunion-no-encontrada");
    await expect(R.cancelarReunion(randomUUID())).rejects.toThrow("reunion-no-encontrada");
  });

  it("desconectar quita la conexión pero conserva las reuniones ya agendadas", async () => {
    expect(await R.desconectar(usuarioId)).toBe(true);
    expect(await R.getConexion(usuarioId)).toBeNull();
    expect(await R.leerRefreshToken(usuarioId)).toBeNull();
    expect(await R.desconectar(usuarioId)).toBe(false);
    expect((await R.reunionesVigentesDe(CODIGO, "M2")).length).toBeGreaterThan(0);
  });

  it("borrar a un usuario que aún tiene conexión borra también su secreto del Vault y deja sus reuniones sin organizador", async () => {
    const email2 = `prueba-reuniones-${randomUUID().slice(0, 8)}@example.com`;
    const u = await db().auth.admin.createUser({ email: email2, email_confirm: true });
    const id2 = u.data.user!.id;
    await db().from("app_users").upsert({ id: id2, email: email2, display_name: "Prueba reuniones 2" });
    await R.guardarConexion({ usuarioId: id2, googleEmail: "otro@c807.com", googleSub: "sub-2", scopes: [], refreshToken: "token-secreto-2" });
    expect(await R.leerRefreshToken(id2)).toBe("token-secreto-2");
    const r = await R.crearReunion({ codigo: CODIGO, tipo: "M2", titulo: "del usuario 2", inicio: "2026-12-01T16:00:00.000Z", fin: "2026-12-01T17:00:00.000Z", origen: "google", organizadorId: id2, organizadorEmail: email2, googleEventId: "ev-u2" });

    const borrado = await db().auth.admin.deleteUser(id2);
    expect(borrado.error).toBeNull();
    expect(await R.getConexion(id2)).toBeNull();
    expect(await R.leerRefreshToken(id2)).toBeNull();
    expect(await R.getReunion(r.id)).toMatchObject({ organizadorId: null, organizadorEmail: email2 });
  });
});
