// src/lib/surveysCku.ts
// SOLO SERVIDOR. Encuestas NPS de un CKU en Supabase (ver lib/surveyCku.ts).
//   cku_surveys          → la encuesta: dueño (CKU), nombre que él le puso y su enlace (token)
//   cku_survey_responses → una fila por persona; (survey_token, correo) único = «una sola vez por encuesta»

import { randomUUID } from "node:crypto";
import { DbError, getSupabaseAdmin, PG, selectAll, unwrap, unwrapOne } from "@/lib/supabase-admin";
import { ckuNpsRecordsDe, ckuSurveyDe, ckuSurveyResponseDe } from "@/lib/storeRows";
import type { CkuAnswers, CkuSurveyDoc, CkuSurveyResponseDoc } from "@/lib/surveyCku";
import type { NpsRecord } from "@/types";
import type { Json } from "@/types/supabase";

const db = getSupabaseAdmin;

export async function createCkuSurvey(input: { cku: string; ckuEmail: string; nombre: string; createdByEmail: string }): Promise<CkuSurveyDoc> {
  const row = unwrapOne(await db().from("cku_surveys").insert({
    token: randomUUID(),
    cku: input.cku,
    cku_email: input.ckuEmail.toLowerCase(),
    nombre: input.nombre.trim(),
    created_by_email: input.createdByEmail,
  }).select("*").single());
  return ckuSurveyDe(row);
}

/** Las encuestas (de un CKU, o todas) con cuántas personas las han contestado, más recientes primero. */
export async function listCkuSurveys(cku?: string): Promise<CkuSurveyDoc[]> {
  const [surveys, responses] = await Promise.all([
    selectAll((a, b) => {
      const q = db().from("cku_surveys").select("*").order("token").range(a, b);
      return cku ? q.eq("cku", cku) : q;
    }),
    selectAll((a, b) => db().from("cku_survey_responses").select("survey_token, id").order("id").range(a, b)),
  ]);
  const cuenta = new Map<string, number>();
  for (const r of responses) cuenta.set(r.survey_token, (cuenta.get(r.survey_token) ?? 0) + 1);
  return surveys
    .map((s) => ckuSurveyDe(s, cuenta.get(s.token) ?? 0))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCkuSurvey(token: string): Promise<CkuSurveyDoc | null> {
  const row = unwrap(await db().from("cku_surveys").select("*").eq("token", token).maybeSingle());
  return row ? ckuSurveyDe(row) : null;
}

export async function listCkuResponses(token: string): Promise<CkuSurveyResponseDoc[]> {
  const rows = unwrap(await db().from("cku_survey_responses").select("*").eq("survey_token", token).order("submitted_at")) ?? [];
  return rows.map(ckuSurveyResponseDe);
}

/** ¿Este correo ya contestó esta encuesta? */
export async function yaContesto(token: string, email: string): Promise<boolean> {
  const row = unwrap(await db().from("cku_survey_responses").select("id")
    .eq("survey_token", token).eq("respondent_email", email.trim().toLowerCase()).maybeSingle());
  return !!row;
}

/** Guarda la respuesta de una persona. Lanza "cku-already-answered" si ese correo ya contestó esta encuesta (el índice
 *  único lo garantiza también ante dos envíos simultáneos). */
export async function saveCkuResponse(token: string, name: string, email: string, answers: CkuAnswers): Promise<void> {
  try {
    unwrap(await db().from("cku_survey_responses").insert({
      survey_token: token,
      respondent_name: name.trim(),
      respondent_email: email.trim().toLowerCase(),
      answers: answers as Json,
    }));
  } catch (err) {
    if (err instanceof DbError && err.code === PG.uniqueViolation) throw new Error("cku-already-answered");
    throw err;
  }
}

/** Una respuesta que un Admin saca de (o devuelve a) las métricas. Devuelve null si no existe. */
export async function setCkuResponseInvalidated(id: string, invalidated: boolean): Promise<CkuSurveyResponseDoc | null> {
  const rows = unwrap(await db().from("cku_survey_responses").update({ invalidated }).eq("id", id).select("*")) ?? [];
  return rows[0] ? ckuSurveyResponseDe(rows[0]) : null;
}

/** Elimina una encuesta con TODAS sus respuestas (la FK en cascada las borra) y su enlace deja de funcionar. Lanza
 *  "survey-not-found" si no existe. */
export async function deleteCkuSurvey(token: string): Promise<void> {
  const s = unwrap(await db().from("cku_surveys").select("token").eq("token", token).maybeSingle());
  if (!s) throw new Error("survey-not-found");
  unwrap(await db().from("cku_surveys").delete().eq("token", token));
}

/** Todas las respuestas de encuestas de CKU como NpsRecord (fuente del NPS de cada Player). Si las tablas aún no existen
 *  (migración sin aplicar) devuelve [] en vez de tumbar el dashboard. */
export async function listCkuNpsRecords(): Promise<NpsRecord[]> {
  try {
    const [responses, surveys] = await Promise.all([
      selectAll((a, b) => db().from("cku_survey_responses").select("*").order("id").range(a, b)),
      selectAll((a, b) => db().from("cku_surveys").select("*").order("token").range(a, b)),
    ]);
    return ckuNpsRecordsDe(responses, surveys);
  } catch (err) {
    if (err instanceof DbError && (err.code === "42P01" || err.code === "PGRST205")) return [];
    throw err;
  }
}
