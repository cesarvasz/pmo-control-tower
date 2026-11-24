// src/app/api/google-chat/drive/callback/route.ts
// GET ← Google, después de que la persona autorizó (o no) su Drive para el bot de Google Chat. Guarda la autorización y
// muestra el resultado. La identidad sale del state firmado (atado a la cookie) y se confirma con la cuenta que entró a
// Google. Ver nucleo/drive.ts.

import { NextResponse } from "next/server";
import { terminarConexionDrive } from "@/features/google-chat/nucleo/drive";
import { COOKIE_DRIVE } from "@/features/google-chat/nucleo/drive-formato";
import { paginaResultado } from "@/features/google-chat/nucleo/pagina";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const chat = process.env.GOOGLE_CHAT_URL;
  const origen = chat ? new URL(chat).origin : url.origin;
  const nonce = request.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE_DRIVE}=`))?.slice(COOKIE_DRIVE.length + 1) ?? null;
  let resultado: { ok: boolean; texto: string };
  try {
    resultado = await terminarConexionDrive({
      state: url.searchParams.get("state"), code: url.searchParams.get("code"), error: url.searchParams.get("error"), nonce, origen,
    });
  } catch (err) {
    console.error("[google-chat/drive/callback]", err instanceof Error ? err.message : "error");
    resultado = { ok: false, texto: "Algo falló al conectar tu Drive. Intenta de nuevo en un momento o avísale al PMO." };
  }
  const res = new NextResponse(paginaResultado(resultado), { status: resultado.ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  res.cookies.set(COOKIE_DRIVE, "", { path: "/api/google-chat/drive", maxAge: 0 });
  return res;
}
