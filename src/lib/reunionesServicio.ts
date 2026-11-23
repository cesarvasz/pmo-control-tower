// src/lib/reunionesServicio.ts
// SOLO SERVIDOR. Agenda la Meeting 1 / Meeting 2 de una iniciativa: valida, crea el evento en el Google Calendar del organizador
// (con Meet y correos) y lo guarda en la base. Si guardar falla después de crear el evento, el evento se borra (sin duplicados
// fantasma en Google). La AUTORIZACIÓN (¿puede este usuario agendar esta iniciativa?) la decide quien llama; aquí el organizador
// es siempre el usuario autenticado que se pasa, nunca un valor del cliente.

import { randomUUID } from "node:crypto";
import { accessTokenDe, actualizarEvento, borrarEvento, crearEvento, leerEventoActual, type DatosEvento, type RespuestaInvitado } from "@/lib/googleCalendar";
import { actualizarReunion, cancelarReunion, crearReunion, getConexion, getReunion, reunionesVigentesDe } from "@/lib/reuniones";
import type { Invitado, Reunion, TipoReunion } from "@/lib/reunionesRows";

export const ZONA_DEFECTO = "America/Guatemala";
const MAX_INVITADOS = 50;
const EMAIL_RE = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]+$/;

/** «IN-120 M1 · Nombre de la iniciativa». */
export const tituloReunion = (codigo: string, tipo: TipoReunion, nombre: string) => `${codigo} ${tipo} · ${nombre.trim()}`;

export interface PedidoReunion {
  codigo: string;
  tipo: TipoReunion;
  elementoId?: string | null;
  nombreIniciativa: string;
  descripcion?: string | null;
  inicio: string;
  fin: string;
  zona?: string;
  invitados: Invitado[];
}

export interface Organizador { uid: string; email: string }

/** Valida y normaliza; lanza «reunion-datos-invalidos» con el motivo en `cause`. Quita duplicados y al propio organizador. */
export function validarPedido(p: PedidoReunion, organizadorEmail: string): { datos: DatosEvento; invitados: Invitado[] } {
  const malo = (m: string) => Object.assign(new Error("reunion-datos-invalidos"), { cause: m });
  if (!/^IN-[0-9]+$/.test(p.codigo)) throw malo("codigo");
  if (p.tipo !== "M1" && p.tipo !== "M2") throw malo("tipo");
  if (!p.nombreIniciativa?.trim()) throw malo("nombre");
  const ini = Date.parse(p.inicio), fin = Date.parse(p.fin);
  if (!Number.isFinite(ini) || !Number.isFinite(fin)) throw malo("fechas");
  if (fin <= ini) throw malo("fin-antes-de-inicio");
  const zona = p.zona ?? ZONA_DEFECTO;
  try { new Intl.DateTimeFormat("en", { timeZone: zona }); } catch { throw malo("zona"); }

  const vistos = new Set<string>([organizadorEmail.toLowerCase()]);
  const invitados: Invitado[] = [];
  for (const i of p.invitados ?? []) {
    const email = String(i?.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw malo("invitado-email");
    if (vistos.has(email)) continue;
    vistos.add(email);
    invitados.push({ personaId: i.personaId ?? null, email, nombre: String(i.nombre ?? "").trim() });
  }
  if (invitados.length > MAX_INVITADOS) throw malo("demasiados-invitados");

  return {
    invitados,
    datos: {
      codigo: p.codigo, tipo: p.tipo, titulo: tituloReunion(p.codigo, p.tipo, p.nombreIniciativa), descripcion: p.descripcion ?? null,
      inicio: new Date(ini).toISOString(), fin: new Date(fin).toISOString(), zona, invitados,
    },
  };
}

/**
 * Agenda la reunión. Errores: «reunion-datos-invalidos», «reunion-ya-agendada», «google-no-conectado»,
 * «google-reconnect-required», «google-calendar-*».
 */
export async function agendarReunion(p: PedidoReunion, org: Organizador): Promise<Reunion> {
  const { datos, invitados } = validarPedido(p, org.email);

  if ((await reunionesVigentesDe(datos.codigo, datos.tipo)).some((r) => r.origen === "app")) throw new Error("reunion-ya-agendada");
  const conexion = await getConexion(org.uid);
  if (!conexion) throw new Error("google-no-conectado");
  if (conexion.estado === "reconectar") throw new Error("google-reconnect-required");

  const token = await accessTokenDe(org.uid);
  const evento = await crearEvento(token, datos, randomUUID());
  try {
    return await crearReunion({
      codigo: datos.codigo, tipo: datos.tipo, elementoId: p.elementoId ?? null, titulo: datos.titulo, descripcion: datos.descripcion,
      inicio: datos.inicio, fin: datos.fin, zona: datos.zona, invitados, origen: "app",
      organizadorId: org.uid, organizadorEmail: conexion.googleEmail, googleCalendarId: "primary", googleEventId: evento.id,
      googleEtag: evento.etag, meetUrl: evento.meetUrl, enlaceGoogle: evento.enlace, creadoPor: org.uid,
    });
  } catch (err) {
    // Se creó el evento pero no se pudo guardar (p. ej. otra persona agendó lo mismo a la vez): se deshace en Google.
    await borrarEvento(token, evento.id).catch((e) => console.error("[agendarReunion] no se pudo deshacer el evento", e instanceof Error ? e.message : "error"));
    throw err;
  }
}

// ── Reprogramar y cancelar ──────────────────────────────────────────────────
// El evento vive en el calendario de QUIEN LO ORGANIZÓ: solo esa persona (con su propio token) puede cambiarlo o cancelarlo.

export interface CambiosPedidos { inicio?: string; fin?: string; descripcion?: string | null; invitados?: Invitado[] }

/** La reunión vigente creada desde la app y organizada por `uid`; si no, «reunion-no-encontrada» / «reunion-no-es-tuya». */
async function propia(id: string, uid: string): Promise<Reunion> {
  const r = await getReunion(id);
  if (!r || r.estado !== "agendada" || r.origen !== "app" || !r.googleEventId) throw new Error("reunion-no-encontrada");
  if (r.organizadorId !== uid) throw new Error("reunion-no-es-tuya");
  return r;
}

/**
 * Cambia hora, invitados o descripción de la MISMA reunión (no crea otra). Si alguien la cambió antes directo en Google, no pisa:
 * pone la copia local al día y lanza «google-evento-cambiado» para que la persona vea lo nuevo y decida. Si el evento ya no existe
 * en Google, la deja cancelada y lanza «google-evento-no-existe».
 */
export async function reprogramarReunion(id: string, c: CambiosPedidos, org: Organizador): Promise<Reunion> {
  const r = await propia(id, org.uid);
  const inicio = c.inicio ?? r.inicio, fin = c.fin ?? r.fin;
  const { datos, invitados } = validarPedido({
    codigo: r.codigo, tipo: r.tipo, nombreIniciativa: r.titulo.replace(/^IN-\d+ M[12] · /, "") || r.titulo, inicio, fin, zona: r.zona,
    descripcion: c.descripcion === undefined ? r.descripcion : c.descripcion, invitados: c.invitados ?? r.invitados,
  }, org.email);

  const token = await accessTokenDe(org.uid);
  try {
    const e = await actualizarEvento(token, r.googleEventId!, r.googleEtag, {
      inicio: c.inicio ? datos.inicio : undefined, fin: c.fin ? datos.fin : undefined, zona: r.zona,
      descripcion: c.descripcion === undefined ? undefined : datos.descripcion ?? null, invitados: c.invitados ? invitados : undefined,
    });
    return await actualizarReunion(id, {
      inicio: datos.inicio, fin: datos.fin, descripcion: datos.descripcion, ...(c.invitados ? { invitados } : {}),
      googleEtag: e.etag, meetUrl: e.meetUrl ?? r.meetUrl, enlaceGoogle: e.enlace ?? r.enlaceGoogle,
    });
  } catch (err) {
    const cod = err instanceof Error ? err.message : "";
    if (cod === "google-evento-no-existe") await cancelarReunion(id);
    if (cod === "google-evento-cambiado") {
      const hoy = await leerEventoActual(token, r.googleEventId!).catch(() => null);
      if (!hoy || hoy.cancelado) await cancelarReunion(id);
      else await actualizarReunion(id, { googleEtag: hoy.etag, ...(hoy.inicio && hoy.fin ? { inicio: new Date(hoy.inicio).toISOString(), fin: new Date(hoy.fin).toISOString() } : {}) });
    }
    throw err;
  }
}

/** Cancela la reunión: borra el evento en Google (avisa a los invitados) y la deja «Sin agendar» en la app. Idempotente. */
export async function cancelarReunionAgendada(id: string, org: Organizador): Promise<Reunion> {
  const r = await propia(id, org.uid);
  const token = await accessTokenDe(org.uid);
  await borrarEvento(token, r.googleEventId!); // si ya no existía en Google, igual se cancela aquí
  return cancelarReunion(id);
}

/** Respuestas de los invitados, como las ve el organizador en Google. null = no se pudieron leer (sin conexión, evento borrado…). */
export interface RespuestasReunion { leidasAt: string; porInvitado: { email: string; nombre: string; respuesta: RespuestaInvitado }[] }

/**
 * Quién aceptó, rechazó o no ha respondido. Se lee del evento en el calendario del ORGANIZADOR (con su conexión guardada), así lo ve
 * cualquiera que pueda agendar, no solo quien la creó. Solo devuelve la respuesta de cada invitado, nada más del evento.
 */
export async function respuestasDeReunion(r: Reunion): Promise<RespuestasReunion | null> {
  if (r.estado !== "agendada" || !r.organizadorId || !r.googleEventId) return null;
  try {
    const hoy = await leerEventoActual(await accessTokenDe(r.organizadorId), r.googleEventId);
    if (!hoy || hoy.cancelado) return null;
    return {
      leidasAt: new Date().toISOString(),
      porInvitado: r.invitados.map((i) => ({ email: i.email, nombre: i.nombre, respuesta: hoy.respuestas[i.email.trim().toLowerCase()] ?? "sin-responder" })),
    };
  } catch {
    return null;
  }
}
