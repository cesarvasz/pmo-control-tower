// Ensayo (NO escribe) contra el Apps Script y la base reales:
//   REUNIONES_IT=1 npx vitest run src/lib/reunionesImportacion.integration.test.ts
import { describe, expect, it } from "vitest";
import { fetchWebAppCrudo } from "@/lib/monday";
import { llavesReunionesGuardadas } from "@/lib/reuniones";
import { planImportacion } from "@/lib/reunionesImportacion";

const IT = process.env.REUNIONES_IT === "1";
if (IT) process.loadEnvFile(".env.local");

describe.skipIf(!IT)("importación del histórico (ensayo, solo lectura)", () => {
  it("lee el calendario del Apps Script y cuenta qué se importaría", async () => {
    const { calData } = await fetchWebAppCrudo();
    const plan = planImportacion(calData, await llavesReunionesGuardadas());
    console.log(JSON.stringify({ leidas: calData.length, nuevas: plan.nuevas.length, yaEstaban: plan.yaEstaban, repetidas: plan.repetidas, invalidas: plan.invalidas, desde: plan.nuevas[0]?.inicio, hasta: plan.nuevas.at(-1)?.inicio }));
    expect(calData.length).toBeGreaterThanOrEqual(0);
    expect(plan.nuevas.length + plan.yaEstaban + plan.repetidas + plan.invalidas).toBe(calData.length);
  }, 60_000);
});
