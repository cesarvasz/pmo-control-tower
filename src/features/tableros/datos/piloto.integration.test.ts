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
  const { leerTablero } = await import("./tableros");

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

    const cmp = await compararConMonday(t);
    console.log("Monday:", cmp.monday);
    console.log("App:   ", cmp.app);
    if (cmp.diferencias.length) console.log(cmp.diferencias.slice(0, 40).join("\n"));
    expect(cmp.diferencias).toEqual([]);
    expect(cmp.app).toEqual(cmp.monday);
  });
});
