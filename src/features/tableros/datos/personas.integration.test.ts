// Importación del directorio CONTRA LA BASE REAL (lee .env.local). Escribe en la tabla personas.
// No corre en `npm test` ni en CI: solo con  TABLEROS_IT=1 npx vitest run src/features/tableros/datos/personas.integration.test.ts
// 1) Importa el Directorio RH desde Monday (refresca la copia) → personas.
// 2) Vuelve a importar sin refrescar: no debe haber nada nuevo ni cambiado (idempotente).
// 3) Cada persona ligada a un usuario tiene el mismo correo que ese usuario.

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ACTIVO = process.env.TABLEROS_IT === "1";
if (ACTIVO && existsSync(".env.local")) process.loadEnvFile(".env.local");

describe.skipIf(!ACTIVO)("Tableros · directorio de personas (integración)", { timeout: 120_000 }, async () => {
  const { importarPersonasDesdeMonday, listarPersonas } = await import("./personas");

  it("importa el Directorio RH, es idempotente y liga por correo", async () => {
    const r1 = await importarPersonasDesdeMonday(true);
    console.log("1ª importación:", r1);
    expect(r1.leidas).toBeGreaterThan(0);

    const r2 = await importarPersonasDesdeMonday(false);
    console.log("2ª importación:", r2);
    expect(r2).toMatchObject({ leidas: r1.leidas, nuevas: 0, actualizadas: 0, desactivadas: 0, ligadas: r1.ligadas });

    const personas = await listarPersonas();
    expect(personas.filter((p) => p.mondayItemId).length).toBe(r1.leidas);
    for (const p of personas.filter((x) => x.appUserId && x.usuarioEmail)) {
      expect(p.usuarioEmail!.toLowerCase()).toBe(p.email);
    }
  });
});
