// src/lib/reuniones.ts
// SOLO SERVIDOR. Reuniones agendadas (Meeting 1 y Meeting 2 de las iniciativas) y la cuenta de Google que cada usuario conectó.
// La traducción fila → tipo vive en reunionesRows.ts (puro, con tests).
//
// El REFRESH TOKEN de Google vive cifrado en el Vault de Supabase. Aquí solo se toca por las dos funciones de la base que
// guardan y leen ese secreto (google_guardar_conexion / google_leer_token, solo service_role); no se registra ni se devuelve
// en ninguna otra parte: ConexionGoogle no lo trae.

import type { CalMeetingRaw } from "@/types";
import type { Json, TablesUpdate } from "@/types/supabase";
import { DbError, getSupabaseAdmin, PG, selectAll, unwrap } from "@/lib/supabase-admin";
import { llaveReunion, type ReunionImportable } from "@/lib/reunionesImportacion";
import {
  aConexion, aEntradasCalendario, aReunion,
  type ConexionGoogle, type EstadoConexion, type Invitado, type OrigenReunion, type Reunion, type TipoReunion,
} from "@/lib/reunionesRows";

const db = getSupabaseAdmin;
const ahora = () => new Date().toISOString();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Conexión con Google (una por usuario de la app) ─────────────────────────

export async function getConexion(usuarioId: string): Promise<ConexionGoogle | null> {
  if (!UUID_RE.test(usuarioId)) return null;
  const fila = unwrap(await db().from("google_conexiones").select("*").eq("usuario_id", usuarioId).maybeSingle());
  return fila ? aConexion(fila) : null;
}

/** Guarda (o renueva) la conexión y su refresh token en una sola transacción de la base: sin secretos huérfanos. */
export async function guardarConexion(d: {
  usuarioId: string; googleEmail: string; googleSub: string; scopes: string[]; refreshToken: string;
}): Promise<void> {
  unwrap(await db().rpc("google_guardar_conexion", {
    p_usuario: d.usuarioId, p_google_email: d.googleEmail, p_google_sub: d.googleSub, p_scopes: d.scopes, p_refresh_token: d.refreshToken,
  }));
}

/** El refresh token en claro, solo para pedirle un access token a Google. null = no hay conexión (o su secreto ya no existe). */
export async function leerRefreshToken(usuarioId: string): Promise<string | null> {
  if (!UUID_RE.test(usuarioId)) return null;
  const t = unwrap(await db().rpc("google_leer_token", { p_usuario: usuarioId }));
  return typeof t === "string" && t ? t : null;
}

/** «reconectar» cuando Google ya no acepta el token (revocado, vencido, cambió la contraseña…); «activa» al volver a servir. */
export async function marcarConexion(usuarioId: string, estado: EstadoConexion, ultimoError: string | null): Promise<void> {
  unwrap(await db().from("google_conexiones").update({ estado, ultimo_error: ultimoError, actualizado_at: ahora() }).eq("usuario_id", usuarioId));
}

/** Quita la conexión; el secreto del Vault se borra solo (trigger). Las reuniones ya agendadas se conservan. true = había conexión. */
export async function desconectar(usuarioId: string): Promise<boolean> {
  if (!UUID_RE.test(usuarioId)) return false;
  const r = unwrap(await db().from("google_conexiones").delete().eq("usuario_id", usuarioId).select("usuario_id"));
  return (r?.length ?? 0) > 0;
}

// ── Reuniones ───────────────────────────────────────────────────────────────

export interface NuevaReunion {
  codigo: string;
  tipo: TipoReunion;
  elementoId?: string | null;
  titulo: string;
  descripcion?: string | null;
  /** ISO. */
  inicio: string;
  fin: string;
  zona?: string;
  invitados?: Invitado[];
  origen?: OrigenReunion;
  organizadorId?: string | null;
  organizadorEmail?: string | null;
  googleCalendarId?: string | null;
  googleEventId?: string | null;
  googleEtag?: string | null;
  meetUrl?: string | null;
  enlaceGoogle?: string | null;
  creadoPor?: string | null;
}

/** Guarda una reunión. Lanza «reunion-ya-agendada» si la iniciativa ya tiene una vigente de ese tipo creada desde la app. */
export async function crearReunion(d: NuevaReunion): Promise<Reunion> {
  const r = await db().from("reuniones").insert({
    codigo: d.codigo, tipo: d.tipo, elemento_id: d.elementoId ?? null, titulo: d.titulo, descripcion: d.descripcion ?? null,
    inicio: d.inicio, fin: d.fin, zona: d.zona ?? "America/Guatemala", invitados: (d.invitados ?? []) as unknown as Json,
    origen: d.origen ?? "app", organizador_id: d.organizadorId ?? null, organizador_email: d.organizadorEmail ?? null,
    google_calendar_id: d.googleCalendarId ?? null, google_event_id: d.googleEventId ?? null, google_etag: d.googleEtag ?? null,
    meet_url: d.meetUrl ?? null, enlace_google: d.enlaceGoogle ?? null, creado_por: d.creadoPor ?? null,
  }).select("*").single();
  if (r.error) {
    if (r.error.code === PG.uniqueViolation && r.error.message.includes("reuniones_una_vigente_por_tipo")) throw new Error("reunion-ya-agendada");
    throw new DbError(r.error.code, r.error.message);
  }
  return aReunion(r.data);
}

export async function getReunion(id: string): Promise<Reunion | null> {
  if (!UUID_RE.test(id)) return null;
  const fila = unwrap(await db().from("reuniones").select("*").eq("id", id).maybeSingle());
  return fila ? aReunion(fila) : null;
}

/** Las reuniones vigentes de una iniciativa y tipo (puede haber más de una si además hay históricas o reconocidas en Google). */
export async function reunionesVigentesDe(codigo: string, tipo: TipoReunion): Promise<Reunion[]> {
  const filas = unwrap(await db().from("reuniones").select("*").eq("codigo", codigo).eq("tipo", tipo).eq("estado", "agendada").order("inicio")) ?? [];
  return filas.map(aReunion);
}

export interface CambiosReunion {
  titulo?: string;
  descripcion?: string | null;
  inicio?: string;
  fin?: string;
  zona?: string;
  invitados?: Invitado[];
  googleEtag?: string | null;
  meetUrl?: string | null;
  enlaceGoogle?: string | null;
}

export async function actualizarReunion(id: string, c: CambiosReunion): Promise<Reunion> {
  const cambios: TablesUpdate<"reuniones"> = { actualizado_at: ahora() };
  if (c.titulo !== undefined) cambios.titulo = c.titulo;
  if (c.descripcion !== undefined) cambios.descripcion = c.descripcion;
  if (c.inicio !== undefined) cambios.inicio = c.inicio;
  if (c.fin !== undefined) cambios.fin = c.fin;
  if (c.zona !== undefined) cambios.zona = c.zona;
  if (c.invitados !== undefined) cambios.invitados = c.invitados as unknown as Json;
  if (c.googleEtag !== undefined) cambios.google_etag = c.googleEtag;
  if (c.meetUrl !== undefined) cambios.meet_url = c.meetUrl;
  if (c.enlaceGoogle !== undefined) cambios.enlace_google = c.enlaceGoogle;
  const filas = UUID_RE.test(id) ? unwrap(await db().from("reuniones").update(cambios).eq("id", id).select("*")) ?? [] : [];
  if (!filas.length) throw new Error("reunion-no-encontrada");
  return aReunion(filas[0]);
}

/** La deja cancelada (no se borra: queda el rastro). La iniciativa vuelve a estar «sin agendar». Idempotente. */
export async function cancelarReunion(id: string): Promise<Reunion> {
  if (!UUID_RE.test(id)) throw new Error("reunion-no-encontrada");
  const ts = ahora();
  const filas = unwrap(await db().from("reuniones").update({ estado: "cancelada", cancelada_at: ts, actualizado_at: ts })
    .eq("id", id).eq("estado", "agendada").select("*")) ?? [];
  if (filas.length) return aReunion(filas[0]);
  const ya = await getReunion(id);
  if (!ya) throw new Error("reunion-no-encontrada");
  return ya;
}

/** Todas las reuniones vigentes, con la forma del calendario de siempre: lo que consume buildCalMap. */
export async function reunionesParaCalendario(): Promise<CalMeetingRaw[]> {
  const filas = await selectAll((a, b) => db().from("reuniones").select("*").eq("estado", "agendada").order("id").range(a, b));
  return aEntradasCalendario(filas.map(aReunion));
}

/** Las reuniones vigentes creadas desde la app para un elemento (a lo más una por tipo). */
export async function reunionesVigentesDeElemento(elementoId: string): Promise<Reunion[]> {
  if (!UUID_RE.test(elementoId)) return [];
  const filas = unwrap(await db().from("reuniones").select("*").eq("elemento_id", elementoId).eq("estado", "agendada").eq("origen", "app").order("inicio")) ?? [];
  return filas.map(aReunion);
}

// ── Importación del histórico del Apps Script ───────────────────────────────

/** Las llaves (iniciativa|tipo|inicio) de TODAS las reuniones guardadas, vigentes o no: para no importar dos veces lo mismo. */
export async function llavesReunionesGuardadas(): Promise<Set<string>> {
  const filas = await selectAll<{ codigo: string; tipo: string; inicio: string }>((a, b) => db().from("reuniones").select("codigo, tipo, inicio").order("id").range(a, b));
  return new Set(filas.map((f) => llaveReunion(f.codigo, f.tipo, f.inicio)));
}

/** Guarda reuniones del Apps Script (origen «apps-script», sin organizador ni evento de Google). Devuelve cuántas insertó. */
export async function insertarImportadas(lista: ReunionImportable[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < lista.length; i += 200) {
    const lote = lista.slice(i, i + 200).map((r) => ({
      codigo: r.codigo, tipo: r.tipo, titulo: `${r.codigo} ${r.tipo}`, inicio: r.inicio, fin: r.fin, zona: "America/Guatemala",
      invitados: [] as unknown as Json, estado: "agendada", origen: "apps-script" as const,
    }));
    n += (unwrap(await db().from("reuniones").insert(lote).select("id")) ?? []).length;
  }
  return n;
}
