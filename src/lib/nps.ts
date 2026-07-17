// src/lib/nps.ts
// NPS de la encuesta PMO (Google Forms / Firestore). Funciones puras.

import { SURVEY_QUESTIONS } from "@/lib/survey";
import type { NpsData, NpsRecord, NpsResponse, SheetRow } from "@/types";

// Normaliza texto (sin acentos, minúsculas) para localizar columnas por pista.
const normCol = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Extrae el texto entre corchetes del encabezado Likert; si no hay, usa el completo.
const cleanQuestion = (key: string) => {
  const m = key.match(/\[(.+)\]/);
  return (m ? m[1] : key).trim();
};
// Escala Likert → porcentaje (20% por nivel). null si no es una respuesta Likert.
const likertPct = (value: string): number | null => {
  const v = normCol(value).trim();
  return v === "totalmente de acuerdo" ? 100
       : v === "de acuerdo" ? 80
       : v === "neutral" ? 60
       : v === "en desacuerdo" ? 40
       : v === "totalmente en desacuerdo" ? 20
       : null;
};

/**
 * NPS = (#promotores − #detractores) / total × 100.
 * Promotores = 9-10, Pasivos = 7-8, Detractores = 0-6.
 * Devuelve además cada respuesta estructurada (para el detalle).
 */
export function calcNps(rows: SheetRow[]): NpsData {
  let promoters = 0, passives = 0, detractors = 0, total = 0;
  const responses: NpsResponse[] = [];
  const qAgg = new Map<string, { sum: number; count: number }>(); // promedio por pregunta

  rows.forEach((row) => {
    // Filas con "X" en "Columna 5" se excluyen del cálculo.
    const col5Key = Object.keys(row).find((k) => /^columna\s*5$/i.test(k.trim()));
    if (col5Key && String(row[col5Key] ?? "").trim().toUpperCase() === "X") return;

    const keys = Object.keys(row);
    const scoreKey  = keys.find((k) => normCol(k).includes("recomiende"));
    const tsKey     = keys.find((k) => normCol(k).includes("marca temporal"));
    const mailKey   = keys.find((k) => normCol(k).includes("correo"));
    const reasonKey = keys.find((k) => normCol(k).includes("razon"));

    const scoreRaw = scoreKey ? row[scoreKey] : undefined;
    const score = typeof scoreRaw === "number" ? scoreRaw : parseFloat(String(scoreRaw));
    const validScore = Number.isFinite(score);

    let category: NpsResponse["category"] = null;
    if (validScore) {
      total++;
      category = score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor";
      if (category === "promoter") promoters++;
      else if (category === "passive") passives++;
      else detractors++;
    }

    const metaKeys = new Set([scoreKey, tsKey, mailKey, reasonKey].filter(Boolean) as string[]);
    const answers = keys
      .filter((k) => !metaKeys.has(k) && !/^columna\s*\d+$/i.test(k.trim()))
      .map((k) => ({ question: cleanQuestion(k), value: String(row[k] ?? "").trim() }))
      .filter((a) => a.value !== "");

    // Acumula el % Likert por pregunta (escala 20% por nivel).
    answers.forEach((a) => {
      const pct = likertPct(a.value);
      if (pct === null) return;
      const agg = qAgg.get(a.question) ?? { sum: 0, count: 0 };
      agg.sum += pct; agg.count++;
      qAgg.set(a.question, agg);
    });

    responses.push({
      timestamp: tsKey ? String(row[tsKey] ?? "") : "",
      email: mailKey ? String(row[mailKey] ?? "") : "",
      score: validScore ? score : null,
      category,
      reason: reasonKey ? String(row[reasonKey] ?? "") : "",
      answers,
    });
  });

  const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null;
  const questions = [...qAgg.entries()].map(([question, { sum, count }]) => ({
    question, avg: Math.round(sum / count), count,
  }));
  const overallAvg = questions.length > 0
    ? Math.round(questions.reduce((s, q) => s + q.avg, 0) / questions.length)
    : null;

  return { nps, promoters, passives, detractors, total, responses, questions, overallAvg };
}

/**
 * NPS calculado desde las respuestas de Firestore (fuente única). MISMAS fórmulas
 * que `calcNps` (promotores 9-10, pasivos 7-8, detractores 0-6; Likert 20%/nivel).
 * - Excluye respuestas invalidadas (equivalente al flag "Columna 5 = X" del Sheet).
 * - Si se pasa `pm`, calcula el NPS personal de ese PM (filtra por PM).
 */
export function calcNpsFromRecords(records: NpsRecord[], pm?: string): NpsData {
  let promoters = 0, passives = 0, detractors = 0, total = 0;
  const responses: NpsResponse[] = [];
  const qAgg = new Map<string, { sum: number; count: number }>();

  for (const rec of records) {
    if (rec.invalidated) continue;                    // no cuenta en métricas
    if (pm !== undefined && rec.pm !== pm) continue;   // NPS por PM

    const a = rec.answers ?? {};
    const scoreRaw = a["nps"];
    const score = typeof scoreRaw === "number" ? scoreRaw : parseFloat(String(scoreRaw));
    const validScore = Number.isFinite(score);

    let category: NpsResponse["category"] = null;
    if (validScore) {
      total++;
      category = score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor";
      if (category === "promoter") promoters++;
      else if (category === "passive") passives++;
      else detractors++;
    }

    // Dimensiones Likert (por id G1…H2), etiquetadas con el texto de la pregunta.
    const answers: { question: string; value: string }[] = [];
    for (const q of SURVEY_QUESTIONS) {
      if (q.type !== "likert") continue;
      const value = String(a[q.id] ?? "").trim();
      if (!value) continue;
      answers.push({ question: q.label, value });
      const pct = likertPct(value);
      if (pct === null) continue;
      const agg = qAgg.get(q.label) ?? { sum: 0, count: 0 };
      agg.sum += pct; agg.count++;
      qAgg.set(q.label, agg);
    }

    responses.push({
      timestamp: rec.submittedAt,
      email: rec.respondentEmail,
      score: validScore ? score : null,
      category,
      reason: String(a["razon"] ?? ""),
      answers,
    });
  }

  const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null;
  const questions = [...qAgg.entries()].map(([question, { sum, count }]) => ({
    question, avg: Math.round(sum / count), count,
  }));
  const overallAvg = questions.length > 0
    ? Math.round(questions.reduce((s, q) => s + q.avg, 0) / questions.length)
    : null;

  return { nps, promoters, passives, detractors, total, responses, questions, overallAvg };
}

/** Clasificación del NPS (rangos, color y texto) — fuente única. */
export function npsCfg(nps: number | null): { color: string; label: string } | null {
  if (nps === null) return null;
  return nps >= 70 ? { color: "#43a047", label: "PMO EXCELENTE" }   // +70 a +100
       : nps >= 50 ? { color: "#2e7d32", label: "PMO BUENA" }       // +50 a +69
       : nps >= 30 ? { color: "#ef6c00", label: "PMO ACEPTABLE" }   // +30 a +49
       : nps >= 0  ? { color: "#c9a227", label: "PMO BÁSICA" }      //   0 a +29
       :             { color: "#c0392b", label: "PMO EN RIESGO" };  // -100 a -1
}
