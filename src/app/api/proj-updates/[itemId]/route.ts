// src/app/api/proj-updates/[itemId]/route.ts
// Bitácora (Updates de Monday) de un item/hito de Proyectos: GET lista los
// comentarios existentes, POST publica uno nuevo. Mismo gate que el dropdown
// de status: acción "edit_proj_status" (Admin siempre; otros roles como PM se
// la otorgan desde /roles).

import { NextResponse } from "next/server";
import { requireAction } from "@/lib/users";
import { apiError } from "@/lib/api-errors";
import { createProjUpdate, fetchProjUpdates } from "@/lib/monday";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    await requireAction(request.headers.get("authorization"), "edit_proj_status");
    const { itemId } = await params;
    const updates = await fetchProjUpdates(itemId);
    return NextResponse.json({ updates });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "edit_proj_status");
    const { itemId } = await params;

    const parsed = (await request.json().catch(() => null)) as { body?: string } | null;
    const text = parsed?.body?.trim();
    if (!text) return NextResponse.json({ error: "El comentario no puede estar vacío" }, { status: 400 });

    // Monday mostrará el comentario como publicado por la cuenta del API token,
    // no por el usuario real de la app — se antepone el autor para trazabilidad.
    const author = me.displayName || me.email;
    await createProjUpdate(itemId, `${author} (vía PMO App):\n${text}`);

    const updates = await fetchProjUpdates(itemId);
    return NextResponse.json({ updates });
  } catch (err) {
    return apiError(err);
  }
}
