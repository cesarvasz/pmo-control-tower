// src/lib/googleCalendar.ts
// SOLO SERVIDOR. Cliente mínimo de la API de Google Calendar que actúa COMO el usuario (su refresh token del Vault): el evento
// se crea en su calendario primario, con Meet y con los correos de invitación que manda Google (sendUpdates=all).
// Todo recibe `fetchFn` para poder probarse sin red.

import { configGoogle } from "@/lib/googleOauth";
import { leerRefreshToken, marcarConexion } from "@/lib/reuniones";
import type { Invitado, TipoReunion } from "@/lib/reunionesRows";

const API = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
type FetchFn = typeof fetch;

// ── Cuerpo del evento (puro) ────────────────────────────────────────────────

export interface DatosEvento {
  codigo: string;
  tipo: TipoReunion;
  titulo: string;
  descripcion?: string | null;
  /** ISO con zona o UTC. */
  inicio: string;
  fin: string;
  zona: string;
  invitados: Invitado[];
}

/** El cuerpo de events.insert. `idMeet` identifica la creación de la sala (idempotente si se reintenta el mismo). */
export function cuerpoEvento(d: DatosEvento, idMeet: string): Record<string, unknown> {
  return {
    summary: d.titulo,
    ...(d.descripcion ? { description: d.descripcion } : {}),
    start: { dateTime: d.inicio, timeZone: d.zona },
    end: { dateTime: d.fin, timeZone: d.zona },
    attendees: d.invitados.map((i) => ({ email: i.email, ...(i.nombre ? { displayName: i.nombre } : {}) })),
    conferenceData: { createRequest: { requestId: idMeet, conferenceSolutionKey: { type: "hangoutsMeet" } } },
    guestsCanModify: false,
    // Marca privada: permite reconocer en Google qué evento es de qué iniciativa (sincronización, fase 8)
    extendedProperties: { private: { pmoCodigo: d.codigo, pmoTipo: d.tipo } },
  };
}

export interface EventoCreado { id: string; etag: string | null; enlace: string | null; meetUrl: string | null }

interface EventoGoogle {
  id?: string; etag?: string; htmlLink?: string; hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
}

/** Lo que nos interesa de la respuesta de Google. null = respuesta sin id (inservible). */
export function leerEvento(e: EventoGoogle | null): EventoCreado | null {
  if (!e?.id) return null;
  const video = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;
  return { id: e.id, etag: e.etag ?? null, enlace: e.htmlLink ?? null, meetUrl: e.hangoutLink ?? video ?? null };
}

// ── Access token ────────────────────────────────────────────────────────────

const cache = new Map<string, { token: string; hasta: number }>();

/**
 * Un access token vigente del usuario (se renueva con su refresh token; se guarda en memoria hasta poco antes de vencer).
 * «google-no-conectado»: no hay conexión. «google-reconnect-required»: Google ya no acepta el token → la conexión queda en «reconectar».
 */
export async function accessTokenDe(usuarioId: string, fetchFn: FetchFn = fetch, ahora = Date.now()): Promise<string> {
  const c = cache.get(usuarioId);
  if (c && c.hasta > ahora + 60_000) return c.token;
  const cfg = configGoogle();
  if (!cfg) throw new Error("google-no-configurado");
  const refresh = await leerRefreshToken(usuarioId);
  if (!refresh) throw new Error("google-no-conectado");
  const r = await fetchFn(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const j = (await r.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string } | null;
  if (!r.ok || !j?.access_token) {
    if (j?.error === "invalid_grant") {
      cache.delete(usuarioId);
      await marcarConexion(usuarioId, "reconectar", "Google ya no acepta el permiso (revocado, vencido o cambió la contraseña)");
      throw new Error("google-reconnect-required");
    }
    throw new Error("google-calendar-error");
  }
  cache.set(usuarioId, { token: j.access_token, hasta: ahora + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

export const olvidarAccessToken = (usuarioId: string) => { cache.delete(usuarioId); };

// ── Eventos ─────────────────────────────────────────────────────────────────

/** Traduce el fallo HTTP de Calendar a un código de error de la app (sin volcar el cuerpo de Google al cliente). */
function fallo(status: number): Error {
  if (status === 401) return new Error("google-reconnect-required");
  if (status === 403) return new Error("google-calendar-prohibido");
  if (status === 404 || status === 410) return new Error("google-evento-no-existe");
  if (status === 429) return new Error("google-calendar-saturado");
  return new Error("google-calendar-error");
}

/** Crea el evento en el calendario primario del usuario, con sala de Meet y correos a los invitados. */
export async function crearEvento(accessToken: string, d: DatosEvento, idMeet: string, fetchFn: FetchFn = fetch): Promise<EventoCreado> {
  const r = await fetchFn(`${API}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpoEvento(d, idMeet)),
  });
  if (!r.ok) throw fallo(r.status);
  const e = leerEvento((await r.json().catch(() => null)) as EventoGoogle | null);
  if (!e) throw new Error("google-calendar-error");
  return e;
}

/** Borra el evento (avisa a los invitados). Ya no existir cuenta como éxito. */
export async function borrarEvento(accessToken: string, eventId: string, fetchFn: FetchFn = fetch): Promise<void> {
  const r = await fetchFn(`${API}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok && r.status !== 404 && r.status !== 410) throw fallo(r.status);
}

// ── Libre / ocupado ─────────────────────────────────────────────────────────

export interface Ocupacion {
  /** Intervalos ocupados de las personas de las que Google sí devolvió datos (se mezclan: basta uno ocupado). */
  ocupados: { inicio: string; fin: string }[];
  /** Correos de los que no hay datos (otro dominio, sin permiso para ver su libre/ocupado, no existe…): se agenda igual, sin saber. */
  sinDatos: string[];
}

interface RespuestaFreeBusy { calendars?: Record<string, { busy?: { start?: string; end?: string }[]; errors?: unknown[] }> }

/** Interpreta la respuesta de freeBusy. Un calendario con `errors` cuenta como «sin datos», no como libre. */
export function leerFreeBusy(r: RespuestaFreeBusy | null, correos: string[]): Ocupacion {
  const ocupados: Ocupacion["ocupados"] = [], sinDatos: string[] = [];
  for (const correo of correos) {
    const c = r?.calendars?.[correo];
    if (!c || c.errors?.length) { sinDatos.push(correo); continue; }
    for (const b of c.busy ?? []) if (b.start && b.end) ocupados.push({ inicio: b.start, fin: b.end });
  }
  return { ocupados, sinDatos };
}

/** Máximo que aceptamos por consulta (Google admite más; esto evita pedidos desmedidos). */
export const MAX_CALENDARIOS = 50;

/** Libre/ocupado de «primary» (el organizador) y de los correos dados, entre dos instantes ISO. Los correos se consultan en minúscula. */
export async function consultarOcupacion(accessToken: string, desde: string, hasta: string, correos: string[], fetchFn: FetchFn = fetch): Promise<Ocupacion> {
  const lista = [...new Set(correos.map((c) => c.trim().toLowerCase()).filter(Boolean))].slice(0, MAX_CALENDARIOS);
  const r = await fetchFn(`${API}/freeBusy`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: desde, timeMax: hasta, items: [{ id: "primary" }, ...lista.map((id) => ({ id }))] }),
  });
  if (!r.ok) throw fallo(r.status);
  const j = (await r.json().catch(() => null)) as RespuestaFreeBusy | null;
  const propio = leerFreeBusy(j, ["primary"]);
  const otros = leerFreeBusy(j, lista);
  // Si ni el propio calendario responde, la consulta no sirve: mejor error que «todo libre».
  if (propio.sinDatos.length) throw new Error("google-calendar-error");
  return { ocupados: [...propio.ocupados, ...otros.ocupados], sinDatos: otros.sinDatos };
}

// ── Editar un evento con control de versión ─────────────────────────────────

export interface CambiosEvento {
  inicio?: string;
  fin?: string;
  zona?: string;
  descripcion?: string | null;
  /** La lista COMPLETA de invitados (reemplaza a la anterior). */
  invitados?: Invitado[];
}

/** El cuerpo de events.patch: solo lo que cambia. */
export function cuerpoCambios(c: CambiosEvento): Record<string, unknown> {
  const zona = c.zona ?? "America/Guatemala";
  return {
    ...(c.inicio ? { start: { dateTime: c.inicio, timeZone: zona } } : {}),
    ...(c.fin ? { end: { dateTime: c.fin, timeZone: zona } } : {}),
    ...(c.descripcion !== undefined ? { description: c.descripcion ?? "" } : {}),
    ...(c.invitados ? { attendees: c.invitados.map((i) => ({ email: i.email, ...(i.nombre ? { displayName: i.nombre } : {}) })) } : {}),
  };
}

/**
 * Modifica el evento SOLO si sigue en la versión que conocemos (If-Match con su etag): si alguien lo cambió en Google, no pisa
 * nada y lanza «google-evento-cambiado». Avisa a los invitados de la nueva hora.
 */
export async function actualizarEvento(accessToken: string, eventId: string, etag: string | null, c: CambiosEvento, fetchFn: FetchFn = fetch): Promise<EventoCreado> {
  const r = await fetchFn(`${API}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(etag ? { "If-Match": etag } : {}) },
    body: JSON.stringify(cuerpoCambios(c)),
  });
  if (r.status === 412) throw new Error("google-evento-cambiado");
  if (!r.ok) throw fallo(r.status);
  const e = leerEvento((await r.json().catch(() => null)) as EventoGoogle | null);
  if (!e) throw new Error("google-calendar-error");
  return e;
}

export interface EventoActual extends EventoCreado { inicio: string | null; fin: string | null; cancelado: boolean }

/** El evento tal como está hoy en Google (para ponerse al día cuando alguien lo cambió allá). null = ya no existe. */
export async function leerEventoActual(accessToken: string, eventId: string, fetchFn: FetchFn = fetch): Promise<EventoActual | null> {
  const r = await fetchFn(`${API}/calendars/primary/events/${encodeURIComponent(eventId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (r.status === 404 || r.status === 410) return null;
  if (!r.ok) throw fallo(r.status);
  const j = (await r.json().catch(() => null)) as (EventoGoogle & { start?: { dateTime?: string }; end?: { dateTime?: string }; status?: string }) | null;
  const e = leerEvento(j);
  if (!e || !j) throw new Error("google-calendar-error");
  return { ...e, inicio: j.start?.dateTime ?? null, fin: j.end?.dateTime ?? null, cancelado: j.status === "cancelled" };
}
