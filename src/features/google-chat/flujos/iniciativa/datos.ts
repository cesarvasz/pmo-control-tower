// SOLO SERVIDOR. Flujo «Nueva iniciativa»: crea Iniciativas en el tablero oficial con la MISMA operación que el pop-up
// «Nueva iniciativa» de la app (elemento.crear), pero con las reglas del bot (decididas por el PMO, 2026-11-24):
//  · La crean los CKU del Directorio RH y los Admin (no hace falta cuenta en la app: casi ningún CKU la tiene). El bot
//    actúa por ellos con acceso de sistema; el historial y la bitácora quedan con su correo y su nombre.
//  · Se pide: Nombre y Descripción (obligatorios) y Beneficio $ (opcional). Proceso no se pide.
//  · CKU = quien escribe. PM y Estrategia quedan vacíos: los asigna el PMO después.
//  · La Descripción es la primera entrada de la bitácora de la iniciativa.
//  · Los archivos que le mandan al bot en el chat se pegan a la bitácora de la iniciativa que elijan (adjuntarArchivos).

import { getSupabaseAdmin, unwrap } from "@/lib/supabase-admin";
import { aColumna, aElemento, aGrupo, leerTableroFila, type Acceso } from "@/features/tableros/datos/tableros";
import { adjuntarAComentario, ejecutarOperacion, type Actor } from "@/features/tableros/datos/operaciones";
import { tableroDeIniciativas } from "@/features/tableros/datos/iniciativas-app";
import { ErrorTablero } from "@/features/tableros/datos/errores";
import { textoCelda, type Columna, type Tablero } from "@/features/tableros/dominio/tablero";
import { grupoInicialId, valoresDeAlta } from "@/features/tableros/dominio/formulario-alta";
import { columnasNuevaIni } from "@/features/tableros/dominio/nueva-iniciativa";
import { MAX_ADJUNTOS_COMENTARIO, MAX_COMENTARIO } from "@/features/tableros/dominio/bitacora";
import { AvisoChat, type AdjuntoChat, type UsuarioChat } from "../../nucleo/flujo";
import { rolDeSaludo } from "../../nucleo/menu";
import { ArchivoMuyGrande, descargarAdjunto } from "../../nucleo/chat-api";
import { MAX_OPCIONES, valoresDeTablero, type CampoChat, type Leidos, type Opcion } from "../../nucleo/formulario";

/** Campos del formulario que no son columnas del tablero. */
export const CAMPO_NOMBRE = "nombre";
export const CAMPO_DESCRIPCION = "descripcion";

/** El bot crea por el CKU aunque su rol de la app no tenga Gestión de Iniciativas: la puerta es la del bot (puedeCrearIniciativas). */
const ACCESO_BOT: Acceso = { usuario: { rolId: "admin", esAdmin: true, personaId: null }, reglas: [] };

/** Los archivos que se pegan de un mensaje (igual que el límite de la bitácora por comentario). */
export const MAX_ARCHIVOS_MENSAJE = MAX_ADJUNTOS_COMENTARIO;
const MAX_ARCHIVO = 50 * 1024 * 1024;

export interface ContextoIniciativa {
  usuario: UsuarioChat;
  tablero: Tablero;
  grupoId: string;
  columnas: Columna[];
  /** Los campos del formulario, en orden. */
  campos: CampoChat[];
  /** El CKU (persona del Directorio de quien escribe); null = no está en el Directorio (un Admin): queda vacío. */
  cku: { id: string; nombre: string } | null;
}

/** ¿Puede crear iniciativas? CKU en el Directorio RH, o Admin de la app. */
export function puedeCrearIniciativas(u: UsuarioChat): boolean {
  return u.esAdmin || rolDeSaludo(false, u.persona?.rol) === "CKU";
}

/** Quién queda en el historial y la bitácora: su cuenta si tiene; si no, su correo y su nombre del Directorio. */
export function actorDe(u: UsuarioChat): Actor {
  return { uid: u.me?.uid ?? null, email: u.email, displayName: u.nombre, permissions: u.me?.permissions ?? { pages: {}, actions: {}, groups: {} } };
}

const opcionesDeDropdown = (c: Columna): Opcion[] =>
  ((c.config as { opciones?: { id: string; texto: string }[] } | null)?.opciones ?? []).map((o) => ({ valor: o.id, texto: o.texto }));

/** Un campo opcional que es columna del tablero (Beneficio $). */
function campoOpcional(c: Columna, etiqueta: string): CampoChat | null {
  const base = { nombre: c.id, etiqueta, seccion: "despues" as const, obligatorio: false };
  if (c.tipo === "numero") return { ...base, tipo: "numero" };
  if (c.tipo === "dropdown") {
    const opciones = opcionesDeDropdown(c);
    if (!opciones.length) return null;
    // Google Chat no muestra más de 100 opciones; si se llega ahí hace falta una lista con búsqueda.
    if (opciones.length > MAX_OPCIONES) throw new AvisoChat(`${etiqueta} tiene más de ${MAX_OPCIONES} opciones y Google Chat no las puede mostrar. Avísale al PMO.`);
    return { ...base, tipo: "lista", opciones };
  }
  return { ...base, tipo: "texto" };
}

async function tableroYColumnas(): Promise<{ tablero: Tablero; columnas: Columna[]; grupoId: string }> {
  const tableroId = await tableroDeIniciativas();
  const tablero = tableroId ? await leerTableroFila(tableroId) : null;
  if (!tablero) throw new AvisoChat("No encontré el tablero de Iniciativas. Avísale al PMO.");
  const db = getSupabaseAdmin();
  const [filasCol, filasGrupo] = await Promise.all([
    db.from("tablero_columnas").select("*").eq("tablero_id", tablero.id).is("archivada_at", null).order("orden"),
    db.from("tablero_grupos").select("*").eq("tablero_id", tablero.id).is("archivado_at", null).order("orden"),
  ]);
  const columnas = (unwrap(filasCol) ?? []).map(aColumna);
  const grupoId = grupoInicialId(tablero.categoria, (unwrap(filasGrupo) ?? []).map(aGrupo));
  if (!grupoId) throw new AvisoChat("El tablero de Iniciativas no tiene grupos. Avísale al PMO.");
  return { tablero, columnas, grupoId };
}

/** El tablero y los campos del formulario. Lanza AvisoChat si no puede crear iniciativas. */
export async function contextoIniciativa(u: UsuarioChat): Promise<ContextoIniciativa> {
  if (!puedeCrearIniciativas(u)) throw new AvisoChat("Solo los CKU y los Admin pueden crear iniciativas desde aquí.");
  const { tablero, columnas, grupoId } = await tableroYColumnas();
  const k = columnasNuevaIni(columnas);
  const campos: CampoChat[] = [
    { nombre: CAMPO_NOMBRE, etiqueta: "Nombre de la iniciativa", tipo: "texto", obligatorio: true, seccion: "datos" },
    { nombre: CAMPO_DESCRIPCION, etiqueta: "Descripción", tipo: "parrafo", obligatorio: true, seccion: "datos", ayuda: "Qué se quiere lograr, para quién y por qué. Queda en la bitácora de la iniciativa." },
  ];
  const beneficio = k.beneficio ? campoOpcional(k.beneficio, "Beneficio $") : null;
  if (beneficio) campos.push(beneficio);
  const cku = u.persona ? { id: u.persona.id, nombre: u.persona.nombre } : null;
  return { usuario: u, tablero, grupoId, columnas, campos, cku };
}

/** Crea la iniciativa (status New, grupo Nuevas Iniciativas, CKU = quien escribe) y su primera entrada de bitácora con la
 *  Descripción. Devuelve su Ini ID y nombre; `sinDescripcion` = se creó pero la bitácora falló. */
export async function crearIniciativa(ctx: ContextoIniciativa, leidos: Leidos): Promise<{ id: string; iniId: string; nombre: string; sinDescripcion: boolean }> {
  const k = columnasNuevaIni(ctx.columnas);
  const deTablero = ctx.campos.filter((c) => c.nombre !== CAMPO_NOMBRE && c.nombre !== CAMPO_DESCRIPCION);
  const valores: Record<string, unknown> = { ...valoresDeAlta(ctx.tablero.categoria, ctx.columnas), ...valoresDeTablero(deTablero, leidos) };
  if (k.cku && ctx.cku) valores[k.cku.id] = [ctx.cku.id];
  const actor = actorDe(ctx.usuario);
  const nombre = leidos[CAMPO_NOMBRE];
  let id: string;
  try {
    id = ((await ejecutarOperacion(actor, ACCESO_BOT, ctx.tablero, { op: "elemento.crear", grupoId: ctx.grupoId, nombre, valores })) as { id: string }).id;
  } catch (e) {
    if (e instanceof ErrorTablero) throw new AvisoChat(e.message);
    throw e;
  }
  let sinDescripcion = false;
  try {
    await ejecutarOperacion(actor, ACCESO_BOT, ctx.tablero, { op: "comentario.crear", elementoId: id, texto: leidos[CAMPO_DESCRIPCION].slice(0, MAX_COMENTARIO) });
  } catch (e) {
    console.error("[google-chat] la iniciativa se creó pero no su descripción", e);
    sinDescripcion = true;
  }
  const fila = unwrap(await getSupabaseAdmin().from("elementos").select("*").eq("id", id).maybeSingle());
  const iniId = fila && k.iniId ? textoCelda(k.iniId, aElemento(fila).valores[k.iniId.id]) : "";
  return { id, iniId, nombre, sinDescripcion };
}

export interface IniciativaCorta { id: string; titulo: string }

/** Las iniciativas a las que esta persona puede pegar archivos: las que creó o en cuya bitácora escribió (las más
 *  recientes primero, hasta `max`). */
export async function iniciativasParaAdjuntar(u: UsuarioChat, max = 5): Promise<IniciativaCorta[]> {
  const { tablero, columnas } = await tableroYColumnas();
  const db = getSupabaseAdmin();
  const [creadas, comentadas] = await Promise.all([
    db.from("tablero_historial").select("elemento_id, creado_at").eq("tablero_id", tablero.id).eq("campo", "creado")
      .eq("usuario_email", u.email).order("creado_at", { ascending: false }).limit(30),
    db.from("elemento_comentarios").select("elemento_id, creado_at").eq("tablero_id", tablero.id).eq("autor_email", u.email)
      .is("borrado_at", null).order("creado_at", { ascending: false }).limit(30),
  ]);
  const recientes = [...(unwrap(creadas) ?? []), ...(unwrap(comentadas) ?? [])]
    .filter((x): x is { elemento_id: string; creado_at: string } => !!x.elemento_id)
    .sort((a, b) => b.creado_at.localeCompare(a.creado_at));
  const ids = [...new Set(recientes.map((x) => x.elemento_id))];
  if (!ids.length) return [];
  const filas = unwrap(await db.from("elementos").select("*").in("id", ids).is("parent_id", null).is("archivado_at", null)) ?? [];
  const iniId = columnasNuevaIni(columnas).iniId;
  const porId = new Map(filas.map((f) => [f.id, aElemento(f)]));
  return ids.flatMap((id) => {
    const e = porId.get(id);
    if (!e) return [];
    const codigo = iniId ? textoCelda(iniId, e.valores[iniId.id]) : "";
    return [{ id, titulo: codigo ? `${codigo} · ${e.nombre}` : e.nombre }];
  }).slice(0, max);
}

export interface ResultadoAdjuntos {
  guardados: string[];
  enlazados: string[];
  fallidos: { nombre: string; motivo: string }[];
}

/** Pega los archivos de un mensaje a la bitácora de la iniciativa: una entrada «📎 Archivos enviados desde Google Chat» (con
 *  los enlaces de los que son de Drive) y los subidos descargados de Chat como adjuntos de esa entrada. */
export async function adjuntarArchivos(u: UsuarioChat, iniciativa: IniciativaCorta, adjuntos: AdjuntoChat[]): Promise<ResultadoAdjuntos> {
  const { tablero } = await tableroYColumnas();
  const actor = actorDe(u);
  const res: ResultadoAdjuntos = { guardados: [], enlazados: [], fallidos: [] };
  const lista = adjuntos.slice(0, MAX_ARCHIVOS_MENSAJE);
  for (const a of adjuntos.slice(MAX_ARCHIVOS_MENSAJE)) res.fallidos.push({ nombre: a.nombre, motivo: `solo se guardan ${MAX_ARCHIVOS_MENSAJE} por mensaje` });

  const drive = lista.filter((a) => a.origen === "drive" && a.driveId);
  const texto = ["📎 Archivos enviados desde Google Chat", ...drive.map((a) => `• ${a.nombre}: https://drive.google.com/open?id=${a.driveId}`)].join("\n");
  const { id: comentarioId } = (await ejecutarOperacion(actor, ACCESO_BOT, tablero, { op: "comentario.crear", elementoId: iniciativa.id, texto })) as { id: string };
  res.enlazados = drive.map((a) => a.nombre);

  for (const a of lista.filter((x) => x.origen === "subido" && x.recursoDatos)) {
    try {
      const datos = await descargarAdjunto(a.recursoDatos!, MAX_ARCHIVO);
      await adjuntarAComentario(actor, ACCESO_BOT, tablero, { comentarioId, nombre: a.nombre, tipoMime: a.tipoMime, datos });
      res.guardados.push(a.nombre);
    } catch (e) {
      if (!(e instanceof ArchivoMuyGrande) && !(e instanceof ErrorTablero)) console.error("[google-chat] adjunto", a.nombre, e);
      res.fallidos.push({ nombre: a.nombre, motivo: e instanceof ArchivoMuyGrande ? "pasa de 50 MB" : e instanceof ErrorTablero ? e.message : "no se pudo descargar" });
    }
  }
  // Si no quedó nada, la entrada vacía sobra.
  if (!res.guardados.length && !res.enlazados.length) {
    await ejecutarOperacion(actor, ACCESO_BOT, tablero, { op: "comentario.borrar", comentarioId }).catch(() => {});
  }
  return res;
}
