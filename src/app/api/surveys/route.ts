// src/app/api/surveys/route.ts
// GET: lista todas las encuestas (para los badges de estado en la página REQ).
// POST: crea un link de encuesta para una persona dentro de un REQ (un REQ puede tener
//       varios links, uno por destinatario). Cualquier usuario autenticado.

import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { createSurvey, listSurveys } from "@/lib/surveys";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await verifyRequest(request.headers.get("authorization"));
    return NextResponse.json(await listSurveys());
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const me = await verifyRequest(request.headers.get("authorization"));
    const body = (await request.json()) as {
      reqId?: string; reqCode?: string; reqName?: string; pm?: string;
      assignedEmail?: string; assignedName?: string;
    };
    if (!body.reqId || !body.assignedEmail?.trim()) {
      return NextResponse.json({ error: "Falta reqId o el correo del destinatario" }, { status: 400 });
    }
    const survey = await createSurvey({
      reqId: body.reqId,
      reqCode: body.reqCode ?? "",
      reqName: body.reqName ?? "",
      pm: body.pm ?? "",
      assignedEmail: body.assignedEmail.trim(),
      assignedName: body.assignedName ?? "",
      createdByEmail: me.email,
    });
    return NextResponse.json(survey, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
