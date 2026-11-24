// src/app/api/google-chat/foto/[codigo]/route.ts
// GET → el PNG de una Status Card que el bot de Google Chat puso en un mensaje. Lo piden Google (para mostrar la imagen)
// y quien toca «Ver en grande». Sin sesión: se entra con un código firmado de 7 días que el bot emite después de revisar
// permisos. La primera vez se toma la foto (o se espera la que empezó el bot) y queda guardada; después siempre es la misma.

import { NextResponse } from "next/server";
import { verificarFirma } from "@/features/google-chat/nucleo/firma";
import { leerDatoFoto } from "@/features/google-chat/flujos/status-card/codigo";
import { fotoParaEntregar } from "@/features/google-chat/flujos/status-card/imagen";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const foto = leerDatoFoto(verificarFirma(decodeURIComponent(codigo)));
  if (!foto) return NextResponse.json({ error: "Enlace vencido o inválido" }, { status: 404 });
  const origen = new URL(process.env.GOOGLE_CHAT_URL ?? _request.url).origin;
  try {
    const png = await fotoParaEntregar(foto.boardId, foto.emitido, origen);
    return new NextResponse(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=604800, immutable", "X-Robots-Tag": "noindex" },
    });
  } catch (err) {
    console.error("[google-chat] no se pudo entregar la foto de la Status Card", err);
    return NextResponse.json({ error: "No se pudo generar la imagen" }, { status: 500 });
  }
}
