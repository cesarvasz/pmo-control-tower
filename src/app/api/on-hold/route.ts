// src/app/api/on-hold/route.ts
// Pone o quita un Proyecto (board) o un PML (item) de On Hold. Mientras está en On Hold no
// cuenta en ninguna métrica (ver lib/onHold.ts). Requiere la acción "edit_on_hold" (Admin
// siempre; otros roles se la otorgan en /roles).
//  POST  body: { tipo: "proyecto" | "pml", id: string, activo: boolean, motivo?: string }
//        Para ponerlo en On Hold (activo: true) el motivo es obligatorio: la justificación.
//  PATCH body: { tipo, id, motivo: string } — cambia el motivo de algo que ya está en On Hold.

import { NextResponse } from "next/server";
import { requireAction } from "@/lib/users";
import { setMotivoOnHold, setOnHold } from "@/lib/firebase-admin";
import { esTipoOnHold, MOTIVO_ON_HOLD_MAX, normalizarIdOnHold, normalizarMotivoOnHold } from "@/lib/onHold";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

const MOTIVO_INVALIDO = `El motivo es obligatorio (máximo ${MOTIVO_ON_HOLD_MAX} caracteres)`;

export async function POST(request: Request) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "edit_on_hold");

    const body = (await request.json().catch(() => null)) as { tipo?: unknown; id?: unknown; activo?: unknown; motivo?: unknown } | null;
    const id = normalizarIdOnHold(body?.id);
    if (!esTipoOnHold(body?.tipo) || !id || typeof body?.activo !== "boolean") {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    }

    // Reactivar no necesita motivo; pausar sí.
    const motivo = body.activo ? normalizarMotivoOnHold(body.motivo) : "";
    if (motivo === null || (body.activo && !motivo)) {
      return NextResponse.json({ error: MOTIVO_INVALIDO }, { status: 400 });
    }

    await setOnHold(body.tipo, id, body.activo, me.email, motivo);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAction(request.headers.get("authorization"), "edit_on_hold");

    const body = (await request.json().catch(() => null)) as { tipo?: unknown; id?: unknown; motivo?: unknown } | null;
    const id = normalizarIdOnHold(body?.id);
    if (!esTipoOnHold(body?.tipo) || !id) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    }
    const motivo = normalizarMotivoOnHold(body.motivo);
    if (!motivo) return NextResponse.json({ error: MOTIVO_INVALIDO }, { status: 400 });

    const ok = await setMotivoOnHold(body.tipo, id, motivo);
    if (!ok) return NextResponse.json({ error: "Ya no está en On Hold" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
