// src/lib/surveyCku.ts
// Encuesta NPS de un CKU (cliente + servidor). Mismo diseño que la de PM (lib/survey.ts), con las
// preguntas de la «Propuesta NPS CKU». Un CKU (o un Admin por él) crea la encuesta desde /players y
// comparte UN enlace que contestan varias personas, cada una con su nombre y correo, una sola vez.
// Sus resultados cuentan en el NPS del Player de ese CKU.

import type { SurveyQuestion } from "@/lib/survey";
import type { NpsRecord } from "@/types";

/** Id de la respuesta abierta (la «razón» de la encuesta de PM). */
export const CKU_ABIERTA_ID = "mejora";

export const CKU_SURVEY_DIMENSIONS_TITLE = "Dimensiones del CKU";

// Orden de la encuesta de PM: NPS (0–10) → pregunta abierta → dimensiones Likert.
export const CKU_SURVEY_QUESTIONS: SurveyQuestion[] = [
  { id: "nps", type: "nps", label: "En una escala del 0 al 10, ¿qué tan probable es que le recomiendes a un compañero acudir al CKU cuando necesite apoyo?" },
  { id: CKU_ABIERTA_ID, type: "text", label: "¿Qué podría hacer el CKU para apoyarte mejor?" },
  { id: "G1", code: "G1", type: "likert", label: "El CKU me ayuda a entender cómo mi trabajo contribuye a la estrategia del área" },
  { id: "G2", code: "G2", type: "likert", label: "El CKU comunica de forma clara y a tiempo los cambios de prioridades o de estrategia que afectan mi trabajo" },
  { id: "I1", code: "I1", type: "likert", label: "El CKU conoce las necesidades y dificultades reales de mi trabajo diario" },
  { id: "I2", code: "I2", type: "likert", label: "El CKU detecta problemas o necesidades del equipo antes de que se conviertan en obstáculos" },
  { id: "T1", code: "T1", type: "likert", label: "Las capacitaciones del CKU me preparan para usar las nuevas herramientas en mi trabajo diario" },
  { id: "T2", code: "T2", type: "likert", label: "Las capacitaciones del CKU se adaptan al nivel y ritmo de aprendizaje de mi equipo" },
  { id: "H1", code: "H1", type: "likert", label: "El CKU es accesible y escucha activamente cuando planteo una necesidad o problema" },
  { id: "H2", code: "H2", type: "likert", label: "El CKU me acompaña y resuelve mis dudas cuando implementan cambios en herramientas o procesos y/o nuevos clientes" },
];

/** Encuesta de CKU creada. */
export interface CkuSurveyDoc {
  token: string;
  /** Nombre del CKU dueño (el del Player). */
  cku: string;
  ckuEmail: string;
  /** Qué se califica: el nombre del entregable del que nació (o, en las primeras, lo que el CKU escribió a mano). */
  nombre: string;
  /** Id del entregable (item de la Fase 3 en Monday) del que nació; null en las primeras, creadas a mano. */
  entregableId: string | null;
  createdByEmail: string;
  createdAt: string;
  /** Cuántas personas la han contestado (solo en el listado; no cuenta las invalidadas aparte). */
  respuestas: number;
}

/** ¿Está completado un entregable? Su Status en Monday es «Done» (sin importar mayúsculas ni espacios): solo entonces se
 *  puede mandar la encuesta NPS. */
export const entregableCompletado = (status: string | null | undefined): boolean => (status ?? "").trim().toLowerCase() === "done";

// ── Cambios locales a las respuestas del dashboard (data.npsRecords), sin volver a pedir todo ─────────────
// Las respuestas de una encuesta de CKU llegan como NpsRecord con ckuEncuesta y token = el de su encuesta; dentro de
// una encuesta, el correo de quien contestó es único.

/** Las respuestas sin las de esa encuesta de CKU (se eliminó). */
export const sinEncuestaCku = (recs: NpsRecord[], token: string): NpsRecord[] =>
  recs.filter((r) => !(r.ckuEncuesta && r.token === token));

/** Las respuestas con la de ese correo, en esa encuesta de CKU, invalidada (o devuelta a las métricas). */
export const conRespuestaCkuInvalidada = (recs: NpsRecord[], token: string, email: string, invalidated: boolean): NpsRecord[] => {
  const correo = email.trim().toLowerCase();
  return recs.map((r) => (r.ckuEncuesta && r.token === token && (r.respondentEmail ?? "").toLowerCase() === correo ? { ...r, invalidated } : r));
};

/** Lo único que ve quien abre el enlace (sin correos ni respuestas). */
export interface PublicCkuSurvey {
  token: string;
  cku: string;
  nombre: string;
}

export type CkuAnswers = Record<string, string | number>;

/** Una persona que contestó. */
export interface CkuSurveyResponseDoc {
  id: string;
  surveyToken: string;
  respondentName: string;
  respondentEmail: string;
  answers: CkuAnswers;
  invalidated: boolean;
  submittedAt: string;
}

/** ¿Están respondidas TODAS las preguntas? (todas son obligatorias, igual que la de PM) */
export function ckuIsComplete(answers: CkuAnswers): boolean {
  return CKU_SURVEY_QUESTIONS.every((q) => {
    const v = answers[q.id];
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim() !== "";
    return true;
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const esCorreoValido = (s: string) => EMAIL_RE.test(s.trim());

/** Enlace público para contestar la encuesta, sobre el origen dado (window.location.origin en el cliente). */
export const enlaceEncuestaCku = (origin: string, token: string) => `${origin}/encuesta/cku/${token}`;
