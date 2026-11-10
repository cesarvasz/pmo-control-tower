// src/app/api/surveys-cku/[token]/check/route.ts
// POST PÚBLICO { email } → { answered }: ¿ese correo ya contestó esta encuesta? Para avisarlo antes de que llene todo.

import { NextResponse } from "next/server";
import { getCkuSurvey, yaContesto } from "@/lib/surveysCku";
import { esCorreoValido } from "@/lib/surveyCku";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!esCorreoValido(email)) return NextResponse.json({ answered: false });
    if (!(await getCkuSurvey(token))) return NextResponse.json({ error: "Encuesta no encontrada" }, { status: 404 });
    return NextResponse.json({ answered: await yaContesto(token, email) });
  } catch (err) {
    return apiError(err);
  }
}
