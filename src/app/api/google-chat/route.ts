// src/app/api/google-chat/route.ts
// POST ← Google Chat (app de Chat hecha como Google Workspace add-on, endpoint HTTP). Aquí solo se verifica que la
// llamada venga de Google y se despacha; lo que hace el bot vive en src/features/google-chat (núcleo + un flujo por
// comando: nucleo/registro.ts). Apagado mientras falten GOOGLE_CHAT_URL y GOOGLE_CHAT_CUENTA_SERVICIO (503).
// Guía: docs/google-chat.md.

import { NextResponse } from "next/server";
import { verificarLlamadaDeChat } from "@/features/google-chat/nucleo/token";
import { despachar } from "@/features/google-chat/nucleo/despachar";
import { FLUJOS } from "@/features/google-chat/nucleo/registro";
import type { EventoChat } from "@/features/google-chat/nucleo/eventos";

export const dynamic = "force-dynamic";
// La respuesta a Google Chat sale en segundos; esto es para el trabajo que sigue después (after: la foto de la Status Card).
export const maxDuration = 60;

/** Para pruebas con Google real (GOOGLE_CHAT_DIAGNOSTICO=1): la forma del evento, sin tokens. */
function diagnostico(e: EventoChat) {
  if (process.env.GOOGLE_CHAT_DIAGNOSTICO !== "1") return;
  const chat = e.chat ?? {};
  console.log("[google-chat] evento", JSON.stringify({
    cargas: Object.keys(chat).filter((x) => x.endsWith("Payload")),
    usuario: chat.user?.email,
    parametros: e.commonEventObject?.parameters,
    campos: Object.keys(e.commonEventObject?.formInputs ?? {}),
    comando: chat.appCommandPayload?.appCommandMetadata,
    dialogo: (chat.appCommandPayload ?? chat.buttonClickedPayload)?.dialogEventType,
  }));
}

export async function POST(request: Request) {
  const url = process.env.GOOGLE_CHAT_URL;
  const cuenta = process.env.GOOGLE_CHAT_CUENTA_SERVICIO;
  if (!url || !cuenta) return NextResponse.json({ error: "El bot de Google Chat no está configurado" }, { status: 503 });
  if (!(await verificarLlamadaDeChat(request.headers.get("authorization"), url, cuenta))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const e = (await request.json().catch(() => null)) as EventoChat | null;
  if (!e || typeof e !== "object") return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
  diagnostico(e);
  return NextResponse.json(await despachar(e, url, FLUJOS));
}
