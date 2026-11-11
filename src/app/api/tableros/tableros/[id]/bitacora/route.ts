// src/app/api/tableros/tableros/[id]/bitacora/route.ts
//  GET ?elemento=<uuid> → { comentarios } de ese elemento (si el usuario puede verlo): las
//                         actualizaciones y sus respuestas, cada una con sus archivos adjuntos.
//  Escribir: POST /api/tableros/tableros/[id] con op comentario.crear / editar / borrar y
//            archivo.preparar / confirmar / borrar / descargar.

import { NextResponse } from "next/server";
import { exigirAccion } from "@/features/tableros/datos/puerta";
import { accesoDe, leerTablero } from "@/features/tableros/datos/tableros";
import { ErrorTablero, respuestaDeError } from "@/features/tableros/datos/errores";
import { getSupabaseAdmin, selectAll, unwrap } from "@/lib/supabase-admin";
import type { AdjuntoComentario, Comentario } from "@/features/tableros/dominio/bitacora";

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
    const db = getSupabaseAdmin();
    const [filas, archivos] = await Promise.all([
      unwrap(await db.from("elemento_comentarios").select("*")
        .eq("tablero_id", id).eq("elemento_id", elemento).is("borrado_at", null).order("creado_at", { ascending: false }).limit(1000)) ?? [],
      selectAll<{ id: string; comentario_id: string | null; nombre: string; tamano: number | null; tipo_mime: string | null; monday_asset_id: string | null; subido_por: string | null }>((d, h) =>
        db.from("elemento_archivos").select("id, comentario_id, nombre, tamano, tipo_mime, monday_asset_id, subido_por")
          .eq("tablero_id", id).eq("elemento_id", elemento).eq("estado", "listo").is("borrado_at", null).not("comentario_id", "is", null).order("creado_at").range(d, h)),
    ]);
    const adjuntosDe = new Map<string, AdjuntoComentario[]>();
    for (const a of archivos) {
      const lista = adjuntosDe.get(a.comentario_id!) ?? [];
      lista.push({ id: a.id, nombre: a.nombre, tamano: a.tamano, tipoMime: a.tipo_mime, deMonday: !!a.monday_asset_id, subidoPor: a.subido_por });
      adjuntosDe.set(a.comentario_id!, lista);
    }
    const comentarios: Comentario[] = filas.map((c) => ({
      id: c.id, autorId: c.autor_id, autorNombre: c.autor_nombre || c.autor_email || "—", autorEmail: c.autor_email,
      texto: c.texto, creadoAt: c.creado_at, editadoAt: c.editado_at, deMonday: !!c.monday_update_id,
      respuestaA: c.respuesta_a, archivos: adjuntosDe.get(c.id) ?? [],
    }));
    return NextResponse.json({ comentarios, yo: me.uid });
  } catch (err) {
    return respuestaDeError(err);
  }
}
