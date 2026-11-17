// src/app/api/google/status/route.ts
// Estado de la conexión de Google del usuario que pregunta (nunca devuelve tokens).

import { NextResponse } from "next/server";
import { requireAction } from "@/lib/users";
import { apiError } from "@/lib/api-errors";
import { configGoogle } from "@/lib/googleOauth";
import { getConexion } from "@/lib/reuniones";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "schedule_meetings");
    const c = await getConexion(me.uid);
    return NextResponse.json({
      configurado: configGoogle() !== null,
      conectado: !!c, estado: c?.estado ?? null, googleEmail: c?.googleEmail ?? null, conectadoAt: c?.conectadoAt ?? null,
    });
  } catch (err) {
    return apiError(err);
  }
}
