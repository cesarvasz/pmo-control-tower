// scripts/legadoFirestore.ts
// Utilidades compartidas por los scripts de validación de la migración (fases 3-4): comparación
// profunda y los lectores VIEJOS de Firestore que ya no existen en src/ (roles, grupos, usuarios,
// encuestas, NPS), rearmados igual que estaban en main antes de la migración. Se borra en la fase 6.

import * as viejo from "@/lib/firebase-admin";
import { normalizePermissions, type Permissions } from "@/lib/permissions";
import { reconcileSystemAdmin } from "@/lib/registry";
import type { MetodologiaCalif } from "@/types";

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Forma comparable: fechas ISO al mismo formato, sin undefined, llaves ordenadas. */
export function canon(v: unknown): unknown {
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
export function diferencias(a: unknown, b: unknown, ruta = ""): string[] {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja === jb) return [];
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    const llaves = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...llaves].flatMap((k) =>
      diferencias((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], ruta ? `${ruta}.${k}` : k));
  }
  return [`${ruta || "(raíz)"}: Firestore=${ja ?? "∅"}  Supabase=${jb ?? "∅"}`];
}

export const porId = <T, K extends keyof T>(lista: T[], k: K) => Object.fromEntries(lista.map((x) => [String(x[k]), x]));

export async function firestoreDocs(coll: string) {
  const snap = await viejo.getAdminDb().collection(coll).get();
  return snap.docs.map((d) => ({ id: d.id, d: d.data() }));
}

// Lectores viejos que ya no existen en el código (roles, grupos, usuarios, encuestas): se rearman
// aquí igual que estaban en main antes de la migración.
export async function rolesViejos() {
  return (await firestoreDocs("roles")).map(({ id, d }) => reconcileSystemAdmin({
    id, name: d.name ?? id, permissions: normalizePermissions(d.permissions as Partial<Permissions>),
    isSystem: !!d.isSystem, createdAt: d.createdAt ?? undefined, updatedAt: d.updatedAt ?? undefined,
  }));
}
export async function gruposViejos() {
  return (await firestoreDocs("groups")).map(({ id, d }) => ({
    id, name: d.name ?? id, icon: d.icon ?? "🗂", pageKeys: Array.isArray(d.pageKeys) ? d.pageKeys : [],
    isSystem: !!d.isSystem, createdAt: d.createdAt ?? undefined, updatedAt: d.updatedAt ?? undefined,
  }));
}
export async function usuariosViejos() {
  // Solo lo que define el acceso: correo → rol, página principal y nombre.
  return (await firestoreDocs("users")).map(({ d }) => ({
    email: String(d.email ?? "").toLowerCase(),
    roleId: d.roleId ?? (d.role === "admin" ? "admin" : "viewer"),
    defaultPage: d.defaultPage ?? null,
    displayName: d.displayName ?? d.email ?? "",
  }));
}
export async function encuestasViejas() {
  return (await firestoreDocs("surveys")).map(({ id, d }) => ({
    token: id, reqId: d.reqId ?? "", reqCode: d.reqCode ?? "", reqName: d.reqName ?? "", pm: d.pm ?? "",
    assignedEmail: (d.assignedEmail ?? "").toLowerCase(), assignedName: d.assignedName ?? "",
    createdByEmail: d.createdByEmail ?? "", createdAt: d.createdAt ?? "", answered: !!d.answered,
    answeredAt: d.answeredAt ?? null, invalidated: !!d.invalidated, cku: d.cku ?? "",
  }));
}
export async function npsViejo() {
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


/** Califs viejas sin `comentario` salen como "" desde Supabase; la app siempre lee `comentario ?? ""`. */
export const conComentario = (m: Record<string, MetodologiaCalif>) =>
  Object.fromEntries(Object.entries(m).map(([k, c]) => [k, { ...c, comentario: c.comentario ?? "" }]));
