// Plantillas DE PUNTA A PUNTA contra la base real (lee .env.local): guarda el piloto como plantilla,
// crea un tablero desde ella y comprueba que nace igual. Borra lo que crea (también si falla).
// Necesita el piloto importado (piloto.integration.test.ts). No corre en `npm test` ni en CI:
//   TABLEROS_IT=1 npx vitest run src/features/tableros/datos/plantillas.integration.test.ts

import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import type { AppUser } from "@/lib/permissions";
import type { Acceso } from "./tableros";

const ACTIVO = process.env.TABLEROS_IT === "1";
if (ACTIVO && existsSync(".env.local")) process.loadEnvFile(".env.local");

describe.skipIf(!ACTIVO)("Tableros · plantillas (integración)", { timeout: 120_000 }, async () => {
  const { leerTablero, listarTableros } = await import("./tableros");
  const { guardarComoPlantilla, crearDesdePlantilla, listarPlantillas } = await import("./plantillas");
  const { getSupabaseAdmin } = await import("@/lib/supabase-admin");

  const admin: AppUser = {
    uid: "00000000-0000-4000-8000-00000000a001", email: "prueba-tableros@local", displayName: "Prueba", roleId: "admin", roleName: "Admin",
    permissions: { pages: {}, actions: { manage_roles: true }, groups: {} }, defaultPage: null,
  };
  const acceso: Acceso = { usuario: { rolId: "admin", esAdmin: true, personaId: null }, reglas: [] };
  const NOMBRE = "Prueba automática · VALOR nueva plantilla";
  let plantillaId = "";
  let nuevoId = "";

  afterAll(async () => {
    if (nuevoId) await getSupabaseAdmin().from("tableros").delete().eq("id", nuevoId);
    if (plantillaId) await getSupabaseAdmin().from("plantillas").delete().eq("id", plantillaId);
  });

  it("guarda el piloto como plantilla y crea un tablero igual", async () => {
    const piloto = (await listarTableros(acceso)).find((t) => t.codigo === "PM-013" && t.mondayBoardId);
    expect(piloto, "piloto PM-013 importado").toBeDefined();
    const original = (await leerTablero(piloto!.id, acceso))!;

    plantillaId = await guardarComoPlantilla(original, { nombre: NOMBRE, conElementos: true }, admin);
    const p = (await listarPlantillas()).find((x) => x.id === plantillaId)!;
    expect(p.resumen).toMatchObject({ grupos: original.grupos.length, elementos: 31, subelementos: 123 });

    nuevoId = await crearDesdePlantilla(plantillaId, { nombre: "Prueba desde plantilla", codigo: "TEST-P" }, admin);
    const nuevo = (await leerTablero(nuevoId, acceso))!;
    expect(nuevo.tablero).toMatchObject({ categoria: "proyecto", plantillaId, mondayBoardId: null });
    const forma = (t: typeof original) => t.columnas.map((c) => [c.nivel, c.titulo, c.tipo, c.rol]).sort();
    expect(forma(nuevo)).toEqual(forma(original));
    expect(nuevo.grupos.map((g) => [g.titulo, g.fase])).toEqual(original.grupos.map((g) => [g.titulo, g.fase]));
    expect(nuevo.elementos.map((e) => e.nombre).sort()).toEqual(original.elementos.map((e) => e.nombre).sort());

    // Solo valores "de estructura": el Type (lista) sí; status, personas y fechas no.
    const tipo = nuevo.columnas.find((c) => c.rol === "tipo_elemento" && c.nivel === "item")!;
    const status = nuevo.columnas.find((c) => c.rol === "status" && c.nivel === "item")!;
    expect(nuevo.elementos.filter((e) => !e.parentId).every((e) => Array.isArray(e.valores[tipo.id]))).toBe(true);
    expect(nuevo.elementos.some((e) => status.id in e.valores)).toBe(false);
    expect(nuevo.elementos.every((e) => e.responsables.length === 0 && e.mondayItemId === null)).toBe(true);

    // Guardar con el mismo nombre actualiza la versión.
    expect(await guardarComoPlantilla(original, { nombre: NOMBRE }, admin)).toBe(plantillaId);
    expect((await listarPlantillas()).find((x) => x.id === plantillaId)!.version).toBe(2);
  });
});
