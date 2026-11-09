// scripts/migrar-firestore.ts
// Fase 3 de la migración: copia los datos de Firestore a Supabase.
//
//   npx tsx scripts/migrar-firestore.ts             → SIMULA: lee todo y muestra qué haría (no escribe)
//   npx tsx scripts/migrar-firestore.ts --aplicar   → escribe en Supabase
//
// · Firestore solo se LEE.
// · Supabase: upsert por llave primaria (manda Firestore) y «espejo»: lo que sobra en Supabase y no
//   está en Firestore se borra (p. ej. baselines que guardó el localhost). Roles, grupos y usuarios
//   NO se espejan: solo se agregan o actualizan.
// · Usuarios: a cada correo de Firestore se le crea su cuenta en Supabase Auth (confirmada y SIN
//   contraseña: un Admin le da una temporal desde /usuarios) y su fila en app_users con el mismo rol.
// · Idempotente: se puede correr las veces que haga falta; la última, justo antes del corte (fase 5).
//
// Lee las llaves de .env.local (Firebase Admin + Supabase secret). Se borra en la fase 6.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminDb } from "@/lib/firebase-admin";
import { enTrozos, getSupabaseAdmin, selectAll } from "@/lib/supabase-admin";
import {
  COLECCIONES, LLAVES, SIN_ESPEJO, TABLAS, llaveDe, planMigracion,
  type DocCrudo, type FirestoreCrudo, type Tabla,
} from "@/lib/migracionFirestore";

process.loadEnvFile(".env.local");
const APLICAR = process.argv.includes("--aplicar");
const sb = () => getSupabaseAdmin() as unknown as SupabaseClient; // sin tipos: se recorre tabla por tabla
const MAX_AVISOS = 40;

function falla(contexto: string, error: { message: string } | null): void {
  if (error) throw new Error(`${contexto}: ${error.message}`);
}

async function leerFirestore(): Promise<FirestoreCrudo> {
  const db = getAdminDb();
  const out: FirestoreCrudo = {};
  await Promise.all(COLECCIONES.map(async (c) => {
    const snap = await db.collection(c).get();
    out[c] = snap.docs.map((d): DocCrudo => ({ id: d.id, data: d.data() }));
  }));
  return out;
}

async function llavesEnSupabase(tabla: Tabla): Promise<Set<string>> {
  const cols = LLAVES[tabla];
  const filas = await selectAll<Record<string, unknown>>((a, b) => {
    let q = sb().from(tabla).select(cols.join(","));
    for (const c of cols) q = q.order(c);
    return q.range(a, b) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: null }>;
  });
  return new Set(filas.map((f) => llaveDe(tabla, f)));
}

async function borrar(tabla: Tabla, llaves: string[]): Promise<void> {
  const cols = LLAVES[tabla];
  if (cols.length === 1) {
    for (const trozo of enTrozos(llaves, 200)) {
      const { error } = await sb().from(tabla).delete().in(cols[0], trozo);
      falla(`borrar ${tabla}`, error);
    }
    return;
  }
  // Llave de 2 columnas: se agrupa por la primera.
  const porPrimera = new Map<string, string[]>();
  for (const k of llaves) {
    const [a, b] = k.split("\u0001");
    porPrimera.set(a, [...(porPrimera.get(a) ?? []), b]);
  }
  for (const [a, segundas] of porPrimera) {
    for (const trozo of enTrozos(segundas, 200)) {
      const { error } = await sb().from(tabla).delete().eq(cols[0], a).in(cols[1], trozo);
      falla(`borrar ${tabla}`, error);
    }
  }
}

async function upsert(tabla: string, filas: object[], onConflict: string): Promise<void> {
  for (const trozo of enTrozos(filas, 500)) {
    // defaultToNull:false → una columna que la fila no trae (fecha inválida en Firestore) toma su
    // default (now()) en vez de null.
    const { error } = await sb().from(tabla).upsert(trozo, { onConflict, defaultToNull: false });
    falla(`upsert ${tabla}`, error);
  }
}

async function cuentasAuth(): Promise<Map<string, string>> {
  const porEmail = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await sb().auth.admin.listUsers({ page, perPage: 1000 });
    falla("listar cuentas de Auth", error);
    for (const u of data.users) if (u.email) porEmail.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) return porEmail;
  }
}

async function main() {
  console.log(APLICAR ? "▶ MIGRACIÓN (escribe en Supabase)\n" : "▶ SIMULACIÓN (no escribe nada; usa --aplicar para escribir)\n");

  const fs = await leerFirestore();
  console.log("Firestore:", Object.entries(fs).map(([c, d]) => `${c}=${d.length}`).join("  "), "\n");

  const { filas, usuarios, avisos } = planMigracion(fs);

  // ── Diferencias por tabla ──
  const resumen: { tabla: string; firestore: number; nuevas: number; actualizar: number; borrar: number }[] = [];
  const sobrantes = new Map<Tabla, string[]>();
  for (const t of TABLAS) {
    const existentes = await llavesEnSupabase(t);
    const plan = new Set((filas[t] as Record<string, unknown>[]).map((f) => llaveDe(t, f)));
    const nuevas = [...plan].filter((k) => !existentes.has(k)).length;
    const sobra = SIN_ESPEJO.has(t) ? [] : [...existentes].filter((k) => !plan.has(k));
    sobrantes.set(t, sobra);
    resumen.push({ tabla: t, firestore: plan.size, nuevas, actualizar: plan.size - nuevas, borrar: sobra.length });
  }

  // ── Usuarios ──
  const auth = await cuentasAuth();
  const { data: appUsers, error } = await sb().from("app_users").select("id, email, role_id");
  falla("leer app_users", error);
  const appPorId = new Map((appUsers ?? []).map((u) => [u.id as string, u as { id: string; email: string; role_id: string | null }]));
  const crearCuenta = usuarios.filter((u) => !auth.has(u.email));
  const cambiosDeRol = usuarios
    .map((u) => ({ u, actual: auth.has(u.email) ? appPorId.get(auth.get(u.email)!) : undefined }))
    .filter(({ u, actual }) => actual && actual.role_id !== u.roleId);
  const correosFirestore = new Set(usuarios.map((u) => u.email));
  const soloEnSupabase = (appUsers ?? []).filter((u) => !correosFirestore.has(u.email as string));
  resumen.push({ tabla: "app_users", firestore: usuarios.length, nuevas: crearCuenta.length, actualizar: usuarios.length - crearCuenta.length, borrar: 0 });

  console.table(resumen);
  console.log(`Cuentas nuevas en Supabase Auth (sin contraseña): ${crearCuenta.length}`);
  for (const { u, actual } of cambiosDeRol) console.log(`  · rol de ${u.email}: ${actual!.role_id ?? "(en espera)"} → ${u.roleId ?? "(en espera)"}`);
  if (soloEnSupabase.length) console.log(`Usuarios solo en Supabase (no se tocan): ${soloEnSupabase.map((u) => u.email).join(", ")}`);
  console.log(`Por rol: ${JSON.stringify(usuarios.reduce<Record<string, number>>((acc, u) => ({ ...acc, [u.roleId ?? "(en espera)"]: (acc[u.roleId ?? "(en espera)"] ?? 0) + 1 }), {}))}`);

  if (avisos.length) {
    console.log(`\nAvisos (${avisos.length}):`);
    for (const a of avisos.slice(0, MAX_AVISOS)) console.log("  ⚠", a);
    if (avisos.length > MAX_AVISOS) console.log(`  … y ${avisos.length - MAX_AVISOS} más`);
  }

  if (!APLICAR) {
    console.log("\nSimulación terminada. Nada se escribió.");
    return;
  }

  // ── Escritura ──
  // 1) Roles y grupos (app_users depende de roles).
  await upsert("roles", filas.roles, "id");
  await upsert("menu_groups", filas.menu_groups, "id");

  // 2) Cuentas de Auth que faltan + perfiles.
  for (const u of crearCuenta) {
    const { data, error: e } = await sb().auth.admin.createUser({
      email: u.email, email_confirm: true, user_metadata: { name: u.displayName },
    });
    falla(`crear cuenta ${u.email}`, e);
    auth.set(u.email, data.user!.id);
  }
  await upsert("app_users", usuarios.map((u) => ({
    id: auth.get(u.email)!,
    email: u.email,
    display_name: u.displayName,
    role_id: u.roleId,
    default_page: u.defaultPage,
    firebase_uid: u.firebaseUid,
    ...(u.createdAt ? { created_at: u.createdAt } : {}),
    ...(u.updatedAt ? { updated_at: u.updatedAt } : {}),
  })), "id");

  // 3) Datos: primero se borra lo que sobra (así el índice de encuestas pendientes no choca), luego upsert.
  for (const t of TABLAS) {
    if (t === "roles" || t === "menu_groups") continue;
    const sobra = sobrantes.get(t) ?? [];
    if (sobra.length) await borrar(t, sobra);
    await upsert(t, filas[t], LLAVES[t].join(","));
  }

  console.log("\n✔ Migración aplicada. Corre scripts/comparar-firestore-supabase.ts para validar.");
}

main().then(() => process.exit(0), (err) => {
  console.error("\n✖", err instanceof Error ? err.message : err);
  process.exit(1);
});
