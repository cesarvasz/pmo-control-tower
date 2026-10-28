// src/lib/firebase-admin.ts
// SOLO SERVIDOR. Admin SDK: verificación de ID tokens + acceso a Firestore.
// Requiere un Service Account (FIREBASE_ADMIN_* en .env.local).

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import type { AtrasoDetalle, AtrasoReparto, AttributionKind, BoardAlcance, DelayAttribution, MetaCliente, MetasImplementacionDoc, MetodologiaCalif, DelayResponsible, ObjetivoMes, OnHoldDoc, ProjItemBaseline, ReqBaseline, WeeklySnapshotDoc } from "@/types";
import { leerDocMetas } from "@/lib/implementaciones";
import { leerOnHold, type OnHoldTipo } from "@/lib/onHold";

let cachedApp: App | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

function getAdminApp(): App {
  if (cachedApp) return cachedApp;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin sin configurar: define FIREBASE_ADMIN_CLIENT_EMAIL y FIREBASE_ADMIN_PRIVATE_KEY en .env.local"
    );
  }

  cachedApp = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return cachedApp;
}

export function getAdminAuth(): Auth {
  if (!cachedAuth) cachedAuth = getAuth(getAdminApp());
  return cachedAuth;
}

export function getAdminDb(): Firestore {
  if (!cachedDb) cachedDb = getFirestore(getAdminApp());
  return cachedDb;
}

export interface VerifiedUser {
  uid: string;
  email: string;
  name: string;
}

/**
 * Verifica el ID token y exige que el correo pertenezca al dominio permitido.
 * Lanza Error con código en el mensaje: no-token | invalid-token | domain-not-allowed.
 */
export async function getReqBaselines(): Promise<Record<string, ReqBaseline>> {
  const db = getAdminDb();
  const snap = await db.collection("req_baselines").get();
  const result: Record<string, ReqBaseline> = {};
  snap.forEach((doc) => { result[doc.id] = doc.data() as ReqBaseline; });
  return result;
}

export async function saveReqBaseline(reqId: string, data: Omit<ReqBaseline, "savedAt">): Promise<void> {
  const db = getAdminDb();
  await db.collection("req_baselines").doc(reqId).set({ ...data, savedAt: new Date().toISOString() });
}

export async function getProjItemBaselines(): Promise<Record<string, ProjItemBaseline>> {
  const db = getAdminDb();
  const snap = await db.collection("proj_item_baselines").get();
  const result: Record<string, ProjItemBaseline> = {};
  snap.forEach((doc) => { result[doc.id] = doc.data() as ProjItemBaseline; });
  return result;
}

export async function saveProjItemBaseline(itemId: string, data: Omit<ProjItemBaseline, "savedAt">): Promise<void> {
  const db = getAdminDb();
  await db.collection("proj_item_baselines").doc(itemId).set({ ...data, savedAt: new Date().toISOString() });
}

/** Baselines de un CONJUNTO de items puntual (lectura por id, no toda la
 *  colección) — usado por el refresh de un solo board de Proyectos, donde
 *  traer las ~500+ baselines de todos los boards sería desperdiciar lecturas. */
export async function getProjItemBaselinesFor(itemIds: string[]): Promise<Record<string, ProjItemBaseline>> {
  if (itemIds.length === 0) return {};
  const db = getAdminDb();
  const refs = itemIds.map((id) => db.collection("proj_item_baselines").doc(id));
  const snaps = await db.getAll(...refs);
  const result: Record<string, ProjItemBaseline> = {};
  snaps.forEach((snap) => { if (snap.exists) result[snap.id] = snap.data() as ProjItemBaseline; });
  return result;
}

// Alias de compatibilidad: roles renombrados → el nombre vigente. Se aplica
// SOLO al leer (los documentos en Firestore no se tocan); al re-guardar una
// fila, queda persistida con el nombre nuevo. Agregar aquí cualquier rol que
// se renombre a futuro.
const RESP_ALIAS: Record<string, string> = { Desarrollador: "Desarrollo" };
const normResp = <T extends string>(r: T): T => (RESP_ALIAS[r] as T) ?? r;

// ── Atribuciones de responsable (delay / reproceso), una colección por kind ──
const ATTRIBUTION_COLL: Record<AttributionKind, string> = {
  delay: "delay_attributions",
  reproceso: "reproceso_attributions",
};

export async function getAttributions(kind: AttributionKind): Promise<Record<string, DelayAttribution>> {
  const db = getAdminDb();
  const snap = await db.collection(ATTRIBUTION_COLL[kind]).get();
  const result: Record<string, DelayAttribution> = {};
  snap.forEach((doc) => {
    const d = doc.data() as DelayAttribution;
    result[doc.id] = { ...d, responsible: normResp(d.responsible) };
  });
  return result;
}

export async function saveAttribution(kind: AttributionKind, itemId: string, responsible: DelayResponsible, by: string): Promise<void> {
  const db = getAdminDb();
  await db.collection(ATTRIBUTION_COLL[kind]).doc(itemId).set({ responsible, by, at: new Date().toISOString() });
}

export async function deleteAttribution(kind: AttributionKind, itemId: string): Promise<void> {
  const db = getAdminDb();
  await db.collection(ATTRIBUTION_COLL[kind]).doc(itemId).delete();
}

// ── Metodología VALOR (componente del KPI del PM) ─────────────────────────
// Colección `metodologia_califs`: por projPhaseKey (boardId::grupo), la nota 0-100
// que un Admin le pone a la fase cuando todos sus items están Done.
export async function getMetodologiaCalifs(): Promise<Record<string, MetodologiaCalif>> {
  const db = getAdminDb();
  const snap = await db.collection("metodologia_califs").get();
  const result: Record<string, MetodologiaCalif> = {};
  snap.forEach((doc) => { result[doc.id] = doc.data() as MetodologiaCalif; });
  return result;
}

export async function saveMetodologiaCalif(phaseKey: string, score: number, by: string, comentario: string = ""): Promise<void> {
  const db = getAdminDb();
  await db.collection("metodologia_califs").doc(phaseKey).set({ score, by, at: new Date().toISOString(), comentario });
}

export async function deleteMetodologiaCalif(phaseKey: string): Promise<void> {
  const db = getAdminDb();
  await db.collection("metodologia_califs").doc(phaseKey).delete();
}

// ── Metas de Implementación (pestaña Implementación de ROI) ──────────────
// Un solo documento `implementacion_metas/actual` con la meta de cada cliente (Vol y
// CM1, igual para todos los meses) y el % a alcanzar de cada mes: cargar la pestaña
// cuesta UNA lectura y guardar reemplaza el documento completo. Las valida
// lib/implementaciones.ts (normalizarMetas / normalizarObjetivos). Al leer, leerDocMetas
// también entiende los formatos anteriores (sin mes, o una meta por cliente y mes).
export async function getMetasImplementacion(): Promise<MetasImplementacionDoc> {
  const snap = await getAdminDb().collection("implementacion_metas").doc("actual").get();
  if (!snap.exists) return { metas: [], objetivos: [], by: "", at: "" };
  const d = snap.data() as { metas?: unknown; objetivos?: unknown; by?: string; at?: string };
  return { ...leerDocMetas(d), by: d.by ?? "", at: d.at ?? "" };
}

export async function saveMetasImplementacion(
  metas: MetaCliente[], objetivos: ObjetivoMes[], by: string,
): Promise<MetasImplementacionDoc> {
  const doc: MetasImplementacionDoc = { metas, objetivos, by, at: new Date().toISOString() };
  await getAdminDb().collection("implementacion_metas").doc("actual").set(doc);
  return doc;
}

// ── On Hold (Proyectos y PML en pausa — fuera de toda métrica) ───────────
// Un solo documento `on_hold/actual` con dos mapas, `proyectos` (por id de board) y `pml`
// (por id de item): cargar el dashboard cuesta UNA lectura sin importar cuántos haya.
// Poner o quitar uno escribe solo su llave (merge), así dos personas que pausen cosas
// distintas a la vez no se pisan. Ver lib/onHold.ts.
export async function getOnHold(): Promise<OnHoldDoc> {
  const snap = await getAdminDb().collection("on_hold").doc("actual").get();
  return leerOnHold(snap.exists ? snap.data() : undefined);
}

export async function setOnHold(tipo: OnHoldTipo, id: string, activo: boolean, by: string): Promise<void> {
  const campo = tipo === "proyecto" ? "proyectos" : "pml";
  const valor = activo ? { by, at: new Date().toISOString() } : FieldValue.delete();
  await getAdminDb().collection("on_hold").doc("actual").set({ [campo]: { [id]: valor } }, { merge: true });
}

// ── Detalle de atraso (tabla "Atrasos" del Resumen Ejecutivo) ────────────
// Colección `atraso_detalles`: por itemId, el reparto de los días de atraso
// entre roles (ATRASO_RESPONSABLES) + un motivo. Editable por cualquiera con
// acceso a la página (el POST /api/atraso-detalle lo gatea con requirePage, no
// requireAction). Documentos legacy pueden traer `responsable` (rol único) en
// vez de `reparto` — los consumidores lo migran con `atrasoReparto()`.
export async function getAtrasoDetalles(): Promise<Record<string, AtrasoDetalle>> {
  const db = getAdminDb();
  const snap = await db.collection("atraso_detalles").get();
  const result: Record<string, AtrasoDetalle> = {};
  snap.forEach((doc) => {
    const d = doc.data() as AtrasoDetalle;
    result[doc.id] = {
      ...d,
      responsable: d.responsable ? normResp(d.responsable) : d.responsable,
      reparto: d.reparto?.map((r) => ({ ...r, resp: normResp(r.resp) })),
    };
  });
  return result;
}

export async function saveAtrasoDetalle(itemId: string, reparto: AtrasoReparto[], motivo: string, by: string): Promise<void> {
  const db = getAdminDb();
  // `.set()` reemplaza el doc completo → un `responsable` legacy desaparece al editar.
  await db.collection("atraso_detalles").doc(itemId).set({ reparto, motivo, by, at: new Date().toISOString() });
}

export async function deleteAtrasoDetalle(itemId: string): Promise<void> {
  const db = getAdminDb();
  await db.collection("atraso_detalles").doc(itemId).delete();
}

// ── Alcance de un proyecto (Status Card) ──────────────────────────────────
// Colección `board_alcance`: por boardId, un texto libre. Mismo criterio de
// edición que `atraso_detalles` (cualquiera con acceso a la página, no requiere Admin).
export async function getBoardAlcances(): Promise<Record<string, BoardAlcance>> {
  const db = getAdminDb();
  const snap = await db.collection("board_alcance").get();
  const result: Record<string, BoardAlcance> = {};
  snap.forEach((doc) => { result[doc.id] = doc.data() as BoardAlcance; });
  return result;
}

export async function saveBoardAlcance(boardId: string, alcance: string, by: string): Promise<void> {
  const db = getAdminDb();
  await db.collection("board_alcance").doc(boardId).set({ alcance, by, at: new Date().toISOString() });
}

export async function deleteBoardAlcance(boardId: string): Promise<void> {
  const db = getAdminDb();
  await db.collection("board_alcance").doc(boardId).delete();
}

// ── Histórico semanal del portafolio (Control Tower) ───────────────────────
// Colección `weekly_snapshots`: doc id = "YYYY-MM-DD" del lunes de la semana
// (mondayOfWeek/ymd de business.ts) — sobreescribir el mismo id es idempotente
// (útil si el cron corre dos veces o se rellena una semana atrasada a mano).
export async function saveWeeklySnapshot(weekOf: string, metrics: Omit<WeeklySnapshotDoc, "weekOf" | "createdAt">): Promise<void> {
  const db = getAdminDb();
  const doc: WeeklySnapshotDoc = { weekOf, ...metrics, createdAt: new Date().toISOString() };
  await db.collection("weekly_snapshots").doc(weekOf).set(doc);
}

export async function listWeeklySnapshots(): Promise<WeeklySnapshotDoc[]> {
  const db = getAdminDb();
  const snap = await db.collection("weekly_snapshots").orderBy("weekOf", "asc").get();
  return snap.docs.map((d) => d.data() as WeeklySnapshotDoc);
}

// ── Fechas de restauración de Pre-producción (Control Tower) ──────────────
// Colección `preprod_restore_dates`, un solo doc ("list") con el arreglo
// completo de fechas ("YYYY-MM-DD") — se administran a mano desde el popup,
// no vienen de Monday ni de Sheets. Mismo criterio de edición que
// `board_alcance` (cualquiera con acceso a la página, no requiere Admin).
export async function getPreprodRestoreDates(): Promise<string[]> {
  const db = getAdminDb();
  const doc = await db.collection("preprod_restore_dates").doc("list").get();
  const dates = (doc.data()?.dates as string[] | undefined) ?? [];
  return [...dates].sort();
}

export async function savePreprodRestoreDates(dates: string[], by: string): Promise<string[]> {
  const db = getAdminDb();
  const sorted = [...new Set(dates)].sort();
  await db.collection("preprod_restore_dates").doc("list").set({ dates: sorted, by, at: new Date().toISOString() });
  return sorted;
}

export async function verifyRequest(authHeader: string | null): Promise<VerifiedUser> {
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) throw new Error("no-token");

  // getAdminApp() puede lanzar "Firebase Admin sin configurar..." → se propaga
  // tal cual (el route lo devuelve como 500 con mensaje claro), separado del
  // caso de token inválido.
  const adminAuth = getAdminAuth();

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    throw new Error("invalid-token");
  }

  const email = (decoded.email ?? "").toLowerCase();
  const domain = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN?.toLowerCase();
  if (domain && !email.endsWith(`@${domain}`)) throw new Error("domain-not-allowed");

  return { uid: decoded.uid, email, name: (decoded.name as string) || email };
}
