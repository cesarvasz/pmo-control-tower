// src/app/api/surveys/[token]/response/route.ts
// GET: encuesta completa + respuesta (para la vista de resultados).
// Requiere el permiso de la página "encuestas" (quién puede ver las respuestas).

import { NextResponse } from "next/server";
import { requirePage } from "@/lib/users";
import { getResponse, getSurvey } from "@/lib/surveys";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    await requirePage(request.headers.get("authorization"), "encuestas");
    const { token } = await params;
    const survey = await getSurvey(token);
    if (!survey) return NextResponse.json({ error: "Encuesta no encontrada" }, { status: 404 });

    const response = survey.answered ? await getResponse(token) : null;
    return NextResponse.json({ survey, response });
  } catch (err) {
    return apiError(err);
  }
}
