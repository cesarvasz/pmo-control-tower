// src/lib/surveys.ts
// SOLO SERVIDOR. Encuestas personalizadas por REQ en Firestore.
//   surveys/{token}            → metadatos + estado (answered)
//   survey_responses/{token}   → respuestas (inmutable; una sola vez)

import { randomUUID } from "node:crypto";
import { getAdminDb } from "@/lib/firebase-admin";
import type { SurveyAnswers, SurveyDoc, SurveyResponseDoc } from "@/lib/survey";
import type { NpsRecord } from "@/types";

const SURVEYS = "surveys";
const RESPONSES = "survey_responses";

function toSurvey(token: string, d: FirebaseFirestore.DocumentData): SurveyDoc {
  return {
    token,
    reqId: d.reqId ?? "",
    reqCode: d.reqCode ?? "",
    reqName: d.reqName ?? "",
    pm: d.pm ?? "",
    assignedEmail: (d.assignedEmail ?? "").toLowerCase(),
    assignedName: d.assignedName ?? "",
    createdByEmail: d.createdByEmail ?? "",
    createdAt: d.createdAt ?? "",
    answered: !!d.answered,
    answeredAt: d.answeredAt ?? null,
    invalidated: !!d.invalidated,
  };
}

export async function listSurveys(): Promise<SurveyDoc[]> {
  const db = getAdminDb();
  const snap = await db.collection(SURVEYS).get();
  return snap.docs.map((doc) => toSurvey(doc.id, doc.data()));
}

export async function getSurvey(token: string): Promise<SurveyDoc | null> {
  const db = getAdminDb();
  const snap = await db.collection(SURVEYS).doc(token).get();
  return snap.exists ? toSurvey(snap.id, snap.data()!) : null;
}

/** Todas las encuestas (links) de un REQ. Un REQ puede tener varias, una por persona. */
export async function listSurveysByReq(reqId: string): Promise<SurveyDoc[]> {
  const db = getAdminDb();
  const snap = await db.collection(SURVEYS).where("reqId", "==", reqId).get();
  return snap.docs.map((doc) => toSurvey(doc.id, doc.data()));
}

/**
 * Crea un link de encuesta para una persona dentro de un REQ.
 * Un REQ puede tener varios links (uno por destinatario). Idempotente por (reqId, correo):
 * si esa persona ya tiene un link PENDIENTE en el REQ, se reutiliza en vez de duplicarlo.
 */
export async function createSurvey(input: {
  reqId: string; reqCode: string; reqName: string; pm: string;
  assignedEmail: string; assignedName: string; createdByEmail: string;
}): Promise<SurveyDoc> {
  const db = getAdminDb();
  const email = input.assignedEmail.toLowerCase();

  // Reutiliza un link pendiente ya existente para la misma persona en el mismo REQ.
  const existing = await listSurveysByReq(input.reqId);
  const pending = existing.find((s) => s.assignedEmail === email && !s.answered);
  if (pending) {
    await db.collection(SURVEYS).doc(pending.token).set(
      { assignedName: input.assignedName, reqCode: input.reqCode, reqName: input.reqName, pm: input.pm },
      { merge: true },
    );
    return { ...pending, assignedName: input.assignedName, reqCode: input.reqCode, reqName: input.reqName, pm: input.pm };
  }

  const token = randomUUID();
  const doc: SurveyDoc = {
    token,
    reqId: input.reqId,
    reqCode: input.reqCode,
    reqName: input.reqName,
    pm: input.pm,
    assignedEmail: input.assignedEmail.toLowerCase(),
    assignedName: input.assignedName,
    createdByEmail: input.createdByEmail,
    createdAt: new Date().toISOString(),
    answered: false,
    answeredAt: null,
    invalidated: false,
  };
  const { token: _t, ...data } = doc;
  void _t;
  await db.collection(SURVEYS).doc(token).set(data);
  return doc;
}

/** Marca/desmarca la encuesta como invalidada (no cuenta en métricas). Solo admin. */
export async function setInvalidated(token: string, invalidated: boolean): Promise<SurveyDoc | null> {
  const db = getAdminDb();
  await db.collection(SURVEYS).doc(token).set({ invalidated }, { merge: true });
  return getSurvey(token);
}

/** Reabre la encuesta para volver a enviarla: borra la respuesta y quita el candado. Solo admin. */
export async function reopenSurvey(token: string): Promise<SurveyDoc | null> {
  const db = getAdminDb();
  await db.collection(RESPONSES).doc(token).delete();
  await db.collection(SURVEYS).doc(token).set(
    { answered: false, answeredAt: null, invalidated: false },
    { merge: true },
  );
  return getSurvey(token);
}

/** Cancela (elimina) una encuesta PENDIENTE. Lanza "survey-not-found" si no existe
 *  y "survey-answered" si ya fue contestada (esas no se cancelan, se invalidan). Solo admin. */
export async function deleteSurvey(token: string): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection(SURVEYS).doc(token);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("survey-not-found");
  if (snap.data()!.answered) throw new Error("survey-answered");
  await db.collection(RESPONSES).doc(token).delete(); // por si hubiera una respuesta huérfana
  await ref.delete();
}

/**
 * Todas las respuestas unidas con el PM e `invalidated` de su encuesta.
 * Fuente única del NPS (global y por PM). Las importadas del Sheet tienen pm="".
 */
export async function listNpsRecords(): Promise<NpsRecord[]> {
  const db = getAdminDb();
  const [respSnap, surveySnap] = await Promise.all([
    db.collection(RESPONSES).get(),
    db.collection(SURVEYS).get(),
  ]);
  const surveyById = new Map(surveySnap.docs.map((d) => [d.id, d.data()]));
  return respSnap.docs.map((d) => {
    const r = d.data();
    const s = surveyById.get(d.id) ?? {};
    return {
      answers: (r.answers ?? {}) as NpsRecord["answers"],
      pm: s.pm ?? "",
      invalidated: !!s.invalidated,
      respondentEmail: r.respondentEmail ?? "",
      submittedAt: r.submittedAt ?? "",
      reqCode: s.reqCode ?? "",
    };
  });
}

export async function getResponse(token: string): Promise<SurveyResponseDoc | null> {
  const db = getAdminDb();
  const snap = await db.collection(RESPONSES).doc(token).get();
  return snap.exists ? (snap.data() as SurveyResponseDoc) : null;
}

/**
 * Guarda la respuesta y marca la encuesta como contestada.
 * Lanza "already-answered" si ya existía una respuesta (candado de una sola vez).
 */
export async function saveResponse(
  token: string,
  answers: SurveyAnswers,
  respondentEmail: string,
): Promise<void> {
  const db = getAdminDb();
  const respRef = db.collection(RESPONSES).doc(token);
  const surveyRef = db.collection(SURVEYS).doc(token);

  await db.runTransaction(async (tx) => {
    const resp = await tx.get(respRef);
    if (resp.exists) throw new Error("already-answered");
    const now = new Date().toISOString();
    tx.set(respRef, { answers, respondentEmail, submittedAt: now } satisfies SurveyResponseDoc);
    tx.set(surveyRef, { answered: true, answeredAt: now }, { merge: true });
  });
}
