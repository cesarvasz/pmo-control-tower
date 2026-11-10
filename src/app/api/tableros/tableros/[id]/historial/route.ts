// src/app/api/tableros/tableros/[id]/historial/route.ts
//  GET ?elemento=<uuid> → { historial } de ese elemento (si el usuario puede verlo)

import { NextResponse } from "next/server";
import { exigirAccion } from "@/features/tableros/datos/puerta";
import { accesoDe, leerHistorial, leerTablero } from "@/features/tableros/datos/tableros";
import { ErrorTablero, respuestaDeError } from "@/features/tableros/datos/errores";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await exigirAccion(request, "tableros_ver");
    const { id } = await params;
    const elemento = new URL(request.url).searchParams.get("elemento") ?? "";
    if (!UUID_RE.test(id) || !UUID_RE.test(elemento)) throw new ErrorTablero(400, "Parámetros inválidos");
    // Solo si el elemento está entre los que el usuario ve (aplica "solo lo mío").
    const completo = await leerTablero(id, await accesoDe(me));
    if (!completo?.elementos.some((e) => e.id === elemento)) throw new ErrorTablero(404, "Elemento no encontrado");
    return NextResponse.json({ historial: await leerHistorial(id, elemento) });
  } catch (err) {
    return respuestaDeError(err);
  }
}
