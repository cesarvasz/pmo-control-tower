// src/lib/groups.ts
// SOLO SERVIDOR. CRUD de grupos dinámicos en Firestore (colección "groups").
// Un grupo agrupa páginas del catálogo (PAGES) para el sidebar y los permisos.

import { getAdminDb } from "@/lib/firebase-admin";
import type { Group } from "@/lib/permissions";
import { BOOTSTRAP_ADMIN_GROUP_ID, PAGES } from "@/lib/registry";

const COLL = "groups";
const VALID_PAGE_KEYS = new Set(PAGES.map((p) => p.key));

function docToGroup(id: string, d: FirebaseFirestore.DocumentData): Group {
  return {
    id,
    name: d.name ?? id,
    icon: d.icon ?? "🗂",
    pageKeys: Array.isArray(d.pageKeys) ? (d.pageKeys as string[]) : [],
    isSystem: !!d.isSystem,
    createdAt: d.createdAt ?? undefined,
    updatedAt: d.updatedAt ?? undefined,
  };
}

// Páginas de administración que siempre deben estar en el grupo por defecto.
const ADMIN_PAGE_KEYS = ["usuarios", "roles", "grupos"];

/**
 * Siembra el grupo "Administración" la primera vez. Si ya existe pero le faltan
 * las páginas de admin (instancias migradas), las agrega automáticamente.
 */
export async function ensureDefaultGroups(): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(COLL).doc(BOOTSTRAP_ADMIN_GROUP_ID);
  const snap = await ref.get();
  const now = new Date().toISOString();

  if (!snap.exists) {
    await ref.set({
      name: "Administración",
      icon: "⚙",
      pageKeys: ADMIN_PAGE_KEYS,
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    });
    return;
  }

  // Migración: agrega las páginas admin que falten en instalaciones previas.
  const current: string[] = Array.isArray(snap.data()!.pageKeys) ? snap.data()!.pageKeys : [];
  const missing = ADMIN_PAGE_KEYS.filter((k) => !current.includes(k));
  if (missing.length) {
    await ref.set({ pageKeys: [...current, ...missing], updatedAt: now }, { merge: true });
  }
}

/** Deja solo claves de página que existen en el catálogo, sin duplicados. */
function cleanPageKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  return [...new Set(keys.filter((k): k is string => typeof k === "string" && VALID_PAGE_KEYS.has(k)))];
}

export async function listGroups(): Promise<Group[]> {
  const snap = await getAdminDb().collection(COLL).get();
  return snap.docs
    .map((d) => docToGroup(d.id, d.data()))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.name.localeCompare(b.name));
}

export async function getGroup(id: string): Promise<Group | null> {
  const snap = await getAdminDb().collection(COLL).doc(id).get();
  return snap.exists ? docToGroup(snap.id, snap.data()!) : null;
}

export async function createGroup(name: string, icon: string, pageKeys: unknown): Promise<Group> {
  const now = new Date().toISOString();
  const ref = await getAdminDb().collection(COLL).add({
    name: name.trim() || "Grupo sin nombre",
    icon: (icon || "🗂").trim(),
    pageKeys: cleanPageKeys(pageKeys),
    createdAt: now,
    updatedAt: now,
  });
  return docToGroup(ref.id, (await ref.get()).data()!);
}

export async function updateGroup(
  id: string,
  patch: { name?: string; icon?: string; pageKeys?: unknown }
): Promise<Group> {
  const ref = getAdminDb().collection(COLL).doc(id);
  if (!(await ref.get()).exists) throw new Error("group-not-found");

  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name.trim() || "Grupo sin nombre";
  if (patch.icon !== undefined) update.icon = (patch.icon || "🗂").trim();
  if (patch.pageKeys !== undefined) update.pageKeys = cleanPageKeys(patch.pageKeys);

  await ref.set(update, { merge: true });
  return docToGroup(id, (await ref.get()).data()!);
}

export async function deleteGroup(id: string): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(COLL).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("group-not-found");
  if (snap.data()!.isSystem) throw new Error("group-is-system");
  await ref.delete();

  // Limpia el grupo borrado de los permisos de cada rol que lo concedía.
  const roles = await db.collection("roles").get();
  const batch = db.batch();
  let touched = 0;
  for (const r of roles.docs) {
    const groups = r.data()?.permissions?.groups as Record<string, boolean> | undefined;
    if (groups && id in groups) {
      const next = { ...groups };
      delete next[id];
      batch.set(r.ref, { permissions: { ...r.data().permissions, groups: next } }, { merge: true });
      touched++;
    }
  }
  if (touched) await batch.commit();
}
