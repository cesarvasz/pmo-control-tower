// SOLO SERVIDOR. Reglas de permisos de tableros (tabla tablero_permisos).

import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import type { Tables } from "@/types/supabase";
import { esNivel, type ReglaPermiso } from "../dominio/permisos";

function aRegla(r: Tables<"tablero_permisos">): ReglaPermiso {
  return {
    id: r.id,
    rolId: r.rol_id,
    tableroId: r.tablero_id,
    categoria: r.categoria,
    nivel: esNivel(r.nivel) ? r.nivel : "ninguno",
    columnasEditables: r.columnas_editables,
    soloLoMio: r.solo_lo_mio,
  };
}

export async function listarReglas(): Promise<ReglaPermiso[]> {
  const filas = unwrap(await getSupabaseAdmin().from("tablero_permisos").select("*").order("rol_id")) ?? [];
  return filas.map(aRegla);
}

/** Crea o reemplaza la regla de un rol para un tablero o una categoría. */
export async function guardarRegla(r: ReglaPermiso, por: string): Promise<ReglaPermiso> {
  const db = getSupabaseAdmin();
  let q = db.from("tablero_permisos").select("id").eq("rol_id", r.rolId);
  q = r.tableroId ? q.eq("tablero_id", r.tableroId) : q.eq("categoria", r.categoria!);
  const previa = unwrap(await q.maybeSingle());
  const fila = {
    rol_id: r.rolId,
    tablero_id: r.tableroId,
    categoria: r.categoria,
    nivel: r.nivel,
    columnas_editables: r.columnasEditables,
    solo_lo_mio: r.soloLoMio,
    actualizado_por: por,
    actualizado_at: new Date().toISOString(),
  };
  const guardada = previa
    ? unwrap(await db.from("tablero_permisos").update(fila).eq("id", previa.id).select("*").single())
    : unwrap(await db.from("tablero_permisos").insert(fila).select("*").single());
  return aRegla(guardada!);
}

export async function borrarRegla(id: string): Promise<void> {
  unwrap(await getSupabaseAdmin().from("tablero_permisos").delete().eq("id", id));
}
