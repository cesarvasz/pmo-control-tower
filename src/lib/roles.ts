// src/lib/roles.ts
// SOLO SERVIDOR. CRUD de roles en Supabase (tabla "roles") + sembrado base.

import { normalizePermissions, type Permissions, type Role } from "@/lib/permissions";
import { DEFAULT_ROLES, reconcileSystemAdmin } from "@/lib/registry";
import { DbError, getSupabaseAdmin, PG, unwrap, unwrapOne } from "@/lib/supabase-admin";
import { iso } from "@/lib/storeRows";
import type { Json, Tables } from "@/types/supabase";

// ── Caché en memoria (por instancia de servidor) ───────────────────────
// getMe() corre en CADA request protegido; sin caché, releer roles/grupos en
// cada llamada sería una consulta extra por request. Se cachea la lista completa
// de roles con un TTL corto; las mutaciones invalidan el caché.
const CACHE_TTL_MS = 60_000;
let rolesCache: { list: Role[]; map: Map<string, Role>; at: number } | null = null;
let defaultsSeeded = false;

/** Invalida el caché de roles (llamar tras cualquier escritura en la tabla). */
export function invalidateRolesCache(): void {
  rolesCache = null;
}

function rowToRole(r: Tables<"roles">): Role {
  return reconcileSystemAdmin({
    id: r.id,
    name: r.name || r.id,
    permissions: normalizePermissions(r.permissions as Partial<Permissions>),
    isSystem: r.is_system,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  });
}

async function getRolesCached(): Promise<{ list: Role[]; map: Map<string, Role> }> {
  if (rolesCache && Date.now() - rolesCache.at < CACHE_TTL_MS) return rolesCache;
  const rows = unwrap(await getSupabaseAdmin().from("roles").select("*")) ?? [];
  const list = rows
    .map(rowToRole)
    .sort((a, b) => Number(!!b.isSystem) - Number(!!a.isSystem) || a.name.localeCompare(b.name));
  rolesCache = { list, map: new Map(list.map((r) => [r.id, r])), at: Date.now() };
  return rolesCache;
}

/** Siembra los roles base la primera vez (tabla vacía). Idempotente.
 *  Tras confirmar (una vez por instancia) que ya existen, no vuelve a consultar. */
export async function ensureDefaultRoles(): Promise<void> {
  if (defaultsSeeded) return;
  const db = getSupabaseAdmin();
  const existentes = unwrap(await db.from("roles").select("id").limit(1)) ?? [];
  if (existentes.length === 0) {
    const now = new Date().toISOString();
    // ignoreDuplicates: si dos instancias siembran a la vez, la segunda no pisa a la primera.
    unwrap(await db.from("roles").upsert(
      DEFAULT_ROLES.map((r) => ({
        id: r.id,
        name: r.name,
        permissions: r.permissions as unknown as Json,
        is_system: !!r.isSystem,
        created_at: now,
        updated_at: now,
      })),
      { onConflict: "id", ignoreDuplicates: true },
    ));
    invalidateRolesCache();
  }
  defaultsSeeded = true;
}

export async function listRoles(): Promise<Role[]> {
  return (await getRolesCached()).list;
}

export async function getRole(id: string): Promise<Role | null> {
  return (await getRolesCached()).map.get(id) ?? null;
}

export async function createRole(name: string, permissions: Permissions): Promise<Role> {
  const row = unwrapOne(await getSupabaseAdmin().from("roles").insert({
    name: name.trim() || "Rol sin nombre",
    permissions: normalizePermissions(permissions) as unknown as Json,
    is_system: false,
  }).select("*").single());
  invalidateRolesCache();
  return rowToRole(row);
}

export async function updateRole(
  id: string,
  patch: { name?: string; permissions?: Permissions }
): Promise<Role> {
  const update: { updated_at: string; name?: string; permissions?: Json } = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name.trim() || "Rol sin nombre";
  if (patch.permissions) update.permissions = normalizePermissions(patch.permissions) as unknown as Json;

  const rows = unwrap(await getSupabaseAdmin().from("roles").update(update).eq("id", id).select("*")) ?? [];
  if (rows.length === 0) throw new Error("role-not-found");
  invalidateRolesCache();
  return rowToRole(rows[0]);
}

export async function deleteRole(id: string): Promise<void> {
  const db = getSupabaseAdmin();
  const rol = unwrap(await db.from("roles").select("is_system").eq("id", id).maybeSingle());
  if (!rol) throw new Error("role-not-found");
  if (rol.is_system) throw new Error("role-is-system");

  try {
    unwrap(await db.from("roles").delete().eq("id", id));
  } catch (err) {
    // La FK app_users.role_id → roles (on delete restrict) impide borrar un rol asignado.
    if (err instanceof DbError && err.code === PG.foreignKeyViolation) throw new Error("role-in-use");
    throw err;
  }
  invalidateRolesCache();
}
