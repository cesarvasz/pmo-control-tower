// src/lib/groups.ts
// SOLO SERVIDOR. CRUD de grupos dinámicos en Supabase (tabla "menu_groups").
// Un grupo agrupa páginas del catálogo (PAGES) para el sidebar y los permisos.

import type { Group } from "@/lib/permissions";
import { BOOTSTRAP_ADMIN_GROUP_ID, PAGES } from "@/lib/registry";
import { invalidateRolesCache } from "@/lib/roles";
import { getSupabaseAdmin, unwrap, unwrapOne } from "@/lib/supabase-admin";
import { iso } from "@/lib/storeRows";
import type { Tables } from "@/types/supabase";

const VALID_PAGE_KEYS = new Set(PAGES.map((p) => p.key));

// ── Caché en memoria (por instancia) ───────────────────────────────────
// listGroups() se invoca en cada getMe(); se cachea con TTL corto para no
// releer la tabla en cada request. Las mutaciones invalidan el caché.
const CACHE_TTL_MS = 60_000;
let groupsCache: { list: Group[]; at: number } | null = null;
let defaultsSeeded = false;

/** Invalida el caché de grupos (llamar tras cualquier escritura en la tabla). */
export function invalidateGroupsCache(): void {
  groupsCache = null;
}

function rowToGroup(r: Tables<"menu_groups">): Group {
  return {
    id: r.id,
    name: r.name || r.id,
    icon: r.icon || "🗂",
    pageKeys: r.page_keys ?? [],
    isSystem: r.is_system,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

// Páginas de administración que siempre deben estar en el grupo por defecto.
const ADMIN_PAGE_KEYS = ["usuarios", "roles", "grupos"];

/**
 * Siembra el grupo "Administración" la primera vez. Si ya existe pero le faltan
 * las páginas de admin (instancias migradas), las agrega automáticamente.
 */
export async function ensureDefaultGroups(): Promise<void> {
  if (defaultsSeeded) return;
  const db = getSupabaseAdmin();
  const actual = unwrap(await db.from("menu_groups").select("page_keys").eq("id", BOOTSTRAP_ADMIN_GROUP_ID).maybeSingle());
  const now = new Date().toISOString();

  if (!actual) {
    unwrap(await db.from("menu_groups").upsert(
      { id: BOOTSTRAP_ADMIN_GROUP_ID, name: "Administración", icon: "⚙", page_keys: ADMIN_PAGE_KEYS, is_system: true, created_at: now, updated_at: now },
      { onConflict: "id", ignoreDuplicates: true },
    ));
    invalidateGroupsCache();
    defaultsSeeded = true;
    return;
  }

  // Migración: agrega las páginas admin que falten en instalaciones previas.
  const current = actual.page_keys ?? [];
  const missing = ADMIN_PAGE_KEYS.filter((k) => !current.includes(k));
  if (missing.length) {
    unwrap(await db.from("menu_groups").update({ page_keys: [...current, ...missing], updated_at: now }).eq("id", BOOTSTRAP_ADMIN_GROUP_ID));
    invalidateGroupsCache();
  }
  defaultsSeeded = true;
}

/** Deja solo claves de página que existen en el catálogo, sin duplicados. */
function cleanPageKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  return [...new Set(keys.filter((k): k is string => typeof k === "string" && VALID_PAGE_KEYS.has(k)))];
}

export async function listGroups(): Promise<Group[]> {
  if (groupsCache && Date.now() - groupsCache.at < CACHE_TTL_MS) return groupsCache.list;
  const rows = unwrap(await getSupabaseAdmin().from("menu_groups").select("*")) ?? [];
  const list = rows
    .map(rowToGroup)
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.name.localeCompare(b.name));
  groupsCache = { list, at: Date.now() };
  return list;
}

export async function getGroup(id: string): Promise<Group | null> {
  const row = unwrap(await getSupabaseAdmin().from("menu_groups").select("*").eq("id", id).maybeSingle());
  return row ? rowToGroup(row) : null;
}

export async function createGroup(name: string, icon: string, pageKeys: unknown): Promise<Group> {
  const row = unwrapOne(await getSupabaseAdmin().from("menu_groups").insert({
    name: name.trim() || "Grupo sin nombre",
    icon: (icon || "🗂").trim(),
    page_keys: cleanPageKeys(pageKeys),
  }).select("*").single());
  invalidateGroupsCache();
  return rowToGroup(row);
}

export async function updateGroup(
  id: string,
  patch: { name?: string; icon?: string; pageKeys?: unknown }
): Promise<Group> {
  const update: { updated_at: string; name?: string; icon?: string; page_keys?: string[] } = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name.trim() || "Grupo sin nombre";
  if (patch.icon !== undefined) update.icon = (patch.icon || "🗂").trim();
  if (patch.pageKeys !== undefined) update.page_keys = cleanPageKeys(patch.pageKeys);

  const rows = unwrap(await getSupabaseAdmin().from("menu_groups").update(update).eq("id", id).select("*")) ?? [];
  if (rows.length === 0) throw new Error("group-not-found");
  invalidateGroupsCache();
  return rowToGroup(rows[0]);
}

/** Borra el grupo y lo quita de los permisos de cada rol que lo concedía, en una sola
 *  transacción (función borrar_grupo). Lanza group-not-found / group-is-system. */
export async function deleteGroup(id: string): Promise<void> {
  unwrap(await getSupabaseAdmin().rpc("borrar_grupo", { p_id: id }));
  invalidateGroupsCache();
  invalidateRolesCache(); // los permisos de roles pudieron cambiar
}
