// src/app/api/google/disconnect/route.ts
// Desconecta el Google del usuario: revoca el token en Google (mejor esfuerzo) y borra la conexión (el trigger borra el secreto).
// Las reuniones ya agendadas se conservan.

import { NextResponse } from "next/server";
import { requireAction } from "@/lib/users";
import { apiError } from "@/lib/api-errors";
import { revocarToken } from "@/lib/googleOauth";
import { desconectar, leerRefreshToken } from "@/lib/reuniones";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "schedule_meetings");
    const token = await leerRefreshToken(me.uid);
    const revocado = token ? await revocarToken(token) : false;
    const habia = await desconectar(me.uid);
    return NextResponse.json({ ok: true, habiaConexion: habia, revocadoEnGoogle: revocado });
  } catch (err) {
    return apiError(err);
  }
}
