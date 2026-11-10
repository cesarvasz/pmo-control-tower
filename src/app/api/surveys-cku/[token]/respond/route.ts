// src/app/api/surveys-cku/[token]/respond/route.ts
// POST PÚBLICO { name, email, answers }: guarda la respuesta de una persona. Sin login (el token es la credencial).
// Cada correo puede contestar una sola vez cada encuesta.

import { NextResponse } from "next/server";
import { getCkuSurvey, saveCkuResponse, yaContesto } from "@/lib/surveysCku";
import { ckuIsComplete, esCorreoValido, type CkuAnswers } from "@/lib/surveyCku";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const survey = await getCkuSurvey(token);
    if (!survey) return NextResponse.json({ error: "Encuesta no encontrada" }, { status: 404 });

    const body = (await request.json().catch(() => null)) as { name?: unknown; email?: unknown; answers?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!name) return NextResponse.json({ error: "Escribe tu nombre" }, { status: 400 });
    if (name.length > 120) return NextResponse.json({ error: "El nombre es demasiado largo" }, { status: 400 });
    if (!esCorreoValido(email)) return NextResponse.json({ error: "Escribe un correo válido" }, { status: 400 });

    const answers = (body?.answers && typeof body.answers === "object" ? body.answers : {}) as CkuAnswers;
    if (!ckuIsComplete(answers)) return NextResponse.json({ error: "Faltan preguntas por responder" }, { status: 400 });

    if (await yaContesto(token, email)) throw new Error("cku-already-answered");
    await saveCkuResponse(token, name, email, answers);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
