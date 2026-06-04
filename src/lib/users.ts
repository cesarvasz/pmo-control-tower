// src/lib/users.ts
// SOLO SERVIDOR. Usuarios en Firestore (colección "users"). Cada usuario
// referencia un roleId; los permisos efectivos se resuelven desde el rol.

import { getAdminDb, verifyRequest, type VerifiedUser } from "@/lib/firebase-admin";
import { emptyPermissions, type AppUser } from "@/lib/permissions";
import { BOOTSTRAP_ADMIN_ROLE_ID, DEFAULT_NEW_USER_ROLE_ID } from "@/lib/registry";
import { ensureDefaultRoles, getRole, listRoles } from "@/lib/roles";

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
  await ensureDefaultRoles();
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

async function recordToAppUser(rec: UserRecord, roleName?: string, perms?: AppUser["permissions"]): Promise<AppUser> {
  let name = roleName;
  let permissions = perms;
  if (name === undefined || permissions === undefined) {
    const role = rec.roleId ? await getRole(rec.roleId) : null;
    name = role?.name ?? "(sin rol)";
    permissions = role?.permissions ?? emptyPermissions();
  }
  return {
    uid: rec.uid,
    email: rec.email,
    displayName: rec.displayName,
    roleId: rec.roleId,
    roleName: name,
    permissions,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

/** Perfil del usuario actual con permisos efectivos resueltos desde su rol. */
export async function getMe(v: VerifiedUser): Promise<AppUser> {
  return recordToAppUser(await ensureUser(v));
}

export async function listUsers(): Promise<AppUser[]> {
  const db = getAdminDb();
  const roles = await listRoles();
  const map = new Map(roles.map((r) => [r.id, r]));
  const snap = await db.collection(COLL).get();
  const users = await Promise.all(
    snap.docs.map((d) => {
      const rec = dataToRecord(d.id, d.data());
      const role = rec.roleId ? map.get(rec.roleId) : null;
      return recordToAppUser(rec, role?.name ?? "(sin rol)", role?.permissions ?? emptyPermissions());
    })
  );
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
  return recordToAppUser(rec, role.name, role.permissions);
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
