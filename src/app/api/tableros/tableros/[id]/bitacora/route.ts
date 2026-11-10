// src/app/api/tableros/tableros/[id]/bitacora/route.ts
//  GET ?elemento=<uuid> → { comentarios } de ese elemento (si el usuario puede verlo), más nuevos primero.
//  Escribir: POST /api/tableros/tableros/[id] con op comentario.crear / editar / borrar.

import { NextResponse } from "next/server";
import { exigirAccion } from "@/features/tableros/datos/puerta";
import { accesoDe, leerTablero } from "@/features/tableros/datos/tableros";
import { ErrorTablero, respuestaDeError } from "@/features/tableros/datos/errores";
import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import type { Comentario } from "@/features/tableros/dominio/bitacora";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await exigirAccion(request, "tableros_ver");
    const { id } = await params;
    const elemento = new URL(request.url).searchParams.get("elemento") ?? "";
    if (!UUID_RE.test(id) || !UUID_RE.test(elemento)) throw new ErrorTablero(400, "Parámetros inválidos");
    const t = await leerTablero(id, await accesoDe(me));
    if (!t?.elementos.some((e) => e.id === elemento)) throw new ErrorTablero(404, "Elemento no encontrado");
    const filas = unwrap(await getSupabaseAdmin().from("elemento_comentarios").select("*")
      .eq("tablero_id", id).eq("elemento_id", elemento).is("borrado_at", null).order("creado_at", { ascending: false }).limit(500)) ?? [];
    const comentarios: Comentario[] = filas.map((c) => ({
      id: c.id, autorId: c.autor_id, autorNombre: c.autor_nombre || c.autor_email || "—", autorEmail: c.autor_email,
      texto: c.texto, creadoAt: c.creado_at, editadoAt: c.editado_at, deMonday: !!c.monday_update_id,
    }));
    return NextResponse.json({ comentarios, yo: me.uid });
  } catch (err) {
    return respuestaDeError(err);
  }
}
