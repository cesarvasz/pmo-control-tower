// src/app/api/tableros/plantillas/route.ts
// Plantillas de tableros. Guardar una se hace desde el tablero (op tablero.guardar_plantilla) y
// crear un tablero desde una, con POST /api/tableros/tableros { plantillaId }.
//  GET               → { plantillas }
//  DELETE ?id=<uuid> → archiva la plantilla (acción plantillas_administrar)

import { NextResponse } from "next/server";
import { exigirAccion } from "@/features/tableros/datos/puerta";
import { archivarPlantilla, listarPlantillas } from "@/features/tableros/datos/plantillas";
import { ErrorTablero, respuestaDeError } from "@/features/tableros/datos/errores";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    await exigirAccion(request, "tableros_ver");
    return NextResponse.json({ plantillas: await listarPlantillas() });
  } catch (err) {
    return respuestaDeError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    await exigirAccion(request, "plantillas_administrar");
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!UUID_RE.test(id)) throw new ErrorTablero(400, "Parámetros inválidos");
    await archivarPlantilla(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respuestaDeError(err);
  }
}
