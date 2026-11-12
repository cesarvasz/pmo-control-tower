// Prueba de PARIDAD de la copia de Monday, CONTRA MONDAY Y LA BASE REAL (lee .env.local).
// No corre en `npm test` ni en CI: solo con  MIRROR_IT=1 npx vitest run src/lib/mondayMirror.integration.test.ts
// 1) Corre la copia completa Monday → Supabase (escribe en monday_boards / monday_items).
// 2) Trae los mismos datos con las consultas que usa la app hoy (fetchDashboardRaw).
// 3) Reconstruye cada board desde Supabase y lista las diferencias (debe dar cero).
// Si alguien edita Monday justo entre 1) y 2) puede salir una diferencia suelta: se repite.

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ACTIVO = process.env.MIRROR_IT === "1";
if (ACTIVO && existsSync(".env.local")) process.loadEnvFile(".env.local");

describe.skipIf(!ACTIVO)("Copia de Monday · paridad (integración)", { timeout: 180_000 }, async () => {
  const { sincronizarTodo } = await import("@/lib/mondayMirrorSync");
  const { fetchDashboardRaw } = await import("@/lib/monday");
  const { leerBoardsEspejo, leerProjBoardsEspejo } = await import("@/lib/mondayMirrorRead");
  const { diferenciasItems } = await import("@/lib/mondayMirror");

  it("la copia reconstruida es igual a lo que la app lee de Monday", async () => {
    const t0 = Date.now();
    const sync = await sincronizarTodo("manual");
    console.log(`Copia completa en ${((Date.now() - t0) / 1000).toFixed(1)} s · run ${sync.runId}`);
    for (const b of sync.boards) console.log(`  ${b.tipo.padEnd(4)} ${b.board_id}  items+subitems=${b.items}  cambiados=${b.cambiados}  borrados=${b.borrados}`);
    expect(sync.errores).toEqual([]);

    const raw = await fetchDashboardRaw();
    const estId = process.env.MONDAY_EST_BOARD_ID || "18291587533";
    const ids = {
      ini: process.env.MONDAY_INI_BOARD_ID!, req: process.env.MONDAY_REQ_BOARD_ID!,
      rh: process.env.MONDAY_RH_BOARD_ID!, est: estId,
    };
    const espejo = await leerBoardsEspejo([...Object.values(ids), ...raw.projRaw.map((b) => b.id)]);
    const de = (id: string) => espejo.find((b) => b.id === id)?.items ?? [];

    const difs = [
      ...diferenciasItems("Iniciativas", raw.iniItems, de(ids.ini)),
      ...diferenciasItems("REQ", raw.reqItems, de(ids.req)),
      ...diferenciasItems("RH", raw.hrItems, de(ids.rh)),
      ...diferenciasItems("Estrategia", raw.estrategiaItems, de(ids.est)),
      ...raw.projRaw.flatMap((b) => diferenciasItems(b.name, b.items_page.items, de(b.id))),
    ];

    const projEspejo = (await leerProjBoardsEspejo()).map((b) => b.id).sort();
    const projApi = raw.projBoards.map((b) => b.id).sort();
    if (JSON.stringify(projEspejo) !== JSON.stringify(projApi)) difs.push(`Boards de Proyectos: ${projApi.length} en Monday vs ${projEspejo.length} en la copia`);

    console.log(`Items comparados: ini ${raw.iniItems.length} · req ${raw.reqItems.length} · rh ${raw.hrItems.length} · est ${raw.estrategiaItems.length} · proj ${raw.projRaw.reduce((n, b) => n + b.items_page.items.length, 0)} en ${raw.projRaw.length} boards`);
    if (difs.length) console.log(difs.slice(0, 50).join("\n"));
    expect(difs).toEqual([]);
  });
});
