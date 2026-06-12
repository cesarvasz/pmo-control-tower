// src/app/api/proj-baselines/route.ts
// POST /api/proj-baselines — sobreescribe los costos planificados (baselines) de
// todos los items de un board con los costos actuales de Monday.
// Solo accesible para usuarios con la acción "manage_users" (Administrador).

import { NextResponse } from "next/server";
import { saveProjItemBaseline } from "@/lib/firebase-admin";
import { requireAction } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // 1. Autenticación + autorización (solo admin).
  try {
    await requireAction(request.headers.get("authorization"), "manage_users");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    if (msg === "no-token" || msg === "invalid-token")
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (msg === "forbidden")
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // 2. Validar cuerpo.
  let boardId: string;
  let items: Array<{ id: string; cost: number }>;
  try {
    const body = (await request.json()) as unknown;
    if (
      typeof body !== "object" || body === null ||
      typeof (body as Record<string, unknown>).boardId !== "string" ||
      !Array.isArray((body as Record<string, unknown>).items)
    ) {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }
    boardId = (body as { boardId: string; items: { id: string; cost: number }[] }).boardId;
    items   = (body as { boardId: string; items: { id: string; cost: number }[] }).items;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // 3. Sobreescribir baselines en Firestore.
  try {
    await Promise.all(
      items.map(({ id, cost }) => saveProjItemBaseline(id, { boardId, cost }))
    );
    return NextResponse.json({ ok: true, updated: items.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
