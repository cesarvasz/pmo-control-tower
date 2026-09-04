// src/lib/firebase-admin.ts
// SOLO SERVIDOR. Admin SDK: verificación de ID tokens + acceso a Firestore.
// Requiere un Service Account (FIREBASE_ADMIN_* en .env.local).

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { AtrasoDetalle, AttributionKind, DelayAttribution, DelayResponsible, ProjItemBaseline, ReqBaseline } from "@/types";

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

// ── Atribuciones de responsable (delay / reproceso), una colección por kind ──
const ATTRIBUTION_COLL: Record<AttributionKind, string> = {
  delay: "delay_attributions",
  reproceso: "reproceso_attributions",
};

export async function getAttributions(kind: AttributionKind): Promise<Record<string, DelayAttribution>> {
  const db = getAdminDb();
  const snap = await db.collection(ATTRIBUTION_COLL[kind]).get();
  const result: Record<string, DelayAttribution> = {};
  snap.forEach((doc) => { result[doc.id] = doc.data() as DelayAttribution; });
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

// ── Detalle de atraso (tabla "Atrasos" del Resumen Ejecutivo) ────────────
// Distinto de ATTRIBUTION_COLL: aquí el "responsable" es una PERSONA del
// Directorio RH (texto libre elegido de un dropdown), no un rol fijo, y se
// acompaña de un motivo. Editable por cualquiera con acceso a la página
// (el POST /api/atraso-detalle lo gatea con requirePage, no requireAction).
export async function getAtrasoDetalles(): Promise<Record<string, AtrasoDetalle>> {
  const db = getAdminDb();
  const snap = await db.collection("atraso_detalles").get();
  const result: Record<string, AtrasoDetalle> = {};
  snap.forEach((doc) => { result[doc.id] = doc.data() as AtrasoDetalle; });
  return result;
}

export async function saveAtrasoDetalle(itemId: string, responsable: string, motivo: string, by: string): Promise<void> {
  const db = getAdminDb();
  await db.collection("atraso_detalles").doc(itemId).set({ responsable, motivo, by, at: new Date().toISOString() });
}

export async function deleteAtrasoDetalle(itemId: string): Promise<void> {
  const db = getAdminDb();
  await db.collection("atraso_detalles").doc(itemId).delete();
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
