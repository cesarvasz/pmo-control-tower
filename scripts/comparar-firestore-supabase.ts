// scripts/comparar-firestore-supabase.ts
// Fases 3-4 de la migración: comprueba que la app ve EXACTAMENTE lo mismo leyendo de Supabase
// que leyendo de Firestore. Corre cada lector viejo (firebase-admin.ts / mapeo de Firestore) y su
// reemplazo (store.ts, roles.ts, groups.ts, users.ts, surveys.ts) y compara los resultados.
//
//   npx tsx scripts/comparar-firestore-supabase.ts
//
// Solo lee. Las fechas se comparan como instante (ISO normalizado) y se ignoran las llaves con
// valor undefined. Sale con código 1 si hay alguna diferencia. Se borra en la fase 6.

import * as viejo from "@/lib/firebase-admin";
import * as nuevo from "@/lib/store";
import { listRoles } from "@/lib/roles";
import { listGroups } from "@/lib/groups";
import { listUsers } from "@/lib/users";
import { listNpsRecords, listSurveys } from "@/lib/surveys";
import { canon, conComentario, diferencias, encuestasViejas, gruposViejos, npsViejo, porId, rolesViejos, usuariosViejos } from "./legadoFirestore";
import type { AttributionKind } from "@/types";

process.loadEnvFile(".env.local");

const KINDS: AttributionKind[] = ["delay", "reproceso", "delay-cku", "reproceso-cku"];

const COMPARACIONES: [string, () => Promise<unknown>, () => Promise<unknown>][] = [
  ["Baselines REQ", viejo.getReqBaselines, nuevo.getReqBaselines],
  ["Baselines items de Proyecto", viejo.getProjItemBaselines, nuevo.getProjItemBaselines],
  ...KINDS.map((k): [string, () => Promise<unknown>, () => Promise<unknown>] =>
    [`Atribuciones ${k}`, () => viejo.getAttributions(k), () => nuevo.getAttributions(k)]),
  // Califs viejas sin `comentario` salen como "" desde Supabase; la app siempre lee `comentario ?? ""`.
  ["Metodología", async () => conComentario(await viejo.getMetodologiaCalifs()), nuevo.getMetodologiaCalifs],
  ["VPA", viejo.getVpaCalifs, nuevo.getVpaCalifs],
  ["Metas de Implementación", viejo.getMetasImplementacion, nuevo.getMetasImplementacion],
  ["On Hold", viejo.getOnHold, nuevo.getOnHold],
  ["Detalle de atrasos", viejo.getAtrasoDetalles, nuevo.getAtrasoDetalles],
  ["Alcance de boards", viejo.getBoardAlcances, nuevo.getBoardAlcances],
  ["Clasificación A/B/C", viejo.getClases, nuevo.getClases],
  ["Histórico semanal", viejo.listWeeklySnapshots, nuevo.listWeeklySnapshots],
  ["Fechas de preprod", viejo.getPreprodRestoreDates, nuevo.getPreprodRestoreDates],
  ["Suplentes Buenas noticias", viejo.getBuenasNoticiasSuplentes, nuevo.getBuenasNoticiasSuplentes],
  ["Roles", async () => porId(await rolesViejos(), "id"), async () => porId(await listRoles(), "id")],
  ["Grupos del menú", async () => porId(await gruposViejos(), "id"), async () => porId(await listGroups(), "id")],
  ["Usuarios (rol / página / nombre)", async () => porId(await usuariosViejos(), "email"),
    async () => porId((await listUsers()).map((u) => ({ email: u.email, roleId: u.roleId, defaultPage: u.defaultPage, displayName: u.displayName })), "email")],
  ["Encuestas", async () => porId(await encuestasViejas(), "token"), async () => porId(await listSurveys(), "token")],
  ["Registros NPS", async () => porId(await npsViejo(), "token"), async () => porId(await listNpsRecords(), "token")],
];

async function main() {
  let fallas = 0;
  for (const [nombre, deFirestore, deSupabase] of COMPARACIONES) {
    const [a, b] = await Promise.all([deFirestore(), deSupabase()]);
    const difs = diferencias(canon(a), canon(b));
    const n = Array.isArray(a) ? a.length : a && typeof a === "object" ? Object.keys(a).length : 0;
    if (!difs.length) { console.log(`✔ ${nombre} (${n})`); continue; }
    fallas++;
    console.log(`✖ ${nombre} — ${difs.length} diferencia(s):`);
    for (const d of difs.slice(0, 8)) console.log(`    ${d}`);
    if (difs.length > 8) console.log(`    … y ${difs.length - 8} más`);
  }
  console.log(fallas ? `\n${fallas} comparación(es) con diferencias.` : "\nTodo idéntico: Supabase devuelve lo mismo que Firestore.");
  process.exit(fallas ? 1 : 0);
}

main().catch((err) => { console.error("✖", err instanceof Error ? err.message : err); process.exit(1); });
