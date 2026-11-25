// src/app/api/google-chat/archivos/route.ts
// La página /archivos-iniciativa/<código> del bot de Google Chat: subir archivos al BORRADOR del formulario «Nueva
// iniciativa» antes de crearla. Sin sesión (casi ningún CKU tiene cuenta): la protege el código firmado (correo + borrador,
// 12 h). Reglas en features/google-chat/flujos/iniciativa/{subida,borrador}.ts.
//   GET  ?c=<código>                                   → { email, archivos, max, maxBytes }
//   POST { c, op: "preparar", nombre, tamano, tipoMime } → { archivoId, ruta, token } (el navegador sube directo a Storage)
//   POST { c, op: "confirmar", archivoId }               → { ok }
//   POST { c, op: "quitar", archivoId }                  → { ok }

import { NextResponse } from "next/server";
import {
  archivosDelBorrador, confirmarSubida, ErrorSubida, prepararSubida, quienSube, quitarDelBorrador,
} from "@/features/google-chat/flujos/iniciativa/borrador";
import { MAX_ARCHIVOS_BORRADOR, MAX_BYTES_ARCHIVO } from "@/features/google-chat/flujos/iniciativa/subida";

export const dynamic = "force-dynamic";

function respuestaDeError(err: unknown) {
  if (err instanceof ErrorSubida) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error("[google-chat] subida de archivos", err);
  return NextResponse.json({ error: "Algo falló de nuestro lado. Intenta de nuevo en un momento." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const { email, borrador } = quienSube(new URL(request.url).searchParams.get("c"));
    const archivos = await archivosDelBorrador(email, borrador);
    return NextResponse.json({
      email, max: MAX_ARCHIVOS_BORRADOR, maxBytes: MAX_BYTES_ARCHIVO,
      archivos: archivos.map(({ id, nombre, tamano }) => ({ id, nombre, tamano })),
    });
  } catch (err) {
    return respuestaDeError(err);
  }
}

export async function POST(request: Request) {
  try {
    const d = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!d) return NextResponse.json({ error: "Falta el cuerpo de la petición" }, { status: 400 });
    if (d.op === "preparar") return NextResponse.json(await prepararSubida(d.c, d));
    if (d.op === "confirmar") { await confirmarSubida(d.c, d.archivoId); return NextResponse.json({ ok: true }); }
    if (d.op === "quitar") { await quitarDelBorrador(d.c, d.archivoId); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: "Operación desconocida" }, { status: 400 });
  } catch (err) {
    return respuestaDeError(err);
  }
}
