// src/lib/surveys.ts
// SOLO SERVIDOR. Encuestas personalizadas por REQ en Firestore.
//   surveys/{token}            → metadatos + estado (answered)
//   survey_responses/{token}   → respuestas (inmutable; una sola vez)

import { randomUUID } from "node:crypto";
import { getAdminDb } from "@/lib/firebase-admin";
import type { SurveyAnswers, SurveyDoc, SurveyResponseDoc } from "@/lib/survey";

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

export async function getSurveyByReq(reqId: string): Promise<SurveyDoc | null> {
  const db = getAdminDb();
  const snap = await db.collection(SURVEYS).where("reqId", "==", reqId).limit(1).get();
  return snap.empty ? null : toSurvey(snap.docs[0].id, snap.docs[0].data());
}

/**
 * Crea (o reasigna, si aún no fue contestada) la encuesta de un REQ.
 * Devuelve el doc resultante. Idempotente por reqId.
 */
export async function upsertSurvey(input: {
  reqId: string; reqCode: string; reqName: string; pm: string;
  assignedEmail: string; assignedName: string; createdByEmail: string;
}): Promise<SurveyDoc> {
  const db = getAdminDb();
  const existing = await getSurveyByReq(input.reqId);

  if (existing) {
    // Ya contestada → no se puede reasignar; se devuelve tal cual.
    if (existing.answered) return existing;
    // Pendiente → se puede actualizar el destinatario y reutilizar el mismo link.
    await db.collection(SURVEYS).doc(existing.token).set(
      {
        assignedEmail: input.assignedEmail.toLowerCase(),
        assignedName: input.assignedName,
        reqCode: input.reqCode,
        reqName: input.reqName,
        pm: input.pm,
      },
      { merge: true },
    );
    return { ...existing, ...input, assignedEmail: input.assignedEmail.toLowerCase() };
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
