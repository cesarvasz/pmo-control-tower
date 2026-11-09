// src/app/api/buenas-noticias/route.ts
// Suplentes de «Buenas noticias» (portada). La rotación se calcula en el cliente (lib/buenasNoticias.ts); aquí solo se
// guardan los cambios por semana.
// GET: cualquier usuario autenticado. POST { semana: "YYYY-MM-DD" (lunes), nombre: string | null }: requiere acceso a la
// página "overview" (como las fechas de restauración); nombre null = volver al original de la rotación.

import { NextResponse } from "next/server";
import { requirePage } from "@/lib/users";
import { verifyRequest, getBuenasNoticiasSuplentes, setBuenasNoticiasSuplente } from "@/lib/firebase-admin";
import { NOMBRES_BUENAS_NOTICIAS } from "@/lib/buenasNoticias";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  try {
    await verifyRequest(request.headers.get("authorization"));
    return NextResponse.json({ suplentes: await getBuenasNoticiasSuplentes() });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const me = await requirePage(request.headers.get("authorization"), "overview");
    const body = (await request.json().catch(() => null)) as { semana?: unknown; nombre?: unknown } | null;
    const { semana, nombre } = body ?? {};
    if (typeof semana !== "string" || !DATE_RE.test(semana))
      return NextResponse.json({ error: "semana requerida en formato YYYY-MM-DD" }, { status: 400 });
    if (nombre !== null && !(typeof nombre === "string" && (NOMBRES_BUENAS_NOTICIAS as readonly string[]).includes(nombre)))
      return NextResponse.json({ error: "nombre inválido" }, { status: 400 });
    return NextResponse.json({ suplentes: await setBuenasNoticiasSuplente(semana, nombre, me.email) });
  } catch (err) {
    return apiError(err);
  }
}
