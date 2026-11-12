// SOLO SERVIDOR. Plantillas: guardar un tablero como plantilla, listarlas y crear desde una.

import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import type { AppUser } from "@/lib/permissions";
import type { Json } from "@/types/supabase";
import { categoriaValida, limpiarTexto, MAX_NOMBRE, type TableroCompleto } from "../dominio/tablero";
import { resumenDefinicion, tableroADefinicion, validarDefinicion, type DefinicionTablero } from "../dominio/definicion";
import { crearDesdeDefinicion } from "./materializar";
import { ErrorTablero } from "./errores";

export interface PlantillaResumen {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  version: number;
  tableroOrigenId: string | null;
  actualizadoAt: string;
  resumen: ReturnType<typeof resumenDefinicion>;
  /** Columnas de item (título y rol) para mostrar. */
  columnas: { titulo: string; tipo: string; rol: string | null }[];
}

export async function listarPlantillas(): Promise<PlantillaResumen[]> {
  const filas = unwrap(await getSupabaseAdmin().from("plantillas").select("*").is("archivada_at", null).order("nombre")) ?? [];
  return filas.map((p) => {
    const d = validarDefinicion(p.definicion);
    return {
      id: p.id, nombre: p.nombre, descripcion: p.descripcion, categoria: p.categoria, version: p.version,
      tableroOrigenId: p.tablero_origen_id, actualizadoAt: p.actualizado_at, resumen: resumenDefinicion(d),
      columnas: d.columnas.filter((c) => c.nivel === "item").map((c) => ({ titulo: c.titulo, tipo: c.tipo, rol: c.rol })),
    };
  });
}

/** Guarda el tablero como plantilla nueva. Si ya hay una plantilla con ese nombre, la actualiza (versión +1). */
export async function guardarComoPlantilla(
  t: TableroCompleto, datos: { nombre?: unknown; descripcion?: unknown; conElementos?: unknown }, me: AppUser,
): Promise<string> {
  const nombre = limpiarTexto(datos.nombre, MAX_NOMBRE);
  if (!nombre) throw new ErrorTablero(400, "La plantilla necesita un nombre");
  const definicion = tableroADefinicion(t, datos.conElementos === true) as unknown as Json;
  const db = getSupabaseAdmin();
  const previa = unwrap(await db.from("plantillas").select("id, version").eq("nombre", nombre).is("archivada_at", null).maybeSingle());
  const fila = {
    nombre, descripcion: limpiarTexto(datos.descripcion, 1000), categoria: t.tablero.categoria, definicion,
    tablero_origen_id: t.tablero.id, actualizado_at: new Date().toISOString(),
  };
  if (previa) {
    unwrap(await db.from("plantillas").update({ ...fila, version: previa.version + 1 }).eq("id", previa.id));
    return previa.id;
  }
  return unwrap(await db.from("plantillas").insert({ ...fila, creado_por: me.uid }).select("id").single())!.id;
}

export async function archivarPlantilla(id: string): Promise<void> {
  const r = unwrap(await getSupabaseAdmin().from("plantillas").update({ archivada_at: new Date().toISOString() }).eq("id", id).select("id"));
  if (!r?.length) throw new ErrorTablero(404, "Plantilla no encontrada");
}

export async function leerDefinicionPlantilla(id: string): Promise<{ definicion: DefinicionTablero; categoria: string }> {
  const p = unwrap(await getSupabaseAdmin().from("plantillas").select("definicion, categoria").eq("id", id).is("archivada_at", null).maybeSingle());
  if (!p) throw new ErrorTablero(404, "Plantilla no encontrada");
  return { definicion: validarDefinicion(p.definicion), categoria: p.categoria };
}

export async function crearDesdePlantilla(
  plantillaId: string, datos: { nombre?: unknown; codigo?: unknown; categoria?: unknown }, me: AppUser,
): Promise<string> {
  const { definicion, categoria } = await leerDefinicionPlantilla(plantillaId);
  return crearDesdeDefinicion(definicion, {
    nombre: datos.nombre, codigo: datos.codigo, categoria: datos.categoria ? categoriaValida(datos.categoria) : categoria, plantillaId,
  }, me);
}
