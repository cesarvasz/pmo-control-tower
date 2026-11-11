// FASE 4 — todo el portafolio, CONTRA MONDAY Y LA BASE REAL (lee .env.local).
// Importa (o vuelve a importar) TODOS los boards en orden — Estrategia, Iniciativas, PML,
// Proyectos — y comprueba que cada uno mide igual que en Monday con el procesador real de la app.
// Deja los tableros importados. No corre en `npm test` ni en CI:
//   TABLEROS_IT=1 npx vitest run src/features/tableros/datos/portafolio.integration.test.ts

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AppUser } from "@/lib/permissions";

const ACTIVO = process.env.TABLEROS_IT === "1";
/** Para correr solo algunos: TABLEROS_SOLO="PM-018|Iniciativas" */
const SOLO = process.env.TABLEROS_SOLO ? new RegExp(process.env.TABLEROS_SOLO) : null;
/** Solo comparar lo ya importado (sin reimportar ni perder su bitácora y archivos): TABLEROS_SOLO_COMPARAR=1 */
const SOLO_COMPARAR = process.env.TABLEROS_SOLO_COMPARAR === "1";

// Las diferencias ya decididas (p. ej. PM-018) las aparta compararConMonday (dominio/paridad.ts).
if (ACTIVO && existsSync(".env.local")) process.loadEnvFile(".env.local");

describe.skipIf(!ACTIVO)("Tableros · portafolio completo mide igual que Monday (integración)", { timeout: 2_400_000 }, async () => {
  const { importarBoard, listarBoardsImportables, compararConMonday } = await import("./importar");
  const { filaIgual } = await import("../dominio/paridad");
  const { leerTablero } = await import("./tableros");

  const admin: AppUser = {
    uid: "00000000-0000-4000-8000-00000000a001", email: "migracion-tableros@local", displayName: "Migración", roleId: "admin", roleName: "Admin",
    permissions: { pages: {}, actions: { manage_roles: true }, groups: {} }, defaultPage: null,
  };
  const acceso = { usuario: { rolId: "admin", esAdmin: true, personaId: null }, reglas: [] };

  it("importa todo y no hay diferencias", async () => {
    const boards = await listarBoardsImportables();
    const resumen: { board: string; tipo: string; elementos: string; omitidas: string; sinLigar: string; diferencias: number; avisos: string[]; muestra: string[] }[] = [];
    for (const b of boards.filter((x) => !SOLO || SOLO.test(x.nombre))) {
      const r = SOLO_COMPARAR && b.tableroId
        ? { tableroId: b.tableroId, elementos: 0, subelementos: 0, omitidas: [], personasNoEncontradas: [], ligadosNoEncontrados: [] }
        : await importarBoard(b.id, { refrescar: true, reemplazar: true }, admin);
      const t = (await leerTablero(r.tableroId, acceso))!;
      const cmp = await compararConMonday(t, acceso);
      const filasDistintas = cmp.filas.filter((f) => !filaIgual(f));
      resumen.push({
        board: b.nombre, tipo: b.tipo, elementos: `${r.elementos}+${r.subelementos}`,
        omitidas: r.omitidas.map((o) => `${o.titulo}(${o.tipo})`).join(", "),
        sinLigar: [...r.personasNoEncontradas, ...r.ligadosNoEncontrados].join(", "),
        ...(() => {
          const reales = [...cmp.diferencias, ...filasDistintas.map((f) => `${f.etiqueta}: ${f.monday} ≠ ${f.app}`)];
          return { diferencias: reales.length, muestra: [...reales.slice(0, 8), ...cmp.explicadas.map((x) => `(decidida, ${x.cantidad}) ${x.motivo}`)] };
        })(),
        avisos: cmp.avisos,
      });
    }
    for (const r of resumen) {
      console.log(`${r.diferencias === 0 ? "✓" : "✕"} [${r.tipo}] ${r.board} · ${r.elementos} · dif ${r.diferencias}` +
        `${r.omitidas ? ` · omitidas: ${r.omitidas}` : ""}${r.sinLigar ? ` · sin ligar: ${r.sinLigar}` : ""}`);
      for (const m of r.muestra) console.log(`     ${m}`);
      if (r.avisos.length) console.log(`     (aviso) ${r.avisos.length} valor(es) con personas fuera del directorio, p. ej.: ${r.avisos[0]}`);
    }
    expect(resumen.filter((r) => r.diferencias > 0).map((r) => r.board)).toEqual([]);
  });

  it("trae la bitácora y los archivos de todo (idempotente)", async () => {
    const { traerBitacoraYArchivos } = await import("./importar-extras");
    const importados = (await listarBoardsImportables()).filter((b) => b.tableroId && (!SOLO || SOLO.test(b.nombre)));
    let comentarios = 0, archivos = 0;
    const errores: string[] = [];
    for (const b of importados) {
      const r = await traerBitacoraYArchivos(b.tableroId!);
      comentarios += r.comentarios; archivos += r.archivos;
      errores.push(...r.errores.map((e) => `${b.nombre}: ${e}`));
      if (r.comentariosNuevos || r.archivosNuevos || r.archivosSinColumna) {
        console.log(`${b.nombre}: +${r.comentariosNuevos} actualizaciones, +${r.archivosNuevos} archivos${r.archivosSinColumna ? ` (${r.archivosSinColumna} adjuntos en la bitácora, no se traen)` : ""}`);
      }
    }
    console.log(`Total: ${comentarios} actualizaciones y ${archivos} archivos en ${importados.length} tableros`);
    expect(errores).toEqual([]);
  });
});
