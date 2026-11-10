// src/app/api/surveys-cku/[token]/route.ts
// GET PÚBLICO: lo mínimo para pintar el formulario (nombre de la encuesta y de qué CKU). La seguridad está en el token (UUID
//   aleatorio no adivinable); no expone correos ni respuestas.
// PATCH { responseId, invalidated }: saca una respuesta de las métricas (o la devuelve).
// DELETE: elimina la encuesta con todas sus respuestas.
// Ambas: un Admin (de cualquier CKU) o el CKU dueño de la encuesta (solo la suya).

import { NextResponse } from "next/server";
import { deleteCkuSurvey, getCkuSurvey, listCkuResponses, setCkuResponseInvalidated } from "@/lib/surveysCku";
import { requireSession } from "@/lib/users";
import { actorCku, puedeVerCku } from "@/lib/surveyCkuAuth";
import type { PublicCkuSurvey } from "@/lib/surveyCku";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const s = await getCkuSurvey(token);
    if (!s) return NextResponse.json({ error: "Encuesta no encontrada" }, { status: 404 });
    const survey: PublicCkuSurvey = { token: s.token, cku: s.cku, nombre: s.nombre };
    return NextResponse.json({ survey });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const me = await requireSession(request.headers.get("authorization"));
    const { token } = await params;
    const survey = await getCkuSurvey(token);
    if (!survey) return NextResponse.json({ error: "Encuesta no encontrada" }, { status: 404 });
    if (!puedeVerCku(await actorCku(me), survey.cku)) throw new Error("forbidden");
    const body = (await request.json().catch(() => null)) as { responseId?: unknown; invalidated?: unknown } | null;
    if (typeof body?.responseId !== "string" || typeof body.invalidated !== "boolean")
      return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
    // La respuesta tiene que ser de ESTA encuesta (la que se autorizó arriba) antes de tocarla.
    if (!(await listCkuResponses(token)).some((x) => x.id === body.responseId))
      return NextResponse.json({ error: "Respuesta no encontrada" }, { status: 404 });
    const r = await setCkuResponseInvalidated(body.responseId, body.invalidated);
    return NextResponse.json(r);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const me = await requireSession(request.headers.get("authorization"));
    const { token } = await params;
    const survey = await getCkuSurvey(token);
    if (!survey) return NextResponse.json({ error: "Encuesta no encontrada" }, { status: 404 });
    if (!puedeVerCku(await actorCku(me), survey.cku)) throw new Error("forbidden");
    await deleteCkuSurvey(token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
