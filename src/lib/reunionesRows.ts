// src/lib/reunionesRows.ts
// Módulo PURO. Traduce las filas de Supabase de las reuniones agendadas (tablas reuniones y google_conexiones, ver
// supabase/migrations/20261116120000_google_calendar_reuniones.sql) a los tipos de la app. Lo usa lib/reuniones.ts (I/O);
// aquí solo va la traducción, y por eso aquí van los tests.
//
// La BD es la fuente de lectura del calendario del dashboard: `aEntradasCalendario` devuelve las reuniones con la MISMA forma
// que daba el Apps Script (CalMeetingRaw), para que buildCalMap y todo lo que lo usa no cambie.

import type { CalMeetingRaw } from "@/types";
import type { Tables } from "@/types/supabase";

export type TipoReunion = "M1" | "M2";
export type EstadoReunion = "agendada" | "cancelada";
/** De dónde salió la reunión: creada en la app · reconocida en el Google Calendar del PM · importada del Apps Script. */
export type OrigenReunion = "app" | "google" | "apps-script";
export type EstadoConexion = "activa" | "reconectar";

/** Una persona invitada, elegida del Directorio RH. */
export interface Invitado {
  personaId: string | null;
  email: string;
  nombre: string;
}

export interface Reunion {
  id: string;
  /** Ini ID de la iniciativa: «IN-158». */
  codigo: string;
  tipo: TipoReunion;
  elementoId: string | null;
  titulo: string;
  descripcion: string | null;
  /** ISO (UTC). */
  inicio: string;
  fin: string;
  /** Zona IANA con la que se eligió la hora. */
  zona: string;
  invitados: Invitado[];
  estado: EstadoReunion;
  origen: OrigenReunion;
  organizadorId: string | null;
  organizadorEmail: string | null;
  googleCalendarId: string | null;
  googleEventId: string | null;
  googleEtag: string | null;
  meetUrl: string | null;
  enlaceGoogle: string | null;
  canceladaAt: string | null;
}

/** Lo que la app sabe de la cuenta de Google conectada de un usuario. NUNCA incluye el token ni el id del secreto. */
export interface ConexionGoogle {
  usuarioId: string;
  googleEmail: string;
  estado: EstadoConexion;
  scopes: string[];
  ultimoError: string | null;
  conectadoAt: string;
}

/** timestamptz de PostgREST ("2026-11-20T16:00:00+00:00") → ISO de JS ("…:00.000Z"). */
const iso = (ts: string): string => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toISOString();
};

const esTipo = (v: string): v is TipoReunion => v === "M1" || v === "M2";

/** Lee el jsonb de invitados con tolerancia: lo que no tenga correo se descarta (no se podría invitar). */
export function invitadosDe(valor: unknown): Invitado[] {
  if (!Array.isArray(valor)) return [];
  const out: Invitado[] = [];
  for (const v of valor) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const email = typeof o.email === "string" ? o.email.trim().toLowerCase() : "";
    if (!email) continue;
    out.push({
      personaId: typeof o.personaId === "string" && o.personaId ? o.personaId : null,
      email,
      nombre: typeof o.nombre === "string" && o.nombre.trim() ? o.nombre.trim() : email,
    });
  }
  return out;
}

export function aReunion(r: Tables<"reuniones">): Reunion {
  return {
    id: r.id,
    codigo: r.codigo,
    tipo: esTipo(r.tipo) ? r.tipo : "M1",
    elementoId: r.elemento_id,
    titulo: r.titulo,
    descripcion: r.descripcion,
    inicio: iso(r.inicio),
    fin: iso(r.fin),
    zona: r.zona,
    invitados: invitadosDe(r.invitados),
    estado: r.estado === "cancelada" ? "cancelada" : "agendada",
    origen: r.origen === "google" || r.origen === "apps-script" ? r.origen : "app",
    organizadorId: r.organizador_id,
    organizadorEmail: r.organizador_email,
    googleCalendarId: r.google_calendar_id,
    googleEventId: r.google_event_id,
    googleEtag: r.google_etag,
    meetUrl: r.meet_url,
    enlaceGoogle: r.enlace_google,
    canceladaAt: r.cancelada_at ? iso(r.cancelada_at) : null,
  };
}

/** Las reuniones vigentes con la forma del calendario de siempre (codigo, meeting, inicio, fin): lo que consume buildCalMap.
 *  Las canceladas no cuentan: una iniciativa con la reunión cancelada vuelve a estar «sin agendar». */
export function aEntradasCalendario(reuniones: Reunion[]): CalMeetingRaw[] {
  return reuniones
    .filter((r) => r.estado === "agendada")
    .map((r) => ({ codigo: r.codigo, meeting: r.tipo, inicio: r.inicio, fin: r.fin }));
}

export function aConexion(r: Tables<"google_conexiones">): ConexionGoogle {
  return {
    usuarioId: r.usuario_id,
    googleEmail: r.google_email,
    estado: r.estado === "reconectar" ? "reconectar" : "activa",
    scopes: r.scopes,
    ultimoError: r.ultimo_error,
    conectadoAt: iso(r.conectado_at),
  };
}
