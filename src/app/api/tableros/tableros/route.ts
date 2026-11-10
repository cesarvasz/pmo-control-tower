// src/app/api/tableros/tableros/route.ts
// Tableros propios (en prueba, página /tableros). Pasa por la puerta de Tableros.
//  GET                                   → { tableros } que el usuario puede ver
//  POST { nombre, codigo?, categoria? }  → crea un tablero (acción tableros_crear) → { id }

import { NextResponse } from "next/server";
import { exigirAccion } from "@/features/tableros/datos/puerta";
import { accesoDe, crearTablero, listarTableros } from "@/features/tableros/datos/tableros";
import { respuestaDeError } from "@/features/tableros/datos/errores";

export const dynamic = "force-dynamic";

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
    const body = (await request.json().catch(() => null)) as { nombre?: unknown; codigo?: unknown; categoria?: unknown } | null;
    return NextResponse.json({ id: await crearTablero(body ?? {}, me) }, { status: 201 });
  } catch (err) {
    return respuestaDeError(err);
  }
}
