// src/app/api/tableros/personas/route.ts
// Directorio de personas de Tableros (en prueba, página /tableros). Pasa por la puerta de
// Tableros (features/tableros/datos/puerta.ts).
//  GET                                → { personas, usuarios }
//  POST  { refrescar?: boolean }      → importa el Directorio RH desde la copia de Monday
//  PATCH { personaId, appUserId|null } → liga o desliga a mano una persona con un usuario

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { exigirAccion } from "@/features/tableros/datos/puerta";
import { importarPersonasDesdeMonday, ligarPersona, listarPersonas, listarUsuariosApp } from "@/features/tableros/datos/personas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    await exigirAccion(request, "tableros_ver");
    const [personas, usuarios] = await Promise.all([listarPersonas(), listarUsuariosApp()]);
    return NextResponse.json({ personas, usuarios });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    await exigirAccion(request, "directorio_administrar");
    const body = (await request.json().catch(() => null)) as { refrescar?: unknown } | null;
    return NextResponse.json(await importarPersonasDesdeMonday(body?.refrescar !== false));
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(request: Request) {
  try {
    await exigirAccion(request, "directorio_administrar");
    const body = (await request.json().catch(() => null)) as { personaId?: unknown; appUserId?: unknown } | null;
    const personaId = typeof body?.personaId === "string" ? body.personaId : "";
    const appUserId = body?.appUserId === null ? null : typeof body?.appUserId === "string" ? body.appUserId : undefined;
    if (!UUID_RE.test(personaId) || appUserId === undefined || (appUserId !== null && !UUID_RE.test(appUserId))) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    }
    await ligarPersona(personaId, appUserId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "persona-no-encontrada") {
      return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
    }
    return apiError(err);
  }
}
