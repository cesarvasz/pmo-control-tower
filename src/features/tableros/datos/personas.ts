// SOLO SERVIDOR. Directorio de personas en Supabase (tabla personas).
// La importación toma el Directorio RH de la copia de Monday (monday_items), así que no depende
// de que Monday esté arriba; si se pide, primero refresca esa copia desde Monday.

import { getSupabaseAdmin, selectAll, unwrap } from "@/lib/supabase-admin";
import { leerBoardsEspejo } from "@/lib/mondayMirrorRead";
import { sincronizarBoard } from "@/lib/mondayMirrorSync";
import type { Json, Tables, TablesInsert } from "@/types/supabase";
import { ligarPorEmail, normalizarEmail, personaDesdeRh, type Persona } from "../dominio/personas";
import { validarDefinicionCampo, validarValorCampo, type CampoDirectorio, type TipoCampoDirectorio } from "../dominio/directorio-campos";
import { ErrorTablero } from "./errores";

function aPersona(r: Tables<"personas">): Persona {
  return {
    id: r.id,
    nombre: r.nombre,
    email: r.email,
    grupo: r.grupo,
    rol: r.rol,
    tld: r.tld,
    hrsMes: r.hrs_mes,
    activo: r.activo,
    appUserId: r.app_user_id,
    mondayItemId: r.monday_item_id,
  };
}

export interface PersonaConUsuario extends Persona {
  /** Correo del usuario de la app ligado (para mostrarlo). */
  usuarioEmail: string | null;
  /** Campos propios del directorio: { id del campo: valor }. */
  extra: Record<string, unknown>;
}

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export async function listarPersonas(): Promise<PersonaConUsuario[]> {
  const db = getSupabaseAdmin();
  const [filas, usuarios] = await Promise.all([
    selectAll<Tables<"personas">>((d, h) => db.from("personas").select("*").order("id").range(d, h)),
    selectAll<{ id: string; email: string }>((d, h) => db.from("app_users").select("id, email").order("id").range(d, h)),
  ]);
  const emailDe = new Map(usuarios.map((u) => [u.id, u.email]));
  return filas
    .map((r) => ({ ...aPersona(r), usuarioEmail: r.app_user_id ? emailDe.get(r.app_user_id) ?? null : null, extra: objeto(r.extra) }))
    .sort((a, b) => (a.grupo ?? "").localeCompare(b.grupo ?? "", "es") || a.nombre.localeCompare(b.nombre, "es"));
}

/** numeric de Postgres puede llegar como número o texto; null = vacío. */
function mismoNumero(a: number | string | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Number(a) === b;
}

export interface ResultadoImportacion {
  leidas: number;
  nuevas: number;
  actualizadas: number;
  desactivadas: number;
  ligadas: number;
  /** Aviso si no se pudo refrescar la copia desde Monday (se usó la que ya había). */
  aviso: string | null;
}

/** Importa (o vuelve a importar) el Directorio RH. Idempotente: casa por monday_item_id. */
export async function importarPersonasDesdeMonday(refrescar: boolean): Promise<ResultadoImportacion> {
  const rhId = process.env.MONDAY_RH_BOARD_ID;
  if (!rhId) throw new Error("Falta la variable de entorno MONDAY_RH_BOARD_ID");

  let aviso: string | null = null;
  if (refrescar) {
    try {
      await sincronizarBoard(rhId, "rh");
    } catch (e) {
      aviso = `No se pudo refrescar desde Monday (${e instanceof Error ? e.message : "error"}); se usó la última copia.`;
    }
  }

  const [board] = await leerBoardsEspejo([rhId]);
  if (!board) throw new Error("El Directorio RH no está en la copia de Monday. Corre primero la copia completa.");
  const importadas = board.items.map(personaDesdeRh);

  const db = getSupabaseAdmin();
  const [existentes, usuarios] = await Promise.all([
    selectAll<Tables<"personas">>((d, h) => db.from("personas").select("*").order("id").range(d, h)),
    selectAll<{ id: string; email: string }>((d, h) => db.from("app_users").select("id, email").order("id").range(d, h)),
  ]);
  const porMonday = new Map(existentes.filter((p) => p.monday_item_id).map((p) => [p.monday_item_id!, p]));
  const usuarioPorEmail = ligarPorEmail(importadas, usuarios);
  const ahora = new Date().toISOString();

  let nuevas = 0;
  let actualizadas = 0;
  let ligadas = 0;
  const filas: TablesInsert<"personas">[] = importadas.map((p) => {
    const previa = porMonday.get(p.mondayItemId!);
    const email = normalizarEmail(p.email);
    // La liga por correo se respeta si ya la habían puesto a mano y el correo no la encuentra.
    const appUserId = (email && usuarioPorEmail.get(email)) || previa?.app_user_id || null;
    if (appUserId) ligadas++;
    const fila = {
      nombre: p.nombre, email, grupo: p.grupo, rol: p.rol, tld: p.tld, hrs_mes: p.hrsMes,
      activo: p.activo, app_user_id: appUserId, monday_item_id: p.mondayItemId,
    };
    if (!previa) nuevas++;
    else if (
      previa.nombre !== fila.nombre || previa.email !== fila.email || previa.grupo !== fila.grupo || previa.rol !== fila.rol ||
      previa.tld !== fila.tld || !mismoNumero(previa.hrs_mes, fila.hrs_mes) ||
      previa.activo !== fila.activo || previa.app_user_id !== fila.app_user_id
    ) actualizadas++;
    return { ...fila, actualizado_at: ahora };
  });

  if (filas.length) unwrap(await db.from("personas").upsert(filas, { onConflict: "monday_item_id" }));

  // Las que ya no están en el Directorio RH quedan inactivas (no se borran: pueden estar en tableros).
  const vigentes = new Set(importadas.map((p) => p.mondayItemId));
  const salen = existentes.filter((p) => p.monday_item_id && !vigentes.has(p.monday_item_id) && p.activo).map((p) => p.id);
  if (salen.length) unwrap(await db.from("personas").update({ activo: false, actualizado_at: ahora }).in("id", salen));

  return { leidas: importadas.length, nuevas, actualizadas, desactivadas: salen.length, ligadas, aviso };
}

/** Liga (o desliga, con null) una persona a un usuario de la app a mano. */
export async function ligarPersona(personaId: string, appUserId: string | null): Promise<void> {
  const db = getSupabaseAdmin();
  const ahora = new Date().toISOString();
  // Un usuario solo puede estar ligado a una persona: se suelta de cualquier otra.
  if (appUserId) unwrap(await db.from("personas").update({ app_user_id: null, actualizado_at: ahora }).eq("app_user_id", appUserId).neq("id", personaId));
  const r = unwrap(await db.from("personas").update({ app_user_id: appUserId, actualizado_at: ahora }).eq("id", personaId).select("id"));
  if (!r?.length) throw new Error("persona-no-encontrada");
}

export async function listarUsuariosApp(): Promise<{ id: string; email: string; nombre: string }[]> {
  const db = getSupabaseAdmin();
  const filas = await selectAll<{ id: string; email: string; display_name: string }>((d, h) =>
    db.from("app_users").select("id, email, display_name").order("id").range(d, h));
  return filas.map((u) => ({ id: u.id, email: u.email, nombre: u.display_name || u.email })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

// ── Campos propios del directorio ───────────────────────────────────────────
// Se agregan en la app (la sincronización con el Directorio RH no los toca: solo escribe los
// campos fijos). Sus valores viven en personas.extra.

function aCampo(r: Tables<"directorio_campos">): CampoDirectorio {
  const opciones = Array.isArray(r.opciones) ? r.opciones.filter((o): o is string => typeof o === "string") : [];
  return { id: r.id, titulo: r.titulo, tipo: r.tipo as TipoCampoDirectorio, opciones, orden: r.orden };
}

/** Los campos propios vigentes, en orden. */
export async function listarCamposDirectorio(): Promise<CampoDirectorio[]> {
  const filas = unwrap(await getSupabaseAdmin().from("directorio_campos").select("*").is("archivado_at", null).order("orden").order("creado_at")) ?? [];
  return filas.map(aCampo);
}

/** Agrega un campo al directorio (al final). */
export async function crearCampoDirectorio(d: { titulo?: unknown; tipo?: unknown; opciones?: unknown }, autor: string): Promise<CampoDirectorio> {
  const existentes = await listarCamposDirectorio();
  const v = validarDefinicionCampo(d, existentes);
  if ("error" in v) throw new ErrorTablero(400, v.error);
  const orden = existentes.reduce((m, c) => Math.max(m, c.orden + 1), 0);
  const fila = unwrap(await getSupabaseAdmin().from("directorio_campos")
    .insert({ titulo: v.titulo, tipo: v.tipo, opciones: v.opciones as Json, orden, creado_por: autor }).select("*").single());
  return aCampo(fila!);
}

/** Cambia el título o las opciones de un campo. El tipo no cambia (los valores ya guardados dejarían de servir). */
export async function editarCampoDirectorio(campoId: string, d: { titulo?: unknown; opciones?: unknown }): Promise<CampoDirectorio> {
  const existentes = await listarCamposDirectorio();
  const c = existentes.find((x) => x.id === campoId);
  if (!c) throw new ErrorTablero(404, "El campo ya no existe");
  const v = validarDefinicionCampo({ titulo: d.titulo ?? c.titulo, tipo: c.tipo, opciones: d.opciones ?? c.opciones }, existentes, c.id);
  if ("error" in v) throw new ErrorTablero(400, v.error);
  const fila = unwrap(await getSupabaseAdmin().from("directorio_campos")
    .update({ titulo: v.titulo, opciones: v.opciones as Json }).eq("id", campoId).select("*").single());
  return aCampo(fila!);
}

/** Quita un campo (se archiva; sus valores se quedan guardados por si se vuelve a necesitar). */
export async function archivarCampoDirectorio(campoId: string): Promise<void> {
  const r = unwrap(await getSupabaseAdmin().from("directorio_campos").update({ archivado_at: new Date().toISOString() })
    .eq("id", campoId).is("archivado_at", null).select("id"));
  if (!r?.length) throw new ErrorTablero(404, "El campo ya no existe");
}

/** Guarda el valor de un campo propio para una persona (vacío = se borra). */
export async function guardarValorCampo(personaId: string, campoId: string, valor: unknown): Promise<unknown> {
  const db = getSupabaseAdmin();
  const campo = (await listarCamposDirectorio()).find((c) => c.id === campoId);
  if (!campo) throw new ErrorTablero(404, "El campo ya no existe");
  let limpio: string | number | null;
  try { limpio = validarValorCampo(campo, valor); }
  catch (e) { throw new ErrorTablero(400, e instanceof Error ? e.message : "Valor no válido"); }
  const p = unwrap(await db.from("personas").select("extra").eq("id", personaId).maybeSingle());
  if (!p) throw new ErrorTablero(404, "La persona ya no existe");
  const extra = { ...objeto(p.extra) };
  if (limpio === null) delete extra[campoId];
  else extra[campoId] = limpio;
  unwrap(await db.from("personas").update({ extra: extra as Json, actualizado_at: new Date().toISOString() }).eq("id", personaId));
  return limpio;
}
