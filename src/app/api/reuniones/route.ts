// src/app/api/reuniones/route.ts
// GET ?elementoId=…  → las reuniones vigentes de esa iniciativa creadas desde la app, con «esMia» (¿están en MI calendario? solo entonces se
// pueden reprogramar o cancelar) y «respuestas» (quién aceptó / rechazó, leído de Google; null si no se pudo).
// POST: agenda la Meeting 1 / Meeting 2 de una iniciativa en el Google Calendar del usuario que la pide.
// Body: { elementoId, inicio, fin (ISO), descripcion?, invitados: [personaId, …] }. Requiere «schedule_meetings»; además un PM solo
// puede agendar las iniciativas donde él es el PM (un Admin, cualquiera). El código, el tipo (M1/M2) y el título los decide el
// servidor a partir de la iniciativa; los invitados se toman del Directorio RH por id (no se aceptan correos escritos a mano).

import { NextResponse } from "next/server";
import { requireAction } from "@/lib/users";
import { apiError } from "@/lib/api-errors";
import { agendarReunion, respuestasDeReunion } from "@/lib/reunionesServicio";
import { reunionesVigentesDeElemento } from "@/lib/reuniones";
import type { Invitado } from "@/lib/reunionesRows";
import { iniciativaAgendable } from "@/features/tableros/datos/reunion-iniciativa";
import { listarPersonas } from "@/features/tableros/datos/personas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "schedule_meetings");
    const elementoId = new URL(request.url).searchParams.get("elementoId") ?? "";
    const reuniones = await reunionesVigentesDeElemento(elementoId);
    // Las respuestas de los invitados se leen de Google al momento (no se guardan): pocas reuniones vigentes por iniciativa
    const respuestas = await Promise.all(reuniones.map((r) => respuestasDeReunion(r)));
    return NextResponse.json({ reuniones: reuniones.map((r, i) => ({ ...r, esMia: r.organizadorId === me.uid, respuestas: respuestas[i] })) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const me = await requireAction(request.headers.get("authorization"), "schedule_meetings");
    const b = (await request.json().catch(() => null)) as { elementoId?: unknown; inicio?: unknown; fin?: unknown; descripcion?: unknown; invitados?: unknown } | null;
    if (typeof b?.elementoId !== "string" || typeof b.inicio !== "string" || typeof b.fin !== "string" || !Array.isArray(b.invitados)
      || (b.descripcion !== undefined && b.descripcion !== null && typeof b.descripcion !== "string")) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    }
    const ini = await iniciativaAgendable(b.elementoId, me);

    const directorio = new Map((await listarPersonas()).filter((p) => p.activo && p.email).map((p) => [p.id, p]));
    const invitados: Invitado[] = [];
    for (const id of b.invitados) {
      const p = typeof id === "string" ? directorio.get(id) : undefined;
      if (!p) return NextResponse.json({ error: "Solo se puede invitar a personas activas del Directorio RH con correo" }, { status: 400 });
      invitados.push({ personaId: p.id, email: p.email!, nombre: p.nombre });
    }

    const reunion = await agendarReunion({
      codigo: ini.codigo, tipo: ini.tipo, elementoId: ini.elementoId, nombreIniciativa: ini.nombre,
      descripcion: typeof b.descripcion === "string" ? b.descripcion.trim().slice(0, 2000) || null : null,
      inicio: b.inicio, fin: b.fin, invitados,
    }, { uid: me.uid, email: me.email });
    return NextResponse.json({ ok: true, reunion });
  } catch (err) {
    return apiError(err);
  }
}
