// FASE 6 (preparación) — el dashboard COMPLETO leído de Supabase, CONTRA LA BASE REAL (lee .env.local).
// Arma el DashboardData con la copia de Monday y con los tableros, y comprueba que salen iguales
// (sin contar las diferencias decididas ni las personas fuera del directorio). Solo lee.
//   TABLEROS_IT=1 npx vitest run src/features/tableros/datos/dashboard.integration.test.ts

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ACTIVO = process.env.TABLEROS_IT === "1";
if (ACTIVO && existsSync(".env.local")) process.loadEnvFile(".env.local");

describe.skipIf(!ACTIVO)("Tableros · el dashboard completo leído de Supabase (integración)", { timeout: 180_000 }, async () => {
  const { compararDashboardCompleto, dashboardRawDesdeTableros } = await import("./fuente-dashboard");

  it("sale igual que con Monday: todas las secciones y los indicadores del Control Tower", async () => {
    const r = await compararDashboardCompleto();
    for (const s of r.secciones) {
      console.log(`${s.total ? "✕" : "✓"} ${s.nombre}: Monday ${s.monday} · Supabase ${s.supabase} · ${s.total} diferencias`
        + `${s.explicadas.length ? ` · ${s.explicadas.reduce((n, x) => n + x.cantidad, 0)} decididas` : ""}${s.avisos.length ? ` · ${s.avisos.length} avisos` : ""}`);
      for (const d of s.muestra.slice(0, 5)) console.log(`     ${d}`);
    }
    for (const k of r.kpis) console.log(`   ${k.etiqueta}: Monday ${k.monday} · Supabase ${k.supabase} (${k.estado})`);
    if (r.personasFuera.length) console.log(`   Personas fuera del directorio: ${r.personasFuera.join(", ")}`);
    expect(r.secciones.filter((s) => s.total > 0).map((s) => `${s.nombre}: ${s.muestra[0]}`)).toEqual([]);
    expect(r.kpis.filter((k) => k.estado === "distinta")).toEqual([]);
  });

  it("dashboardRawDesdeTableros da un DashboardRaw completo, listo para escribir en Monday", async () => {
    const raw = await dashboardRawDesdeTableros();
    expect(raw.iniItems.length).toBeGreaterThan(0);
    expect(raw.reqItems.length).toBeGreaterThan(0);
    expect(raw.hrItems.length).toBeGreaterThan(0);
    expect(raw.projRaw.length).toBe(raw.projBoards.length);
    // Lo que necesita el selector de status y la bitácora por correo (sale de la copia de Monday).
    const items = raw.projRaw.flatMap((b) => b.items_page.items).filter((i) => /^\d+$/.test(i.id));
    const subs = raw.projRaw.flatMap((b) => b.items_page.items.flatMap((i) => (i.subitems ?? []).map((s) => ({ board: b.id, s }))))
      .filter(({ s }) => /^\d+$/.test(s.id));
    expect(items.filter((i) => !i.email)).toEqual([]);
    expect(subs.filter(({ s }) => !s.board?.id).map(({ s }) => s.id)).toEqual([]);
    expect(subs.filter(({ board, s }) => s.board?.id === board).map(({ s }) => s.id)).toEqual([]); // el oculto, no el del proyecto
  });

  it("el refresh de un board da el mismo proyecto que la lectura completa", async () => {
    const { fuenteMondayDesdeTableros, proyectoDesdeTableros } = await import("./fuente-dashboard");
    const { buildIniLookup, projEnrichBoards, projProcess } = await import("@/lib/proj");
    const { fuente } = await fuenteMondayDesdeTableros();
    const raw = fuente.projRaw[0];
    const uno = await proyectoDesdeTableros(raw.id);
    expect(uno.projRaw).toEqual(raw);
    expect(uno.allBoardsMeta).toEqual(fuente.projBoards);
    const enriquecer = (ini: typeof fuente.iniItems, hr: typeof fuente.hrItems) =>
      projEnrichBoards(uno.allBoardsMeta, projProcess(raw.name, raw.id, raw.items_page.items), buildIniLookup(ini, hr)).find((b) => b.id === raw.id);
    expect(enriquecer(uno.iniItems, uno.hrItems)).toEqual(enriquecer(fuente.iniItems, fuente.hrItems));
    expect((await proyectoDesdeTableros("no-existe")).projRaw).toBeNull();
  });
});
