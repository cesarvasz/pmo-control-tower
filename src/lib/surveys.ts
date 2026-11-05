// src/lib/surveys.ts
// SOLO SERVIDOR. Encuestas personalizadas por REQ en Supabase.
//   surveys           → metadatos + estado (answered)
//   survey_responses  → respuestas (una sola por token: la PK es el candado)

import { randomUUID } from "node:crypto";
import { DbError, getSupabaseAdmin, PG, selectAll, unwrap, unwrapOne } from "@/lib/supabase-admin";
import { npsRecordsDe, surveyDe, surveyResponseDe } from "@/lib/storeRows";
import type { SurveyAnswers, SurveyDoc, SurveyResponseDoc } from "@/lib/survey";
import type { NpsRecord } from "@/types";
import type { Json } from "@/types/supabase";

const db = getSupabaseAdmin;

export async function listSurveys(): Promise<SurveyDoc[]> {
  const rows = await selectAll((a, b) => db().from("surveys").select("*").order("token").range(a, b));
  return rows.map(surveyDe);
}

export async function getSurvey(token: string): Promise<SurveyDoc | null> {
  const row = unwrap(await db().from("surveys").select("*").eq("token", token).maybeSingle());
  return row ? surveyDe(row) : null;
}

/** Todas las encuestas (links) de un REQ. Un REQ puede tener varias, una por persona. */
export async function listSurveysByReq(reqId: string): Promise<SurveyDoc[]> {
  const rows = unwrap(await db().from("surveys").select("*").eq("req_id", reqId)) ?? [];
  return rows.map(surveyDe);
}

/**
 * Crea un link de encuesta para una persona dentro de un REQ.
 * Un REQ puede tener varios links (uno por destinatario). Idempotente por (reqId, correo, cku):
 * si esa persona ya tiene un link PENDIENTE en el REQ, se reutiliza en vez de duplicarlo
 * (el índice único surveys_pendiente_unico lo garantiza también ante dos envíos simultáneos).
 */
export async function createSurvey(input: {
  reqId: string; reqCode: string; reqName: string; pm: string;
  assignedEmail: string; assignedName: string; createdByEmail: string;
  /** CKU remitente (vacío = PM/admin). Una persona puede tener a la vez un link de PM y uno de CKU. */
  cku?: string;
}): Promise<SurveyDoc> {
  const email = input.assignedEmail.toLowerCase();
  const cku = input.cku ?? "";

  const reutilizarPendiente = async (): Promise<SurveyDoc | null> => {
    const pending = unwrap(await db().from("surveys").select("*")
      .eq("req_id", input.reqId).eq("assigned_email", email).eq("cku", cku).eq("answered", false)
      .maybeSingle());
    if (!pending) return null;
    const actualizada = unwrapOne(await db().from("surveys")
      .update({ assigned_name: input.assignedName, req_code: input.reqCode, req_name: input.reqName, pm: input.pm })
      .eq("token", pending.token).select("*").single());
    return surveyDe(actualizada);
  };

  const existente = await reutilizarPendiente();
  if (existente) return existente;

  try {
    const row = unwrapOne(await db().from("surveys").insert({
      token: randomUUID(),
      req_id: input.reqId,
      req_code: input.reqCode,
      req_name: input.reqName,
      pm: input.pm,
      assigned_email: email,
      assigned_name: input.assignedName,
      created_by_email: input.createdByEmail,
      cku,
    }).select("*").single());
    return surveyDe(row);
  } catch (err) {
    // Otro envío simultáneo creó el pendiente entre la consulta y el insert: se reutiliza ese.
    if (err instanceof DbError && err.code === PG.uniqueViolation) {
      const ganador = await reutilizarPendiente();
      if (ganador) return ganador;
    }
    throw err;
  }
}

/** Marca/desmarca la encuesta como invalidada (no cuenta en métricas). Solo admin. */
export async function setInvalidated(token: string, invalidated: boolean): Promise<SurveyDoc | null> {
  const rows = unwrap(await db().from("surveys").update({ invalidated }).eq("token", token).select("*")) ?? [];
  return rows[0] ? surveyDe(rows[0]) : null;
}

/** Reabre la encuesta para volver a enviarla: borra la respuesta y quita el candado. Solo admin. */
export async function reopenSurvey(token: string): Promise<SurveyDoc | null> {
  unwrap(await db().rpc("reabrir_encuesta", { p_token: token }));
  return getSurvey(token);
}

/** Cancela (elimina) una encuesta PENDIENTE. Lanza "survey-not-found" si no existe
 *  y "survey-answered" si ya fue contestada (esas no se cancelan, se invalidan). Solo admin. */
export async function deleteSurvey(token: string): Promise<void> {
  const s = unwrap(await db().from("surveys").select("answered").eq("token", token).maybeSingle());
  if (!s) throw new Error("survey-not-found");
  if (s.answered) throw new Error("survey-answered");
  unwrap(await db().from("survey_responses").delete().eq("token", token)); // por si hubiera una respuesta huérfana
  unwrap(await db().from("surveys").delete().eq("token", token));
}

/**
 * Todas las respuestas unidas con el PM e `invalidated` de su encuesta.
 * Fuente única del NPS (global y por PM). Las importadas del Sheet tienen pm="".
 */
export async function listNpsRecords(): Promise<NpsRecord[]> {
  const [responses, surveys] = await Promise.all([
    selectAll((a, b) => db().from("survey_responses").select("*").order("token").range(a, b)),
    selectAll((a, b) => db().from("surveys").select("*").order("token").range(a, b)),
  ]);
  return npsRecordsDe(responses, surveys);
}

export async function getResponse(token: string): Promise<SurveyResponseDoc | null> {
  const row = unwrap(await db().from("survey_responses").select("*").eq("token", token).maybeSingle());
  return row ? surveyResponseDe(row) : null;
}

/**
 * Guarda la respuesta y marca la encuesta como contestada, en una sola transacción
 * (función responder_encuesta). Lanza "already-answered" si ya existía una respuesta.
 */
export async function saveResponse(
  token: string,
  answers: SurveyAnswers,
  respondentEmail: string,
): Promise<void> {
  unwrap(await db().rpc("responder_encuesta", {
    p_token: token,
    p_answers: answers as Json,
    p_respondent_email: respondentEmail,
  }));
}
