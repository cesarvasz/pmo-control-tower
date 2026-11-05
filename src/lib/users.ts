// src/lib/users.ts
// SOLO SERVIDOR. Usuarios de la app en Supabase (tabla "app_users", id = usuario de
// Supabase Auth). Cada usuario referencia un roleId; los permisos efectivos se resuelven
// desde el rol. Sin rol = cuenta EN ESPERA: se registró sola y un Admin aún no la aprueba.

import { randomInt } from "node:crypto";
import { verifyRequest, type VerifiedUser } from "@/lib/auth-server";
import { emptyPermissions, type AppUser, type Group } from "@/lib/permissions";
import { resolvePermissions } from "@/lib/registry";
import { ensureDefaultRoles, getRole, listRoles } from "@/lib/roles";
import { ensureDefaultGroups, listGroups } from "@/lib/groups";
import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import { iso } from "@/lib/storeRows";
import { errorDePassword, generarPasswordTemporal } from "@/lib/password";
import type { Tables } from "@/types/supabase";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function recordToAppUser(
  r: Tables<"app_users">,
  groups: Group[],
  roleName: string,
  permissions: AppUser["permissions"]
): AppUser {
  return {
    uid: r.id,
    email: r.email,
    displayName: r.display_name || r.email,
    roleId: r.role_id,
    roleName,
    // Permisos EFECTIVOS: los grupos concedidos se aplanan a sus páginas.
    permissions: resolvePermissions(permissions, groups),
    defaultPage: r.default_page,
    mustChangePassword: r.must_change_password,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

async function toAppUser(r: Tables<"app_users">, groups: Group[]): Promise<AppUser> {
  const role = r.role_id ? await getRole(r.role_id) : null;
  return recordToAppUser(r, groups, role?.name ?? "(sin rol)", role?.permissions ?? emptyPermissions());
}

/**
 * Garantiza la fila del usuario. Un usuario NUEVO entra sin rol (en espera) hasta que un
 * Admin se lo asigne en /usuarios. Ya no existe "el primer usuario es Admin": con registro
 * abierto y sin confirmar el correo, cualquiera podría aprovecharlo.
 */
export async function ensureUser(v: VerifiedUser): Promise<Tables<"app_users">> {
  await Promise.all([ensureDefaultRoles(), ensureDefaultGroups()]);
  const db = getSupabaseAdmin();

  const actual = unwrap(await db.from("app_users").select("*").eq("id", v.uid).maybeSingle());
  if (actual) {
    const patch: { email?: string; display_name?: string; updated_at?: string } = {};
    if (actual.email !== v.email) patch.email = v.email;
    if (!actual.display_name && v.name) patch.display_name = v.name;
    if (Object.keys(patch).length === 0) return actual;
    patch.updated_at = new Date().toISOString();
    const rows = unwrap(await db.from("app_users").update(patch).eq("id", v.uid).select("*")) ?? [];
    return rows[0] ?? actual;
  }

  // ignoreDuplicates: si llegan dos /api/me a la vez en el primer ingreso, no choca.
  unwrap(await db.from("app_users").upsert(
    { id: v.uid, email: v.email, display_name: v.name, role_id: null },
    { onConflict: "id", ignoreDuplicates: true },
  ));
  const creada = unwrap(await db.from("app_users").select("*").eq("id", v.uid).maybeSingle());
  if (!creada) throw new Error("user-not-found");
  return creada;
}

/** Perfil del usuario actual con permisos efectivos resueltos desde su rol. */
export async function getMe(v: VerifiedUser): Promise<AppUser> {
  const groups = await listGroups();
  return toAppUser(await ensureUser(v), groups);
}

export async function listUsers(): Promise<AppUser[]> {
  const [roles, groups] = await Promise.all([listRoles(), listGroups()]);
  const map = new Map(roles.map((r) => [r.id, r]));
  const rows = unwrap(await getSupabaseAdmin().from("app_users").select("*")) ?? [];
  const users = rows.map((r) => {
    const role = r.role_id ? map.get(r.role_id) : null;
    return recordToAppUser(r, groups, role?.name ?? "(sin rol)", role?.permissions ?? emptyPermissions());
  });
  return users.sort((a, b) => a.email.localeCompare(b.email));
}

/** Actualiza rol y/o página principal de un usuario. Ambos campos son opcionales
 *  e independientes (solo se escribe lo que venga en el patch). */
export async function updateUser(
  uid: string,
  patch: { roleId?: string; defaultPage?: string | null }
): Promise<AppUser> {
  if (!UUID_RE.test(uid)) throw new Error("user-not-found");
  const write: { updated_at: string; role_id?: string; default_page?: string | null } = { updated_at: new Date().toISOString() };
  if (patch.roleId !== undefined) {
    if (!(await getRole(patch.roleId))) throw new Error("role-not-found");
    write.role_id = patch.roleId;
  }
  if (patch.defaultPage !== undefined) write.default_page = patch.defaultPage;

  const rows = unwrap(await getSupabaseAdmin().from("app_users").update(write).eq("id", uid).select("*")) ?? [];
  if (rows.length === 0) throw new Error("user-not-found");
  return toAppUser(rows[0], await listGroups());
}

// ── Contraseñas (sin correo: las maneja un Admin) ───────────────────────

/** Le pone a un usuario una contraseña temporal NUEVA y lo obliga a cambiarla al entrar.
 *  Devuelve la contraseña: se muestra UNA vez al Admin, no se guarda en ningún lado. */
export async function setTemporaryPassword(uid: string): Promise<string> {
  if (!UUID_RE.test(uid)) throw new Error("user-not-found");
  const db = getSupabaseAdmin();
  const existe = unwrap(await db.from("app_users").select("id").eq("id", uid).maybeSingle());
  if (!existe) throw new Error("user-not-found");

  const password = generarPasswordTemporal(randomInt);
  const { error } = await db.auth.admin.updateUserById(uid, { password });
  if (error) throw new Error(error.message);
  unwrap(await db.from("app_users").update({ must_change_password: true, updated_at: new Date().toISOString() }).eq("id", uid));
  return password;
}

/** El usuario cambia SU contraseña (la temporal, o por gusto). Quita la obligación de cambiarla. */
export async function changeOwnPassword(uid: string, password: string): Promise<void> {
  if (errorDePassword(password)) throw new Error("weak-password");
  const db = getSupabaseAdmin();
  const { error } = await db.auth.admin.updateUserById(uid, { password });
  if (error) throw new Error(error.message);
  unwrap(await db.from("app_users").update({ must_change_password: false, updated_at: new Date().toISOString() }).eq("id", uid));
}

// ── Guardas para los Route Handlers ─────────────────────────────────────

/** Verifica token + exige una cuenta APROBADA (con rol). Para lo que cualquier usuario
 *  de la app puede ver (dashboard, encuestas, ROI…). Lanza "pending-approval" si está en espera. */
export async function requireSession(authHeader: string | null): Promise<AppUser> {
  const me = await getMe(await verifyRequest(authHeader));
  if (!me.roleId) throw new Error("pending-approval");
  return me;
}

/** Verifica token + exige una acción concreta. Devuelve el solicitante. */
export async function requireAction(authHeader: string | null, action: string): Promise<AppUser> {
  const me = await requireSession(authHeader);
  if (!me.permissions.actions[action]) throw new Error("forbidden");
  return me;
}

/** Verifica token + exige el permiso de una página concreta. */
export async function requirePage(authHeader: string | null, pageKey: string): Promise<AppUser> {
  const me = await requireSession(authHeader);
  if (!me.permissions.pages[pageKey]) throw new Error("forbidden");
  return me;
}

/** Verifica token + exige AL MENOS UNA de las acciones dadas. */
export async function requireAnyAction(authHeader: string | null, actions: string[]): Promise<AppUser> {
  const me = await requireSession(authHeader);
  if (!actions.some((a) => me.permissions.actions[a])) throw new Error("forbidden");
  return me;
}
