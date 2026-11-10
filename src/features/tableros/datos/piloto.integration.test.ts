// PILOTO de la Fase 2, CONTRA MONDAY Y LA BASE REAL (lee .env.local).
// Importa (o vuelve a importar) PM-013 como tablero de la app y comprueba que MIDE IGUAL que en
// Monday: mismos ProjItem (lo que usan todas las métricas) y mismo EVM / salud / entregas.
// Deja el tablero importado (es el piloto). No corre en `npm test` ni en CI:
//   TABLEROS_IT=1 npx vitest run src/features/tableros/datos/piloto.integration.test.ts

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AppUser } from "@/lib/permissions";

const ACTIVO = process.env.TABLEROS_IT === "1";
if (ACTIVO && existsSync(".env.local")) process.loadEnvFile(".env.local");

const PILOTO = "PM-013";

describe.skipIf(!ACTIVO)(`Tableros · piloto ${PILOTO} mide igual que Monday (integración)`, { timeout: 180_000 }, async () => {
  const { importarBoard, listarBoardsImportables, compararConMonday } = await import("./importar");
  const { leerTablero, listarPersonasCorto } = await import("./tableros");
  const { calcularTablero } = await import("../dominio/calculos");
  const { traerBitacoraYArchivos } = await import("./importar-extras");

  const admin: AppUser = {
    uid: "00000000-0000-4000-8000-00000000a001", email: "piloto-tableros@local", displayName: "Piloto", roleId: "admin", roleName: "Admin",
    permissions: { pages: {}, actions: { manage_roles: true }, groups: {} }, defaultPage: null,
  };

  it("importa el board tal cual y las métricas coinciden", async () => {
    const board = (await listarBoardsImportables()).find((b) => b.nombre.startsWith(PILOTO));
    expect(board, `${PILOTO} en la copia de Monday`).toBeDefined();

    const r = await importarBoard(board!.id, { refrescar: true, reemplazar: true }, admin);
    console.log(`Importado: ${r.elementos} elementos, ${r.subelementos} subelementos · tablero ${r.tableroId}`);
    console.log("Columnas no importadas:", r.omitidas.map((o) => `${o.nivel}/${o.titulo} (${o.tipo})`).join(" · "));
    console.log("Personas no encontradas:", r.personasNoEncontradas.join(", ") || "ninguna");
    if (r.aviso) console.log(r.aviso);

    const t = (await leerTablero(r.tableroId, { usuario: { rolId: "admin", esAdmin: true, personaId: null }, reglas: [] }))!;
    console.log("Roles:", t.columnas.filter((c) => c.rol).map((c) => `${c.nivel}/${c.titulo}→${c.rol}`).join(" · "));

    console.log("Fórmulas:", t.columnas.filter((c) => c.tipo === "formula").map((c) => `${c.nivel}/${c.titulo} = ${(c.config as { expresion: string }).expresion}`).join(" · "));

    const cmp = await compararConMonday(t);
    console.log("Monday:", cmp.monday);
    console.log("App:   ", cmp.app);
    if (cmp.diferencias.length) console.log(cmp.diferencias.slice(0, 40).join("\n"));
    expect(cmp.diferencias).toEqual([]);
    expect(cmp.app).toEqual(cmp.monday);

    // Las fórmulas se calculan de verdad (si dieran vacío, projProcess usaría su respaldo y la
    // paridad pasaría igual): Limit Date = fin del Plan, Cost $ = esfuerzo × 9, Value $ = beneficio − costo.
    const personas = new Map((await listarPersonasCorto()).map((p) => [p.id, p]));
    const calc = calcularTablero(t, { personas });
    expect([...calc.errores.values()]).toEqual([]);
    const col = (titulo: string, nivel = "item") => t.columnas.find((c) => c.titulo === titulo && c.nivel === nivel)!;
    let revisadas = 0;
    for (const e of t.elementos) {
      const nivel = e.parentId ? "sub" : "item";
      const v = calc.valores.get(e.id)!;
      const plan = e.valores[col(nivel === "item" ? "CPM" : "Timeline", nivel).id] as { hasta: string } | undefined;
      expect(v[col("Limit Date", nivel).id] ?? null).toBe(plan?.hasta ?? null);
      if (nivel === "item") {
        const esfuerzo = (e.valores[col("Effort Spent").id] as number | undefined) ?? 0;
        const beneficio = (e.valores[col("Benefit $").id] as number | undefined) ?? 0;
        expect(v[col("Cost $").id]).toBeCloseTo(esfuerzo * 9);
        expect(v[col("Value $").id]).toBeCloseTo(beneficio - esfuerzo * 9);
      }
      if (plan) revisadas++;
    }
    const estados = t.elementos.filter((e) => !e.parentId).map((e) => calc.valores.get(e.id)![col("Completion Status").id]);
    console.log(`Fórmulas revisadas en ${revisadas} elementos con plan · Completion Status:`, Object.entries(estados.reduce<Record<string, number>>((m, x) => ({ ...m, [String(x)]: (m[String(x)] ?? 0) + 1 }), {})));
    expect(revisadas).toBeGreaterThan(100);
    const tld = t.columnas.find((c) => c.tipo === "espejo")!;
    expect(t.elementos.filter((e) => e.parentId).some((e) => calc.valores.get(e.id)![tld.id] === "JA")).toBe(true);

    // Fase 3: ya no falta nada que use el proyecto (solo Dependent On, sin uso, y el registro de creación).
    expect(r.omitidas.map((o) => o.tipo).sort()).toEqual(["dependencia", "registro"]);

    // Bitácora y archivos (dos veces: la segunda no trae nada nuevo).
    const ex = await traerBitacoraYArchivos(r.tableroId);
    console.log("Bitácora y archivos:", ex);
    expect(ex.errores).toEqual([]);
    expect(ex.comentariosNuevos).toBe(ex.comentarios);
    expect(ex.archivosNuevos).toBe(ex.archivos);
    const otra = await traerBitacoraYArchivos(r.tableroId);
    expect(otra).toMatchObject({ comentariosNuevos: 0, archivosNuevos: 0 });
  });
});
