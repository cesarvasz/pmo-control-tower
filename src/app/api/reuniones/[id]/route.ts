// src/app/api/reuniones/[id]/route.ts
// PATCH  { inicio?, fin?, descripcion?, invitados?: [personaId, …] } → reprograma la MISMA reunión (mismo evento de Google).
// DELETE                                                           → cancela la reunión (borra el evento; la iniciativa queda «Sin agendar»).
// Solo quien la agendó (el evento vive en su calendario). Requiere «schedule_meetings».

import { NextResponse } from "next/server";
import { requireAction } from "@/lib/users";
import { apiError } from "@/lib/api-errors";
import { cancelarReunionAgendada, reprogramarReunion } from "@/lib/reunionesServicio";
import type { Invitado } from "@/lib/reunionesRows";
import { listarPersonas } from "@/features/tableros/datos/personas";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "schedule_meetings");
    const { id } = await params;
    const b = (await request.json().catch(() => null)) as { inicio?: unknown; fin?: unknown; descripcion?: unknown; invitados?: unknown } | null;
    if (!b || (b.inicio !== undefined && typeof b.inicio !== "string") || (b.fin !== undefined && typeof b.fin !== "string")
      || (b.descripcion !== undefined && b.descripcion !== null && typeof b.descripcion !== "string") || (b.invitados !== undefined && !Array.isArray(b.invitados))) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    }
    let invitados: Invitado[] | undefined;
    if (Array.isArray(b.invitados)) {
      const directorio = new Map((await listarPersonas()).filter((p) => p.activo && p.email).map((p) => [p.id, p]));
      invitados = [];
      for (const pid of b.invitados) {
        const p = typeof pid === "string" ? directorio.get(pid) : undefined;
        if (!p) return NextResponse.json({ error: "Solo se puede invitar a personas activas del Directorio RH con correo" }, { status: 400 });
        invitados.push({ personaId: p.id, email: p.email!, nombre: p.nombre });
      }
    }
    const reunion = await reprogramarReunion(id, {
      ...(typeof b.inicio === "string" ? { inicio: b.inicio } : {}), ...(typeof b.fin === "string" ? { fin: b.fin } : {}),
      ...(b.descripcion !== undefined ? { descripcion: typeof b.descripcion === "string" ? b.descripcion.trim().slice(0, 2000) || null : null } : {}),
      ...(invitados ? { invitados } : {}),
    }, { uid: me.uid, email: me.email });
    return NextResponse.json({ ok: true, reunion });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "schedule_meetings");
    const { id } = await params;
    await cancelarReunionAgendada(id, { uid: me.uid, email: me.email });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
