// src/app/api/surveys/[token]/route.ts
// GET PÚBLICO: metadatos mínimos de la encuesta para renderizar el formulario.
// No requiere login; la seguridad está en el token (UUID aleatorio no adivinable).
// No expone el correo asignado ni las respuestas.

import { NextResponse } from "next/server";
import { getSurvey, reopenSurvey, setInvalidated } from "@/lib/surveys";
import { requireAction } from "@/lib/users";
import type { PublicSurvey } from "@/lib/survey";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const survey = await getSurvey(token);
    if (!survey) return NextResponse.json({ error: "Encuesta no encontrada" }, { status: 404 });

    const publicSurvey: PublicSurvey = {
      token: survey.token,
      reqCode: survey.reqCode,
      reqName: survey.reqName,
      pm: survey.pm,
      answered: survey.answered,
    };
    return NextResponse.json({ survey: publicSurvey });
  } catch (err) {
    return apiError(err);
  }
}

// PATCH: acciones de administrador (invalidar / revalidar / reabrir para reenviar).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    await requireAction(request.headers.get("authorization"), "manage_roles");
    const { token } = await params;
    const body = (await request.json()) as { invalidated?: boolean; reopen?: boolean };

    let survey = null;
    if (body.reopen) survey = await reopenSurvey(token);
    else if (typeof body.invalidated === "boolean") survey = await setInvalidated(token, body.invalidated);
    else return NextResponse.json({ error: "Acción no válida" }, { status: 400 });

    if (!survey) return NextResponse.json({ error: "Encuesta no encontrada" }, { status: 404 });
    return NextResponse.json(survey);
  } catch (err) {
    return apiError(err);
  }
}
