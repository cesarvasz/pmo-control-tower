// Sincronización con Monday EN LOCAL (Tableros · Fase 5, convivencia): copia de Monday →
// directorio → cada tablero en orden → bitácora y archivos → comparación. Deja el registro en
// tablero_sincronizaciones (se ve en /tableros → Migración). No necesita el servidor de desarrollo.
//
//   npm run tableros:sincronizar
//
// La corre cada hora el Programador de tareas de Windows (scripts/tableros-sincronizar.cmd).
// Si ya hay una corrida en curso (p. ej. la del botón «Sincronizar ahora»), no hace nada.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { createJiti } from "jiti";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(raiz);
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// jiti carga el TypeScript de la app tal cual (con el alias "@/" de tsconfig).
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(raiz, "src") } });
const { iniciarCorrida, correrSincronizacion } = await jiti.import(path.join(raiz, "src/features/tableros/datos/sincronizar.ts"));

const hora = () => new Date().toLocaleString("es-GT", { hour12: false });
const inicio = Date.now();

let corridaId;
try {
  corridaId = await iniciarCorrida("programada");
} catch (e) {
  console.log(`[${hora()}] No se sincronizó: ${e instanceof Error ? e.message : e}`);
  process.exit(0);
}

console.log(`[${hora()}] Sincronización #${corridaId}…`);
const r = await correrSincronizacion(corridaId);
for (const b of r.boards) {
  const c = b.cambios;
  const partes = [
    b.importado && "importado (nuevo)",
    b.omitido,
    c?.renombrado && `renombrado en Monday: ${c.renombrado}`,
    c && (c.creados || c.actualizados || c.archivados || c.restaurados)
      && `+${c.creados} nuevos, ${c.actualizados} con cambios (${c.valores} valores), ${c.archivados} archivados, ${c.restaurados} restaurados`,
    c?.columnasNuevas.length && `columnas nuevas: ${c.columnasNuevas.join(", ")}`,
    (b.comentariosNuevos || b.archivosNuevos) && `+${b.comentariosNuevos ?? 0} actualizaciones, +${b.archivosNuevos ?? 0} archivos`,
    b.diferencias ? `${b.diferencias} diferencias con Monday` : null,
    b.error && `ERROR: ${b.error}`,
  ].filter(Boolean);
  if (partes.length) console.log(`  ${b.board}: ${partes.join(" · ")}`);
}
if (r.copia?.errores.length) console.log(`  Copia de Monday con errores: ${r.copia.errores.join(" | ")}`);
const errores = r.boards.filter((b) => b.error).length;
console.log(`[${hora()}] Listo en ${Math.round((Date.now() - inicio) / 1000)} s · ${r.boards.length} boards${errores ? ` · ${errores} con error` : ""}`);
process.exit(0);
