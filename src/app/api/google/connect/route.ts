// src/app/api/google/connect/route.ts
// Inicia la conexión con Google Calendar del usuario: devuelve la URL de autorización de Google y deja una cookie httpOnly
// con el nonce del state (el callback exige que coincidan). Requiere la acción «schedule_meetings».

import { NextResponse } from "next/server";
import { requireAction } from "@/lib/users";
import { apiError } from "@/lib/api-errors";
import { COOKIE_STATE, configGoogle, crearState, urlAutorizacion, VIGENCIA_STATE_MS } from "@/lib/googleOauth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "schedule_meetings");
    const cfg = configGoogle();
    if (!cfg) return NextResponse.json({ error: "La conexión con Google no está configurada en el servidor" }, { status: 503 });
    const origen = new URL(request.url).origin;
    const { state, nonce } = crearState(me.uid, cfg.stateSecret);
    const res = NextResponse.json({ url: urlAutorizacion(cfg, origen, state, me.email) });
    res.cookies.set(COOKIE_STATE, nonce, {
      httpOnly: true, sameSite: "lax", secure: origen.startsWith("https://"), path: "/api/google", maxAge: Math.floor(VIGENCIA_STATE_MS / 1000),
    });
    return res;
  } catch (err) {
    return apiError(err);
  }
}
