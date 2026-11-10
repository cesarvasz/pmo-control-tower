// SOLO SERVIDOR. Tableros en Supabase: listar, crear y leer uno completo.

import { getSupabaseAdmin, selectAll, unwrap } from "@/lib/supabase-admin";
import type { AppUser } from "@/lib/permissions";
import type { Json, Tables } from "@/types/supabase";
import {
  categoriaValida, columnasPorDefecto, COLORES_GRUPO, elementosVisibles, FASES_VALOR, limpiarTexto, MAX_NOMBRE, porOrden,
  type Columna, type Elemento, type FaseValor, type Grupo, type Tablero, type TableroCompleto,
} from "../dominio/tablero";
import { puede, type ReglaPermiso, type UsuarioTableros } from "../dominio/permisos";
import { listarReglas } from "./permisos";
import { usuarioTableros } from "./puerta";

// ── Filas → dominio ──────────────────────────────────────────────────────────

export function aTablero(r: Tables<"tableros">): Tablero {
  return {
    id: r.id, nombre: r.nombre, codigo: r.codigo, categoria: r.categoria, descripcion: r.descripcion,
    plantillaId: r.plantilla_id, actualizadoAt: r.actualizado_at,
  };
}

export function aGrupo(r: Tables<"tablero_grupos">): Grupo {
  const fase = (FASES_VALOR as readonly string[]).includes(r.fase ?? "") ? (r.fase as FaseValor) : null;
  return { id: r.id, titulo: r.titulo, color: r.color, orden: r.orden, fase };
}

export function aColumna(r: Tables<"tablero_columnas">): Columna {
  return {
    id: r.id, nivel: r.nivel === "sub" ? "sub" : "item", titulo: r.titulo, tipo: r.tipo, rol: r.rol, config: r.config,
    orden: r.orden, ancho: r.ancho, oculta: r.oculta,
  };
}

export function aElemento(r: Tables<"elementos">): Elemento {
  return {
    id: r.id, grupoId: r.grupo_id, parentId: r.parent_id, nombre: r.nombre, orden: r.orden,
    valores: (r.valores && typeof r.valores === "object" && !Array.isArray(r.valores) ? r.valores : {}) as Record<string, unknown>,
    responsables: r.responsables, actualizadoAt: r.actualizado_at,
  };
}

// ── Acceso ───────────────────────────────────────────────────────────────────

export interface Acceso {
  usuario: UsuarioTableros;
  /** Solo las reglas del rol del usuario (lo único que necesita el motor). */
  reglas: ReglaPermiso[];
}

export async function accesoDe(me: AppUser): Promise<Acceso> {
  const [usuario, reglas] = await Promise.all([usuarioTableros(me), listarReglas()]);
  return { usuario, reglas: reglas.filter((r) => r.rolId === me.roleId) };
}

// ── Lectura ──────────────────────────────────────────────────────────────────

export interface TableroResumen extends Tablero {
  elementos: number;
}

/** Tableros vigentes que el usuario puede ver. */
export async function listarTableros(acceso: Acceso): Promise<TableroResumen[]> {
  const db = getSupabaseAdmin();
  const filas = unwrap(await db.from("tableros").select("*").is("archivado_at", null).order("nombre")) ?? [];
  const visibles = filas.map(aTablero).filter((t) => puede(acceso.usuario, "ver", t, acceso.reglas));
  if (!visibles.length) return [];
  const conteo = await selectAll<{ tablero_id: string }>((d, h) => db.from("elementos")
    .select("tablero_id").in("tablero_id", visibles.map((t) => t.id)).is("archivado_at", null).is("parent_id", null)
    .order("id").range(d, h));
  const n = new Map<string, number>();
  for (const c of conteo) n.set(c.tablero_id, (n.get(c.tablero_id) ?? 0) + 1);
  return visibles.map((t) => ({ ...t, elementos: n.get(t.id) ?? 0 }));
}

export async function leerTableroFila(id: string): Promise<Tablero | null> {
  const r = unwrap(await getSupabaseAdmin().from("tableros").select("*").eq("id", id).is("archivado_at", null).maybeSingle());
  return r ? aTablero(r) : null;
}

/** El tablero completo (vigente), con "solo lo mío" ya aplicado. */
export async function leerTablero(id: string, acceso: Acceso): Promise<TableroCompleto | null> {
  const db = getSupabaseAdmin();
  const tablero = await leerTableroFila(id);
  if (!tablero || !puede(acceso.usuario, "ver", tablero, acceso.reglas)) return null;
  const [grupos, columnas, elementos] = await Promise.all([
    unwrap(await db.from("tablero_grupos").select("*").eq("tablero_id", id).is("archivado_at", null)) ?? [],
    unwrap(await db.from("tablero_columnas").select("*").eq("tablero_id", id).is("archivada_at", null)) ?? [],
    selectAll<Tables<"elementos">>((d, h) => db.from("elementos").select("*").eq("tablero_id", id).is("archivado_at", null).order("id").range(d, h)),
  ]);
  return {
    tablero,
    grupos: grupos.map(aGrupo).sort(porOrden),
    columnas: columnas.map(aColumna).sort(porOrden),
    elementos: elementosVisibles(acceso.usuario, tablero, acceso.reglas, elementos.map(aElemento)).sort(porOrden),
  };
}

export async function listarPersonasCorto(): Promise<{ id: string; nombre: string; activo: boolean }[]> {
  const db = getSupabaseAdmin();
  const filas = await selectAll<{ id: string; nombre: string; activo: boolean }>((d, h) =>
    db.from("personas").select("id, nombre, activo").order("id").range(d, h));
  return filas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export async function leerHistorial(tableroId: string, elementoId: string) {
  const filas = unwrap(await getSupabaseAdmin().from("tablero_historial")
    .select("id, columna_id, campo, antes, despues, usuario_email, creado_at")
    .eq("tablero_id", tableroId).eq("elemento_id", elementoId)
    .order("creado_at", { ascending: false }).limit(200)) ?? [];
  return filas.map((h) => ({
    id: h.id, columnaId: h.columna_id, campo: h.campo, antes: h.antes, despues: h.despues, usuario: h.usuario_email, fecha: h.creado_at,
  }));
}

// ── Crear ────────────────────────────────────────────────────────────────────

/** Crea un tablero con un grupo y las columnas que su categoría necesita. Devuelve su id. */
export async function crearTablero(datos: { nombre?: unknown; codigo?: unknown; categoria?: unknown }, me: AppUser): Promise<string> {
  const nombre = limpiarTexto(datos.nombre, MAX_NOMBRE);
  if (!nombre) throw new Error("tablero-sin-nombre");
  const categoria = categoriaValida(datos.categoria);
  const db = getSupabaseAdmin();
  const t = unwrap(await db.from("tableros").insert({
    nombre, codigo: limpiarTexto(datos.codigo, 30), categoria, creado_por: me.uid,
  }).select("id").single())!;

  try {
    unwrap(await db.from("tablero_grupos").insert({ tablero_id: t.id, titulo: "Grupo 1", color: COLORES_GRUPO[0], orden: 0 }));
    const cols = columnasPorDefecto(categoria).map((c, i) => ({
      tablero_id: t.id, nivel: c.nivel, titulo: c.titulo, tipo: c.tipo, rol: c.rol, config: c.config as Json, orden: i,
    }));
    if (cols.length) unwrap(await db.from("tablero_columnas").insert(cols));
  } catch (e) {
    await db.from("tableros").delete().eq("id", t.id); // no dejar tableros a medias
    throw e;
  }
  return t.id;
}
