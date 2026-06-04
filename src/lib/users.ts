// src/lib/users.ts
// SOLO SERVIDOR. Usuarios en Firestore (colección "users"). Cada usuario
// referencia un roleId; los permisos efectivos se resuelven desde el rol.

import { getAdminDb, verifyRequest, type VerifiedUser } from "@/lib/firebase-admin";
import { emptyPermissions, type AppUser, type Group } from "@/lib/permissions";
import { BOOTSTRAP_ADMIN_ROLE_ID, DEFAULT_NEW_USER_ROLE_ID, resolvePermissions } from "@/lib/registry";
import { ensureDefaultRoles, getRole, listRoles } from "@/lib/roles";
import { ensureDefaultGroups, listGroups } from "@/lib/groups";

const COLL = "users";

interface UserRecord {
  uid: string;
  email: string;
  displayName: string;
  roleId: string | null;
  createdAt?: string;
  updatedAt?: string;
}

function dataToRecord(uid: string, d: FirebaseFirestore.DocumentData): UserRecord {
  return {
    uid,
    email: d.email ?? "",
    displayName: d.displayName ?? d.email ?? "",
    roleId: d.roleId ?? null,
    createdAt: d.createdAt ?? undefined,
    updatedAt: d.updatedAt ?? undefined,
  };
}

/**
 * Garantiza el doc del usuario. El PRIMER usuario en entrar recibe el rol admin
 * base (bootstrap); el resto entra con el rol "viewer".
 */
export async function ensureUser(v: VerifiedUser): Promise<UserRecord> {
  await Promise.all([ensureDefaultRoles(), ensureDefaultGroups()]);
  const db = getAdminDb();
  const ref = db.collection(COLL).doc(v.uid);
  const snap = await ref.get();

  if (snap.exists) {
    const data = snap.data()!;
    const patch: Record<string, unknown> = {};
    if (data.email !== v.email) patch.email = v.email;
    if (!data.displayName && v.name) patch.displayName = v.name;
    // Migración del modelo viejo (campo `role` inline) → `roleId`.
    if (!data.roleId) {
      patch.roleId = data.role === "admin" ? BOOTSTRAP_ADMIN_ROLE_ID : DEFAULT_NEW_USER_ROLE_ID;
    }
    if (Object.keys(patch).length) await ref.set(patch, { merge: true });
    return dataToRecord(v.uid, { ...data, ...patch });
  }

  const isFirst = (await db.collection(COLL).limit(1).get()).empty;
  const roleId = isFirst ? BOOTSTRAP_ADMIN_ROLE_ID : DEFAULT_NEW_USER_ROLE_ID;
  const now = new Date().toISOString();
  const newDoc = { email: v.email, displayName: v.name, roleId, createdAt: now, updatedAt: now };
  await ref.set(newDoc);
  return dataToRecord(v.uid, newDoc);
}

function recordToAppUserSync(
  rec: UserRecord,
  groups: Group[],
  roleName: string,
  permissions: AppUser["permissions"]
): AppUser {
  return {
    uid: rec.uid,
    email: rec.email,
    displayName: rec.displayName,
    roleId: rec.roleId,
    roleName,
    // Permisos EFECTIVOS: los grupos concedidos se aplanan a sus páginas.
    permissions: resolvePermissions(permissions, groups),
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

async function recordToAppUser(rec: UserRecord, groups: Group[]): Promise<AppUser> {
  const role = rec.roleId ? await getRole(rec.roleId) : null;
  return recordToAppUserSync(rec, groups, role?.name ?? "(sin rol)", role?.permissions ?? emptyPermissions());
}

/** Perfil del usuario actual con permisos efectivos resueltos desde su rol. */
export async function getMe(v: VerifiedUser): Promise<AppUser> {
  const groups = await listGroups();
  return recordToAppUser(await ensureUser(v), groups);
}

export async function listUsers(): Promise<AppUser[]> {
  const db = getAdminDb();
  const [roles, groups] = await Promise.all([listRoles(), listGroups()]);
  const map = new Map(roles.map((r) => [r.id, r]));
  const snap = await db.collection(COLL).get();
  const users = snap.docs.map((d) => {
    const rec = dataToRecord(d.id, d.data());
    const role = rec.roleId ? map.get(rec.roleId) : null;
    return recordToAppUserSync(rec, groups, role?.name ?? "(sin rol)", role?.permissions ?? emptyPermissions());
  });
  return users.sort((a, b) => a.email.localeCompare(b.email));
}

export async function assignRole(uid: string, roleId: string): Promise<AppUser> {
  const role = await getRole(roleId);
  if (!role) throw new Error("role-not-found");
  const db = getAdminDb();
  const ref = db.collection(COLL).doc(uid);
  if (!(await ref.get()).exists) throw new Error("user-not-found");
  await ref.set({ roleId, updatedAt: new Date().toISOString() }, { merge: true });
  const rec = dataToRecord(uid, (await ref.get()).data()!);
  const groups = await listGroups();
  return recordToAppUserSync(rec, groups, role.name, role.permissions);
}

/** Verifica token + exige una acción concreta. Devuelve el solicitante. */
export async function requireAction(authHeader: string | null, action: string): Promise<AppUser> {
  const me = await getMe(await verifyRequest(authHeader));
  if (!me.permissions.actions[action]) throw new Error("forbidden");
  return me;
}

/** Verifica token + exige AL MENOS UNA de las acciones dadas. */
export async function requireAnyAction(authHeader: string | null, actions: string[]): Promise<AppUser> {
  const me = await getMe(await verifyRequest(authHeader));
  if (!actions.some((a) => me.permissions.actions[a])) throw new Error("forbidden");
  return me;
}
