// src/app/api/tableros/personas/route.ts
// Directorio de personas (página «Directorio» y pestaña de /tableros). Verlo: Tableros o la página Directorio; cambiarlo: directorio_administrar.
//  GET                                → { personas, usuarios, campos, cortado }
//  POST  { refrescar?: boolean }      → importa el Directorio RH desde la copia de Monday (antes del corte)
//  POST  { crear: { nombre, email?, grupo?, rol?, tld?, hrsMes?, activo? } } → da de alta una persona (después del corte)
//  PATCH { personaId, appUserId|null } → liga o desliga a mano una persona con un usuario
//  PATCH { personaId, campoId, valor } → guarda el valor de un campo propio (vacío = se borra)
//  PATCH { personaId, campo, valor }   → cambia un campo fijo: nombre, email, grupo, rol, tld, hrsMes, activo (después del corte)
// Los campos propios se definen en /api/tableros/personas/campos.

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { exigirAccion, exigirVerDirectorio } from "@/features/tableros/datos/puerta";
import {
  crearPersona, directorioCortado, editarCampoPersona, guardarValorCampo, importarPersonasDesdeMonday, ligarPersona, listarCamposDirectorio,
  listarPersonas, listarUsuariosApp,
} from "@/features/tableros/datos/personas";
import { respuestaDeError } from "@/features/tableros/datos/errores";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    await exigirVerDirectorio(request);
    const [personas, usuarios, campos, cortado] = await Promise.all([listarPersonas(), listarUsuariosApp(), listarCamposDirectorio(), directorioCortado()]);
    return NextResponse.json({ personas, usuarios, campos, cortado });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    await exigirAccion(request, "directorio_administrar");
    const body = (await request.json().catch(() => null)) as { refrescar?: unknown; crear?: unknown } | null;
    if (body?.crear && typeof body.crear === "object" && !Array.isArray(body.crear)) {
      return NextResponse.json({ ok: true, id: await crearPersona(body.crear as Record<string, unknown>) });
    }
    return NextResponse.json(await importarPersonasDesdeMonday(body?.refrescar !== false));
  } catch (err) {
    return respuestaDeError(err);
  }
}

export async function PATCH(request: Request) {
  try {
    await exigirAccion(request, "directorio_administrar");
    const body = (await request.json().catch(() => null)) as { personaId?: unknown; appUserId?: unknown; campoId?: unknown; campo?: unknown; valor?: unknown } | null;
    const personaId = typeof body?.personaId === "string" ? body.personaId : "";
    if (body && "campo" in body) {
      if (!UUID_RE.test(personaId)) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
      return NextResponse.json({ ok: true, valor: await editarCampoPersona(personaId, body.campo, body.valor) });
    }
    if (body && "campoId" in body) {
      const campoId = typeof body.campoId === "string" ? body.campoId : "";
      if (!UUID_RE.test(personaId) || !UUID_RE.test(campoId)) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
      return NextResponse.json({ ok: true, valor: await guardarValorCampo(personaId, campoId, body.valor) });
    }
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
    return respuestaDeError(err);
  }
}
