// src/lib/roles.ts
// SOLO SERVIDOR. CRUD de roles en Firestore (colección "roles") + sembrado base.

import { getAdminDb } from "@/lib/firebase-admin";
import { normalizePermissions, type Permissions, type Role } from "@/lib/permissions";
import { DEFAULT_ROLES } from "@/lib/registry";

const COLL = "roles";

function docToRole(id: string, d: FirebaseFirestore.DocumentData): Role {
  return {
    id,
    name: d.name ?? id,
    permissions: normalizePermissions(d.permissions as Partial<Permissions>),
    isSystem: !!d.isSystem,
    createdAt: d.createdAt ?? undefined,
    updatedAt: d.updatedAt ?? undefined,
  };
}

/** Siembra los roles base la primera vez (colección vacía). Idempotente. */
export async function ensureDefaultRoles(): Promise<void> {
  const db = getAdminDb();
  const snap = await db.collection(COLL).limit(1).get();
  if (!snap.empty) return;
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
}

export async function listRoles(): Promise<Role[]> {
  const db = getAdminDb();
  const snap = await db.collection(COLL).get();
  return snap.docs
    .map((d) => docToRole(d.id, d.data()))
    .sort((a, b) => Number(!!b.isSystem) - Number(!!a.isSystem) || a.name.localeCompare(b.name));
}

export async function getRole(id: string): Promise<Role | null> {
  const snap = await getAdminDb().collection(COLL).doc(id).get();
  return snap.exists ? docToRole(snap.id, snap.data()!) : null;
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
}
