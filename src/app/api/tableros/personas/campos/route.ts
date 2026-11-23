// src/app/api/tableros/personas/campos/route.ts
// Campos PROPIOS del directorio (además de los del Directorio RH): se agregan aquí y se muestran
// en los tableros con una columna Espejo. Pasa por la puerta de Tableros.
//  GET                                       → { campos }
//  POST   { titulo, tipo, opciones? }        → crea un campo (tipo: texto | numero | fecha | lista)
//  PATCH  { campoId, titulo?, opciones? }    → cambia el título o las opciones (el tipo no cambia)
//  DELETE ?id=<campoId>                      → lo quita (se archiva; los valores se quedan guardados)

import { NextResponse } from "next/server";
import { exigirAccion, exigirVerDirectorio } from "@/features/tableros/datos/puerta";
import { respuestaDeError } from "@/features/tableros/datos/errores";
import {
  archivarCampoDirectorio, crearCampoDirectorio, editarCampoDirectorio, listarCamposDirectorio,
} from "@/features/tableros/datos/personas";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const leer = async (request: Request) => ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

export async function GET(request: Request) {
  try {
    await exigirVerDirectorio(request);
    return NextResponse.json({ campos: await listarCamposDirectorio() });
  } catch (err) {
    return respuestaDeError(err);
  }
}

export async function POST(request: Request) {
  try {
    const me = await exigirAccion(request, "directorio_administrar");
    const d = await leer(request);
    return NextResponse.json({ campo: await crearCampoDirectorio(d, me.email) }, { status: 201 });
  } catch (err) {
    return respuestaDeError(err);
  }
}

export async function PATCH(request: Request) {
  try {
    await exigirAccion(request, "directorio_administrar");
    const d = await leer(request);
    const campoId = typeof d.campoId === "string" ? d.campoId : "";
    if (!UUID_RE.test(campoId)) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    return NextResponse.json({ campo: await editarCampoDirectorio(campoId, d) });
  } catch (err) {
    return respuestaDeError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    await exigirAccion(request, "directorio_administrar");
    const campoId = new URL(request.url).searchParams.get("id") ?? "";
    if (!UUID_RE.test(campoId)) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    await archivarCampoDirectorio(campoId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respuestaDeError(err);
  }
}
