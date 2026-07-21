// src/lib/roles.ts
// SOLO SERVIDOR. CRUD de roles en Firestore (colección "roles") + sembrado base.

import { getAdminDb } from "@/lib/firebase-admin";
import { normalizePermissions, type Permissions, type Role } from "@/lib/permissions";
import { DEFAULT_ROLES, reconcileSystemAdmin } from "@/lib/registry";

const COLL = "roles";

// ── Caché en memoria (por instancia de servidor) ───────────────────────
// getMe() corre en CADA request protegido; sin caché, releer roles/grupos
// en cada llamada quema la cuota de lecturas de Firestore. Se cachea la lista
// completa de roles con un TTL corto; las mutaciones invalidan el caché.
const CACHE_TTL_MS = 60_000;
let rolesCache: { list: Role[]; map: Map<string, Role>; at: number } | null = null;
let defaultsSeeded = false;

/** Invalida el caché de roles (llamar tras cualquier escritura en la colección). */
export function invalidateRolesCache(): void {
  rolesCache = null;
}

async function getRolesCached(): Promise<{ list: Role[]; map: Map<string, Role> }> {
  if (rolesCache && Date.now() - rolesCache.at < CACHE_TTL_MS) return rolesCache;
  const snap = await getAdminDb().collection(COLL).get();
  const list = snap.docs
    .map((d) => docToRole(d.id, d.data()))
    .sort((a, b) => Number(!!b.isSystem) - Number(!!a.isSystem) || a.name.localeCompare(b.name));
  rolesCache = { list, map: new Map(list.map((r) => [r.id, r])), at: Date.now() };
  return rolesCache;
}

function docToRole(id: string, d: FirebaseFirestore.DocumentData): Role {
  return reconcileSystemAdmin({
    id,
    name: d.name ?? id,
    permissions: normalizePermissions(d.permissions as Partial<Permissions>),
    isSystem: !!d.isSystem,
    createdAt: d.createdAt ?? undefined,
    updatedAt: d.updatedAt ?? undefined,
  });
}

/** Siembra los roles base la primera vez (colección vacía). Idempotente.
 *  Tras confirmar (una vez por instancia) que ya existen, no vuelve a leer. */
export async function ensureDefaultRoles(): Promise<void> {
  if (defaultsSeeded) return;
  const db = getAdminDb();
  const snap = await db.collection(COLL).limit(1).get();
  if (!snap.empty) {
    defaultsSeeded = true;
    return;
  }
  const now = new Date().toISOString();
  const batch = db.batch();
  for (const r of DEFAULT_ROLES) {
    batch.set(db.collection(COLL).doc(r.id), {
      name: r.name,
      permissions: r.permissions,
      isSystem: !!r.isSystem,
      createdAt: now,
      updatedAt: now,
    });
  }
  await batch.commit();
  invalidateRolesCache();
  defaultsSeeded = true;
}

export async function listRoles(): Promise<Role[]> {
  return (await getRolesCached()).list;
}

export async function getRole(id: string): Promise<Role | null> {
  return (await getRolesCached()).map.get(id) ?? null;
}

export async function createRole(name: string, permissions: Permissions): Promise<Role> {
  const db = getAdminDb();
  const now = new Date().toISOString();
  const ref = await db.collection(COLL).add({
    name: name.trim() || "Rol sin nombre",
    permissions: normalizePermissions(permissions),
    isSystem: false,
    createdAt: now,
    updatedAt: now,
  });
  invalidateRolesCache();
  return docToRole(ref.id, (await ref.get()).data()!);
}

export async function updateRole(
  id: string,
  patch: { name?: string; permissions?: Permissions }
): Promise<Role> {
  const db = getAdminDb();
  const ref = db.collection(COLL).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("role-not-found");

  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name.trim() || "Rol sin nombre";
  if (patch.permissions) update.permissions = normalizePermissions(patch.permissions);

  await ref.set(update, { merge: true });
  invalidateRolesCache();
  return docToRole(id, (await ref.get()).data()!);
}

export async function deleteRole(id: string): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(COLL).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("role-not-found");
  if (snap.data()!.isSystem) throw new Error("role-is-system");

  const assigned = await db.collection("users").where("roleId", "==", id).limit(1).get();
  if (!assigned.empty) throw new Error("role-in-use");

  await ref.delete();
  invalidateRolesCache();
}
