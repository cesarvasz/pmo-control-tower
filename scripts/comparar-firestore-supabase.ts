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
import { normalizePermissions, type Permissions } from "@/lib/permissions";
import { reconcileSystemAdmin } from "@/lib/registry";
import type { AttributionKind, MetodologiaCalif } from "@/types";

process.loadEnvFile(".env.local");

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Forma comparable: fechas ISO al mismo formato, sin undefined, llaves ordenadas. */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (typeof v === "string" && ISO_RE.test(v)) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? v : new Date(t).toISOString();
  }
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => [k, canon((v as Record<string, unknown>)[k])]));
  }
  return v;
}

/** Lista de diferencias (ruta: viejo ≠ nuevo). */
function diferencias(a: unknown, b: unknown, ruta = ""): string[] {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja === jb) return [];
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    const llaves = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...llaves].flatMap((k) =>
      diferencias((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], ruta ? `${ruta}.${k}` : k));
  }
  return [`${ruta || "(raíz)"}: Firestore=${ja ?? "∅"}  Supabase=${jb ?? "∅"}`];
}

const porId = <T, K extends keyof T>(lista: T[], k: K) => Object.fromEntries(lista.map((x) => [String(x[k]), x]));

async function firestoreDocs(coll: string) {
  const snap = await viejo.getAdminDb().collection(coll).get();
  return snap.docs.map((d) => ({ id: d.id, d: d.data() }));
}

// Lectores viejos que ya no existen en el código (roles, grupos, usuarios, encuestas): se rearman
// aquí igual que estaban en main antes de la migración.
async function rolesViejos() {
  return (await firestoreDocs("roles")).map(({ id, d }) => reconcileSystemAdmin({
    id, name: d.name ?? id, permissions: normalizePermissions(d.permissions as Partial<Permissions>),
    isSystem: !!d.isSystem, createdAt: d.createdAt ?? undefined, updatedAt: d.updatedAt ?? undefined,
  }));
}
async function gruposViejos() {
  return (await firestoreDocs("groups")).map(({ id, d }) => ({
    id, name: d.name ?? id, icon: d.icon ?? "🗂", pageKeys: Array.isArray(d.pageKeys) ? d.pageKeys : [],
    isSystem: !!d.isSystem, createdAt: d.createdAt ?? undefined, updatedAt: d.updatedAt ?? undefined,
  }));
}
async function usuariosViejos() {
  // Solo lo que define el acceso: correo → rol, página principal y nombre.
  return (await firestoreDocs("users")).map(({ d }) => ({
    email: String(d.email ?? "").toLowerCase(),
    roleId: d.roleId ?? (d.role === "admin" ? "admin" : "viewer"),
    defaultPage: d.defaultPage ?? null,
    displayName: d.displayName ?? d.email ?? "",
  }));
}
async function encuestasViejas() {
  return (await firestoreDocs("surveys")).map(({ id, d }) => ({
    token: id, reqId: d.reqId ?? "", reqCode: d.reqCode ?? "", reqName: d.reqName ?? "", pm: d.pm ?? "",
    assignedEmail: (d.assignedEmail ?? "").toLowerCase(), assignedName: d.assignedName ?? "",
    createdByEmail: d.createdByEmail ?? "", createdAt: d.createdAt ?? "", answered: !!d.answered,
    answeredAt: d.answeredAt ?? null, invalidated: !!d.invalidated, cku: d.cku ?? "",
  }));
}
async function npsViejo() {
  const [resp, surveys] = await Promise.all([firestoreDocs("survey_responses"), firestoreDocs("surveys")]);
  const s = new Map(surveys.map(({ id, d }) => [id, d]));
  return resp.map(({ id, d: r }) => {
    const x = s.get(id) ?? {};
    return {
      answers: r.answers ?? {}, pm: x.pm ?? "", invalidated: !!x.invalidated, respondentEmail: r.respondentEmail ?? "",
      submittedAt: r.submittedAt ?? "", reqCode: x.reqCode ?? "", reqId: x.reqId ?? "", cku: x.cku ?? "", token: id,
    };
  });
}

const conComentario = (m: Record<string, MetodologiaCalif>) =>
  Object.fromEntries(Object.entries(m).map(([k, c]) => [k, { ...c, comentario: c.comentario ?? "" }]));

const KINDS: AttributionKind[] =["delay", "reproceso", "delay-cku", "reproceso-cku"];

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
