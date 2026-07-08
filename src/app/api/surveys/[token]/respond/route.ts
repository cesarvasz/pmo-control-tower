// src/app/api/surveys/[token]/respond/route.ts
// POST PÚBLICO: guarda la respuesta. Sin login (el token es la credencial).
// Candado de una sola vez: si ya fue contestada, se rechaza.
// La respuesta se registra a nombre del correo asignado (Directorio RH).

import { NextResponse } from "next/server";
import { getSurvey, saveResponse } from "@/lib/surveys";
import { isComplete, type SurveyAnswers } from "@/lib/survey";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const survey = await getSurvey(token);
    if (!survey) return NextResponse.json({ error: "Encuesta no encontrada" }, { status: 404 });
    if (survey.answered) {
      return NextResponse.json({ error: "Esta encuesta ya fue contestada" }, { status: 409 });
    }

    const body = (await request.json()) as { answers?: SurveyAnswers };
    const answers = body.answers ?? {};
    if (!isComplete(answers)) {
      return NextResponse.json({ error: "Faltan preguntas por responder" }, { status: 400 });
    }

    await saveResponse(token, answers, survey.assignedEmail);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
