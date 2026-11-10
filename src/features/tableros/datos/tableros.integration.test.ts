// Un tablero DE PUNTA A PUNTA contra la base real (lee .env.local). Crea un tablero de prueba,
// lo usa y lo BORRA al final (también si falla).
// No corre en `npm test` ni en CI: solo con  TABLEROS_IT=1 npx vitest run src/features/tableros/datos/tableros.integration.test.ts

import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import type { AppUser } from "@/lib/permissions";
import type { Acceso } from "./tableros";

const ACTIVO = process.env.TABLEROS_IT === "1";
if (ACTIVO && existsSync(".env.local")) process.loadEnvFile(".env.local");

describe.skipIf(!ACTIVO)("Tableros · de punta a punta (integración)", { timeout: 120_000 }, async () => {
  const { crearTablero, leerTablero, leerHistorial } = await import("./tableros");
  const { ejecutarOperacion } = await import("./operaciones");
  const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
  const db = () => getSupabaseAdmin();

  const admin: AppUser = {
    uid: "00000000-0000-4000-8000-00000000a001", email: "prueba-tableros@local", displayName: "Prueba", roleId: "admin", roleName: "Admin",
    permissions: { pages: {}, actions: { manage_roles: true }, groups: {} }, defaultPage: null,
  };
  const accesoAdmin: Acceso = { usuario: { rolId: "admin", esAdmin: true, personaId: null }, reglas: [] };
  let tableroId = "";

  afterAll(async () => {
    if (tableroId) await db().from("tableros").delete().eq("id", tableroId);
  });

  it("crea, edita estructura y valores, guarda historial y aplica «solo lo mío»", async () => {
    tableroId = await crearTablero({ nombre: "Prueba automática de tableros", codigo: "TEST", categoria: "proyecto" }, admin);
    let t = (await leerTablero(tableroId, accesoAdmin))!;
    expect(t.grupos).toHaveLength(1);
    expect(t.columnas.map((c) => c.rol)).toEqual(["status", "responsable", "plan", "fecha_limite", "fin_real", "costo"]);
    const run = (datos: Record<string, unknown>, acceso = accesoAdmin) => ejecutarOperacion(admin, acceso, t.tablero, datos);

    // Estructura: grupo, columna de subelementos
    await run({ op: "grupo.crear", titulo: "Fase 2" });
    await run({ op: "columna.crear", nivel: "sub", titulo: "Responsable", tipo: "persona", rol: "responsable" });
    await expect(run({ op: "columna.crear", nivel: "item", titulo: "Otra", tipo: "fecha", rol: "fecha_limite" })).rejects.toThrow(/Ya hay una columna/);

    // Elementos y valores
    const [ana, luis] = (await db().from("personas").select("id").eq("activo", true).limit(2)).data!.map((p) => p.id);
    const { id: item1 } = (await run({ op: "elemento.crear", grupoId: t.grupos[0].id, nombre: "Entregable A" })) as { id: string };
    const { id: item2 } = (await run({ op: "elemento.crear", grupoId: t.grupos[0].id, nombre: "Entregable B" })) as { id: string };
    const { id: sub1 } = (await run({ op: "elemento.crear", parentId: item2, nombre: "Actividad B.1" })) as { id: string };
    t = (await leerTablero(tableroId, accesoAdmin))!;
    const c = (rol: string, nivel = "item") => t.columnas.find((x) => x.rol === rol && x.nivel === nivel)!;

    const statusListo = (c("status").config as { etiquetas: { id: string; categoria: string }[] }).etiquetas.find((e) => e.categoria === "hecho")!.id;
    await run({ op: "valor.cambiar", elementoId: item1, columnaId: c("status").id, valor: statusListo });
    await run({ op: "valor.cambiar", elementoId: item1, columnaId: c("costo").id, valor: "1,500.5" });
    await run({ op: "valor.cambiar", elementoId: item1, columnaId: c("plan").id, valor: { desde: "2026-12-01", hasta: "2026-11-20" } });
    await run({ op: "valor.cambiar", elementoId: item1, columnaId: c("responsable").id, valor: [ana] });
    await run({ op: "valor.cambiar", elementoId: sub1, columnaId: c("responsable", "sub").id, valor: [ana, luis] });
    await expect(run({ op: "valor.cambiar", elementoId: sub1, columnaId: c("costo").id, valor: 1 })).rejects.toThrow(/nivel/);
    await run({ op: "elemento.renombrar", elementoId: item1, nombre: "Entregable A (v2)" });

    t = (await leerTablero(tableroId, accesoAdmin))!;
    const e1 = t.elementos.find((e) => e.id === item1)!;
    expect(e1.nombre).toBe("Entregable A (v2)");
    expect(e1.valores[c("costo").id]).toBe(1500.5);
    expect(e1.valores[c("plan").id]).toEqual({ desde: "2026-11-20", hasta: "2026-12-01" });
    expect(e1.responsables).toEqual([ana]);
    expect(t.elementos.find((e) => e.id === sub1)!.responsables).toEqual([ana, luis]);

    // Vaciar una celda la quita del jsonb
    await run({ op: "valor.cambiar", elementoId: item1, columnaId: c("costo").id, valor: null });
    t = (await leerTablero(tableroId, accesoAdmin))!;
    expect(c("costo").id in t.elementos.find((e) => e.id === item1)!.valores).toBe(false);

    // Historial
    const h = await leerHistorial(tableroId, item1);
    expect(h.map((x) => x.campo)).toEqual(expect.arrayContaining(["creado", "valor", "nombre"]));
    expect(h.filter((x) => x.campo === "valor")).toHaveLength(5);

    // «Solo lo mío»: un rol que solo edita Status de lo suyo (regla solo para este tablero)
    await db().from("tablero_permisos").insert({ rol_id: "viewer", tablero_id: tableroId, nivel: "editar_valores", columnas_editables: ["status"], solo_lo_mio: true });
    const accesoAna: Acceso = {
      usuario: { rolId: "viewer", esAdmin: false, personaId: ana },
      reglas: [{ rolId: "viewer", tableroId, categoria: null, nivel: "editar_valores" as const, columnasEditables: ["status"], soloLoMio: true }],
    };
    const visto = (await leerTablero(tableroId, accesoAna))!;
    expect(visto.elementos.map((e) => e.id).sort()).toEqual([item1, item2, sub1].sort()); // item1 suyo; sub1 suyo + su padre item2
    await run({ op: "valor.cambiar", elementoId: item1, columnaId: c("status").id, valor: null }, accesoAna);
    await expect(run({ op: "valor.cambiar", elementoId: item1, columnaId: c("costo").id, valor: 5 }, accesoAna)).rejects.toThrow(/columna/);
    await expect(run({ op: "columna.crear", nivel: "item", titulo: "X", tipo: "texto" }, accesoAna)).rejects.toThrow(/no alcanza/);

    // Archivar: el grupo con sus elementos; el tablero necesita al menos un grupo
    await run({ op: "elemento.archivar", elementoId: item2 });
    t = (await leerTablero(tableroId, accesoAdmin))!;
    expect(t.elementos.map((e) => e.id)).toEqual([item1]); // item2 y su subelemento se fueron
    const fase2 = t.grupos.find((g) => g.titulo === "Fase 2")!;
    await run({ op: "grupo.archivar", grupoId: fase2.id });
    await expect(run({ op: "grupo.archivar", grupoId: t.grupos[0].id })).rejects.toThrow(/al menos un grupo/);
  });
});
