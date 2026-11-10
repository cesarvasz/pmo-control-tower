// src/app/api/tableros/tableros/route.ts
// Tableros propios (en prueba, página /tableros). Pasa por la puerta de Tableros.
//  GET                                                → { tableros } que el usuario puede ver
//  POST { nombre, codigo?, categoria?, plantillaId? } → crea un tablero, en blanco o desde una
//                                                       plantilla (acción tableros_crear) → { id }

import { NextResponse } from "next/server";
import { exigirAccion } from "@/features/tableros/datos/puerta";
import { accesoDe, crearTablero, listarTableros } from "@/features/tableros/datos/tableros";
import { crearDesdePlantilla } from "@/features/tableros/datos/plantillas";
import { respuestaDeError } from "@/features/tableros/datos/errores";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const me = await exigirAccion(request, "tableros_ver");
    return NextResponse.json({ tableros: await listarTableros(await accesoDe(me)) });
  } catch (err) {
    return respuestaDeError(err);
  }
}

export async function POST(request: Request) {
  try {
    const me = await exigirAccion(request, "tableros_crear");
    const body = (await request.json().catch(() => null)) as
      { nombre?: unknown; codigo?: unknown; categoria?: unknown; plantillaId?: unknown } | null;
    const id = typeof body?.plantillaId === "string" && UUID_RE.test(body.plantillaId)
      ? await crearDesdePlantilla(body.plantillaId, body, me)
      : await crearTablero(body ?? {}, me);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return respuestaDeError(err);
  }
}
