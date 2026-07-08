// src/lib/survey.ts
// Definición de la encuesta PMO personalizada por REQ (cliente + servidor).
// Las preguntas son fijas (mismas del Google Form que alimenta el NPS).

export const LIKERT_OPTIONS = [
  "Totalmente de acuerdo",
  "De acuerdo",
  "Neutral",
  "En desacuerdo",
  "Totalmente en desacuerdo",
] as const;

export type SurveyQuestionType = "nps" | "text" | "likert";

export interface SurveyQuestion {
  id: string;                 // clave usada en las respuestas
  type: SurveyQuestionType;
  label: string;
  code?: string;              // G1, G2, I1… (solo Likert)
}

// Sección de dimensiones (Likert). El código va como pista visual.
export const SURVEY_DIMENSIONS_TITLE = "Dimensiones PMO como Socio Estratégico";

// Orden pedido: NPS (0–10) → razón (texto) → dimensiones Likert.
export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "nps",
    type: "nps",
    label: "En una escala del 0 al 10, ¿qué tan probable es que recomiende a la PMO como un socio estratégico generador de valor?",
  },
  {
    id: "razon",
    type: "text",
    label: "¿Cuál es la razón principal de su calificación? (Por favor, sea específico en cuanto a resultados u objetivos, puede indicar proyectos específicos)",
  },
  { id: "G1", code: "G1", type: "likert", label: "La PMO contribuye activamente al desarrollo y seguimiento de la estrategia de mi área" },
  { id: "G2", code: "G2", type: "likert", label: "La PMO facilita decisiones informadas al nivel directivo con datos y visibilidad del portafolio" },
  { id: "I1", code: "I1", type: "likert", label: "Los proyectos gestionados por la PMO están claramente alineados con los objetivos estratégicos de mi área" },
  { id: "I2", code: "I2", type: "likert", label: "La PMO identifica y comunica oportunamente cuando un proyecto se desvía de los objetivos estratégicos" },
  { id: "P1", code: "P1", type: "likert", label: "La PMO adapta su metodología y herramientas según la naturaleza y complejidad de cada proyecto" },
  { id: "P2", code: "P2", type: "likert", label: "Los procesos PMO mejoran la calidad y predictibilidad de los proyectos de mi área" },
  { id: "T1", code: "T1", type: "likert", label: "La PMO proporciona dashboards y reportes útiles para la toma de decisiones" },
  { id: "T2", code: "T2", type: "likert", label: "Las herramientas tecnológicas de la PMO facilitan la colaboración y comunicación del proyecto" },
  { id: "H1", code: "H1", type: "likert", label: "El equipo PMO demuestra liderazgo, escucha activa y orientación al cliente interno" },
  { id: "H2", code: "H2", type: "likert", label: "La PMO gestiona efectivamente el cambio organizacional que generan los proyectos" },
];

export type SurveyAnswers = Record<string, string | number>;

/** Subconjunto público de una encuesta (para el enlace, sin datos sensibles). */
export interface PublicSurvey {
  token: string;
  reqCode: string;
  reqName: string;
  pm: string;
  answered: boolean;
}

/** Encuesta creada (metadatos personalizados del REQ + destinatario). */
export interface SurveyDoc {
  token: string;
  reqId: string;        // ID interno del REQ (para asociar por fila)
  reqCode: string;      // "REQ ID" visible
  reqName: string;
  pm: string;
  assignedEmail: string;
  assignedName: string;
  createdByEmail: string;
  createdAt: string;
  answered: boolean;
  answeredAt: string | null;
  invalidated: boolean;   // marcada por un admin para NO contar en métricas
}

/** Respuesta enviada por el destinatario (inmutable). */
export interface SurveyResponseDoc {
  answers: SurveyAnswers;
  respondentEmail: string;
  submittedAt: string;
}

/** ¿Están respondidas TODAS las preguntas? (todas son obligatorias) */
export function isComplete(answers: SurveyAnswers): boolean {
  return SURVEY_QUESTIONS.every((q) => {
    const v = answers[q.id];
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim() !== "";
    return true;
  });
}
