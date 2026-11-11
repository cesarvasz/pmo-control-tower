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

  it("dashboardRawDesdeTableros da un DashboardRaw completo", async () => {
    const raw = await dashboardRawDesdeTableros();
    expect(raw.iniItems.length).toBeGreaterThan(0);
    expect(raw.reqItems.length).toBeGreaterThan(0);
    expect(raw.hrItems.length).toBeGreaterThan(0);
    expect(raw.projRaw.length).toBe(raw.projBoards.length);
  });
});
