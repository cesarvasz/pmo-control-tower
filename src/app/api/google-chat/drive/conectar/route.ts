// src/app/api/google-chat/drive/conectar/route.ts
// GET ← el botón «Conectar mi Drive» del bot de Google Chat (enlace firmado con el correo, 1 día). Manda a la persona a
// Google a autorizar drive.readonly; el state va firmado y atado a una cookie. Ver nucleo/drive.ts.

import { NextResponse } from "next/server";
import { iniciarConexionDrive } from "@/features/google-chat/nucleo/drive";
import { COOKIE_DRIVE } from "@/features/google-chat/nucleo/drive-formato";
import { paginaResultado } from "@/features/google-chat/nucleo/pagina";
import { VIGENCIA_STATE_MS } from "@/lib/googleOauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // La vuelta de Google tiene que ser la URL registrada en el cliente OAuth: el dominio del bot, no el de esta petición.
  const chat = process.env.GOOGLE_CHAT_URL;
  const origen = chat ? new URL(chat).origin : new URL(request.url).origin;
  const r = iniciarConexionDrive(new URL(request.url).searchParams.get("c"), origen);
  if (r.tipo === "error") {
    return new NextResponse(paginaResultado({ ok: false, texto: r.motivo }), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  const res = NextResponse.redirect(r.url);
  res.cookies.set(COOKIE_DRIVE, r.nonce, {
    httpOnly: true, secure: origen.startsWith("https://"), sameSite: "lax", path: "/api/google-chat/drive", maxAge: VIGENCIA_STATE_MS / 1000,
  });
  return res;
}
