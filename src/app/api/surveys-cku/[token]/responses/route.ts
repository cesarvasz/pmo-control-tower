// src/app/api/surveys-cku/[token]/responses/route.ts
// GET: la encuesta con las respuestas de cada persona. Un Admin ve las de cualquier CKU; un CKU, solo las de sus encuestas.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/users";
import { getCkuSurvey, listCkuResponses } from "@/lib/surveysCku";
import { actorCku, puedeVerCku } from "@/lib/surveyCkuAuth";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const me = await requireSession(request.headers.get("authorization"));
    const { token } = await params;
    const survey = await getCkuSurvey(token);
    if (!survey) return NextResponse.json({ error: "Encuesta no encontrada" }, { status: 404 });
    if (!puedeVerCku(await actorCku(me), survey.cku)) throw new Error("forbidden");
    return NextResponse.json({ survey, responses: await listCkuResponses(token) });
  } catch (err) {
    return apiError(err);
  }
}
