// SOLO SERVIDOR. Sincronización con Monday (Fase 5, convivencia): aplica a la base el plan de
// dominio/sincronizar.ts para un tablero, y corre la sincronización COMPLETA (copia de Monday →
// directorio → cada tablero en orden → bitácora y archivos → comparación) POR PASOS
// (dominio/sincronizar-pasos.ts), dejando registro en tablero_sincronizaciones. Solo puede haber una
// corrida a la vez, y solo una llamada la avanza a la vez (candado).

import { randomUUID } from "node:crypto";
import { enTrozos, getSupabaseAdmin, PG, selectAll, unwrap } from "@/lib/supabase-admin";
import type { AppUser } from "@/lib/permissions";
import type { Json, Tables, TablesUpdate } from "@/types/supabase";
import { abrirCopia, boardsACopiar, cerrarCopia, copiarBoards, fallarCopia, sincronizarBoard } from "@/lib/mondayMirrorSync";
import type { TipoBoard } from "@/lib/mondayMirror";
import { filaIgual } from "../dominio/paridad";
import {
  decidirTick, describirPaso, HORAS_MAX_CORRIDA, MAX_INTENTOS_POR_PASO, pasoCritico, pasosDeCopia, pasosDeTableros, type Paso, type PasoEnCola,
} from "../dominio/sincronizar-pasos";
import { mismoValor, planSincronizacion, planVacio, type ColumnaActual, type ElementoActual, type GrupoActual } from "../dominio/sincronizar";
import { aColumna, leerTablero, type Acceso } from "./tableros";
import { compararConMonday, definicionDesdeLaCopia, importarBoard, listarBoardsImportables, nombreYCodigo } from "./importar";
import { traerBitacoraYArchivos } from "./importar-extras";
import { importarPersonasDesdeMonday } from "./personas";
import { ErrorTablero } from "./errores";

/** Quién firma lo que entra de Monday (historial) y lo que la sincronización crea. */
export const AUTOR_SINCRONIZACION = "Monday (sincronización)";
const SISTEMA: AppUser = {
  uid: "00000000-0000-4000-8000-0000000005c0", email: AUTOR_SINCRONIZACION, displayName: AUTOR_SINCRONIZACION,
  roleId: "admin", roleName: "Admin", permissions: { pages: {}, actions: { manage_roles: true }, groups: {} }, defaultPage: null,
};
const ACCESO_SISTEMA: Acceso = { usuario: { rolId: "admin", esAdmin: true, personaId: null }, reglas: [] };

// ── Un tablero ───────────────────────────────────────────────────────────────

export interface ResultadoTablero {
  creados: number;
  actualizados: number;
  valores: number;
  archivados: number;
  restaurados: number;
  /** El board se renombró en Monday: el nombre nuevo. */
  renombrado?: string;
  gruposNuevos: string[];
  columnasNuevas: string[];
  etiquetasNuevas: string[];
  columnasFueraDeMonday: string[];
  personasNoEncontradas: string[];
}

/** En paralelo de a `n` (para muchas actualizaciones sueltas). */
async function deA<T>(lista: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => { while (i < lista.length) await fn(lista[i++]); }));
}

/** Trae lo que hay hoy en la copia de Monday a un tablero ya importado, sin rehacerlo.
 *  Con `simular`, solo dice qué cambiaría (no escribe nada). */
export async function sincronizarTablero(tableroId: string, opciones: { simular?: boolean } = {}): Promise<ResultadoTablero & { muestra?: string[] }> {
  const db = getSupabaseAdmin();
  const t = unwrap(await db.from("tableros").select("id, nombre, codigo, monday_board_id, sincroniza_monday").eq("id", tableroId).is("archivado_at", null).maybeSingle());
  if (!t?.monday_board_id) throw new ErrorTablero(400, "Este tablero no viene de Monday");
  if (!t.sincroniza_monday) throw new ErrorTablero(409, "Este tablero ya no se sincroniza con Monday");

  const [copia, grupos, columnas, elementos] = await Promise.all([
    definicionDesdeLaCopia(t.monday_board_id),
    unwrap(await db.from("tablero_grupos").select("*").eq("tablero_id", tableroId)) ?? [],
    unwrap(await db.from("tablero_columnas").select("*").eq("tablero_id", tableroId)) ?? [],
    selectAll<Tables<"elementos">>((d, h) => db.from("elementos").select("*").eq("tablero_id", tableroId).order("id").range(d, h)),
  ]);

  const textos = new Map(copia.filas.map((f) => [f.id, f.column_values]));
  const plan = planSincronizacion({
    actual: {
      grupos: grupos.map((g): GrupoActual => ({ id: g.id, titulo: g.titulo, orden: g.orden, mondayGrupo: g.monday_group_id, archivado: !!g.archivado_at })),
      columnas: columnas.map((c): ColumnaActual => ({ ...aColumna(c), archivada: !!c.archivada_at })),
      elementos: elementos.map((e): ElementoActual => ({
        id: e.id, grupoId: e.grupo_id, parentId: e.parent_id, nombre: e.nombre, orden: e.orden, mondayItemId: e.monday_item_id, archivado: !!e.archivado_at,
        valores: (e.valores && typeof e.valores === "object" && !Array.isArray(e.valores) ? e.valores : {}) as Record<string, unknown>,
      })),
    },
    monday: copia.definicion,
    textoMonday: (item, col) => { const v = textos.get(item)?.find((x) => x.id === col); return v ? (v.display_value ?? "") || (v.text ?? "") || null : null; },
    ctx: { personaPorNombre: copia.personaPorNombre },
    nuevoId: randomUUID,
  });

  const res: ResultadoTablero = {
    creados: plan.elementosNuevos.length, actualizados: plan.elementosCambiados.length,
    valores: plan.elementosCambiados.reduce((n, c) => n + c.cambios.length, 0),
    archivados: plan.archivar.length, restaurados: plan.restaurar.length,
    gruposNuevos: plan.gruposNuevos.map((g) => g.titulo), columnasNuevas: plan.columnasNuevas.map((c) => c.titulo),
    etiquetasNuevas: plan.configs.flatMap((c) => c.agregadas.map((a) => `${c.titulo}: ${a}`)),
    columnasFueraDeMonday: plan.columnasFueraDeMonday, personasNoEncontradas: copia.personasNoEncontradas,
  };
  // El nombre y el código del tablero también vienen de Monday (identifican al proyecto en las métricas).
  const nc = nombreYCodigo(copia.board.nombre, copia.board.tipo);
  const renombrar = nc.nombre !== t.nombre || nc.codigo !== t.codigo;
  if (renombrar) res.renombrado = copia.board.nombre;
  if (opciones.simular) {
    const nombreCol = new Map(columnas.map((c) => [c.id, c.titulo]));
    const nombreEl = new Map(elementos.map((e) => [e.id, e.nombre]));
    const muestra = [
      ...plan.elementosNuevos.map((e) => `nuevo: ${e.nombre}`),
      ...plan.elementosCambiados.flatMap((c) => [
        ...(c.nombre !== undefined ? [`nombre: ${c.antes.nombre} → ${c.nombre}`] : []),
        ...(c.grupoId !== undefined ? [`movido: ${nombreEl.get(c.id)}`] : []),
        ...c.cambios.map((v) => `${nombreEl.get(c.id)} · ${nombreCol.get(v.columnaId) ?? v.columnaId}: ${JSON.stringify(v.antes)} → ${JSON.stringify(v.despues)}`),
      ]),
      ...plan.archivar.map((id) => `archivar: ${nombreEl.get(id)}`),
      ...plan.restaurar.map((id) => `restaurar: ${nombreEl.get(id)}`),
    ];
    return { ...res, muestra };
  }
  if (renombrar) {
    unwrap(await db.from("tableros").update({ nombre: nc.nombre, codigo: nc.codigo, actualizado_at: new Date().toISOString() }).eq("id", tableroId));
    unwrap(await db.from("tablero_historial").insert({
      tablero_id: tableroId, elemento_id: null, campo: "tablero", antes: { nombre: t.nombre, codigo: t.codigo }, despues: nc, usuario_email: AUTOR_SINCRONIZACION,
    }));
  }
  if (planVacio(plan)) return res;

  const ahora = new Date().toISOString();
  const historial: { tablero_id: string; elemento_id: string | null; columna_id?: string | null; campo: string; antes: Json; despues: Json; usuario_email: string }[] = [];
  const anotar = (elementoId: string, campo: string, antes: unknown, despues: unknown, columnaId: string | null = null) =>
    historial.push({ tablero_id: tableroId, elemento_id: elementoId, columna_id: columnaId, campo, antes: (antes ?? null) as Json, despues: (despues ?? null) as Json, usuario_email: AUTOR_SINCRONIZACION });

  // 1) Estructura que Monday agregó: grupos, columnas y etiquetas.
  if (plan.gruposNuevos.length) {
    unwrap(await db.from("tablero_grupos").insert(plan.gruposNuevos.map((g) => ({
      id: g.id, tablero_id: tableroId, titulo: g.titulo, color: g.color, fase: g.fase, orden: g.orden, monday_group_id: g.mondayGrupo,
    }))));
  }
  if (plan.columnasNuevas.length) {
    unwrap(await db.from("tablero_columnas").insert(plan.columnasNuevas.map((c) => ({
      id: c.id, tablero_id: tableroId, nivel: c.nivel, titulo: c.titulo, tipo: c.tipo, rol: null, config: c.config as Json,
      orden: c.orden, oculta: false, ancho: null, monday_column_id: c.mondayColumnId,
    }))));
  }
  for (const c of plan.configs) unwrap(await db.from("tablero_columnas").update({ config: c.config as Json }).eq("id", c.columnaId));

  // 2) Elementos nuevos (items antes que subelementos).
  const filasNuevas = plan.elementosNuevos.map((e) => ({
    id: e.id, tablero_id: tableroId, grupo_id: e.grupoId, parent_id: e.parentId, nombre: e.nombre, orden: e.orden,
    valores: e.valores as Json, monday_item_id: e.mondayItemId, creado_at: ahora, actualizado_at: ahora,
  }));
  for (const lote of enTrozos(filasNuevas.filter((f) => !f.parent_id), 500)) unwrap(await db.from("elementos").insert(lote));
  for (const lote of enTrozos(filasNuevas.filter((f) => f.parent_id), 500)) unwrap(await db.from("elementos").insert(lote));
  for (const e of plan.elementosNuevos) anotar(e.id, "creado", null, { nombre: e.nombre, origen: "Monday" });

  // 3) Elementos que cambiaron en Monday.
  await deA(plan.elementosCambiados, 8, async (c) => {
    const cambios: Record<string, unknown> = { actualizado_at: ahora };
    if (c.nombre !== undefined) { cambios.nombre = c.nombre; anotar(c.id, "nombre", c.antes.nombre, c.nombre); }
    if (c.grupoId !== undefined) {
      Object.assign(cambios, { grupo_id: c.grupoId, parent_id: c.parentId, orden: c.orden });
      if (c.grupoId !== c.antes.grupoId) {
        const titulo = (id: string | null) => grupos.find((g) => g.id === id)?.titulo ?? plan.gruposNuevos.find((g) => g.id === id)?.titulo ?? null;
        anotar(c.id, "movido", titulo(c.antes.grupoId), titulo(c.grupoId));
      }
    }
    if (c.valores) {
      cambios.valores = c.valores;
      for (const v of c.cambios) if (!mismoValor(v.antes, v.despues)) anotar(c.id, "valor", v.antes, v.despues, v.columnaId);
    }
    unwrap(await db.from("elementos").update(cambios as never).eq("id", c.id));
  });

  // 4) Lo que ya no está en Monday se archiva (no se borra); lo que volvió, se restaura.
  for (const lote of enTrozos(plan.archivar, 200)) unwrap(await db.from("elementos").update({ archivado_at: ahora }).in("id", lote));
  for (const lote of enTrozos(plan.restaurar, 200)) unwrap(await db.from("elementos").update({ archivado_at: null }).in("id", lote));
  const nombreDe = new Map(elementos.map((e) => [e.id, e.nombre]));
  for (const id of plan.archivar) anotar(id, "archivado", null, { nombre: nombreDe.get(id), origen: "Monday" });
  for (const id of plan.restaurar) anotar(id, "restaurado", null, { nombre: nombreDe.get(id), origen: "Monday" });

  for (const lote of enTrozos(historial, 500)) unwrap(await db.from("tablero_historial").insert(lote));
  unwrap(await db.rpc("tablero_recalcular_responsables", { p_tablero: tableroId }));
  unwrap(await db.from("tableros").update({ actualizado_at: ahora }).eq("id", tableroId));
  return res;
}

/** Fase 6 (convivencia): tras escribir en Monday a un item (p. ej. su status desde /proyectos),
 *  copia SOLO ese board de Monday y lo trae a su tablero, para que la app lo vea al momento sin
 *  esperar la sincronización de cada hora. Unos segundos (un board). */
export async function sincronizarProyectoDeItem(itemId: string): Promise<ResultadoTablero> {
  const db = getSupabaseAdmin();
  const item = unwrap(await db.from("monday_items").select("board_id").eq("id", itemId).maybeSingle());
  if (!item) throw new ErrorTablero(404, "Ese item no está en la copia de Monday");
  const [board, t] = await Promise.all([
    db.from("monday_boards").select("tipo").eq("id", item.board_id).maybeSingle().then(unwrap),
    db.from("tableros").select("id").eq("monday_board_id", item.board_id).is("archivado_at", null).eq("sincroniza_monday", true).maybeSingle().then(unwrap),
  ]);
  if (!board) throw new ErrorTablero(404, "Ese board no está en la copia de Monday");
  if (!t) throw new ErrorTablero(404, "Ese board no tiene un tablero que se sincronice con Monday");
  await sincronizarBoard(item.board_id, board.tipo as TipoBoard);
  return sincronizarTablero(t.id);
}

// ── La corrida, por pasos ────────────────────────────────────────────────────
// La corrida se parte en pasos (dominio/sincronizar-pasos.ts) que se guardan en la corrida: cada
// llamada avanza los que le alcancen y la siguiente sigue donde quedó. Así corre igual en esta PC
// (todo de un jalón) que en Vercel (≤ 60 s por llamada, pg_cron llama cada minuto).

export interface ResultadoBoardCorrida {
  board: string;
  /** El board de Monday (liga los pasos de un mismo board). */
  boardId?: string;
  tipo: string;
  tableroId: string | null;
  importado?: boolean;
  omitido?: string;
  cambios?: ResultadoTablero;
  comentariosNuevos?: number;
  archivosNuevos?: number;
  /** Archivos que Monday ya no entrega (no es un error). */
  adjuntosSinTraer?: number;
  diferencias?: number;
  avisos?: number;
  /** Lo que tardaron sus pasos, en ms. */
  ms?: number;
  error?: string;
}

export interface ResumenCorrida {
  copia?: { ok: boolean; boards: number; errores: string[]; runId?: number };
  directorio?: { nuevas: number; actualizadas: number; desactivadas: number };
  boards: ResultadoBoardCorrida[];
  /** Lo que está haciendo (mientras corre). */
  enCurso?: string | null;
}

export type Origen = "manual" | "programada" | "nube";

const T = "tablero_sincronizaciones";
/** Cuánto dura el candado de quien avanza una corrida; se renueva en cada paso. Si la función se
 *  corta (Vercel a los 60 s, la PC se apaga), otra llamada retoma la corrida cuando vence. */
const CANDADO_MS = 3 * 60_000;

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const iso = (ms: number) => new Date(ms).toISOString();

/** Abre una corrida (el candado: si ya hay una en curso, 409). Devuelve su id. */
export async function iniciarCorrida(origen: Origen): Promise<number> {
  const db = getSupabaseAdmin();
  // Una corrida que se cortó (se cerró la PC, nadie la siguió…) no bloquea para siempre.
  unwrap(await db.from(T).update({ estado: "fallo", fin: iso(Date.now()), error: "Se cortó a medias (nadie la siguió)", pasos: [], trabajando_hasta: null })
    .eq("estado", "en_curso").lt("inicio", iso(Date.now() - HORAS_MAX_CORRIDA * 3600_000)));
  const pasos: PasoEnCola[] = [{ tipo: "descubrir" }];
  const r = await db.from(T).insert({ origen, pasos: pasos as unknown as Json, resumen: { boards: [] } as unknown as Json }).select("id").single();
  if (r.error?.code === PG.uniqueViolation) throw new ErrorTablero(409, "Ya hay una sincronización en curso");
  return unwrap(r)!.id;
}

const deBoard = (resumen: ResumenCorrida, boardId: string) => resumen.boards.find((b) => b.boardId === boardId);

/** Corre un paso: anota su resultado en `resumen` y devuelve los pasos nuevos que van al frente de la
 *  cola. Los pasos de un board no lanzan (el error queda en ese board); los críticos sí. */
async function ejecutarPaso(paso: Paso, resumen: ResumenCorrida): Promise<Paso[]> {
  const db = getSupabaseAdmin();
  switch (paso.tipo) {
    case "descubrir": {
      const runId = await abrirCopia("tableros");
      try {
        const objetivos = await boardsACopiar();
        resumen.copia = { ok: true, boards: 0, errores: [], runId };
        return pasosDeCopia(objetivos);
      } catch (e) {
        await fallarCopia(runId, mensaje(e));
        throw e;
      }
    }
    case "copiar": {
      const r = await copiarBoards(paso.boards);
      const copia = (resumen.copia ??= { ok: true, boards: 0, errores: [] });
      copia.boards += r.boards.length;
      copia.errores.push(...r.errores.map((e) => `${e.tipo} ${e.board_id}: ${e.error}`));
      copia.ok = copia.errores.length === 0;
      return [];
    }
    case "cerrar_copia": {
      const copia = resumen.copia;
      if (copia?.runId) await cerrarCopia(copia.runId, paso.projIds, { detalle: copia.boards, errores: copia.errores });
      return pasosDeTableros(await listarBoardsImportables());
    }
    case "directorio": {
      const dir = await importarPersonasDesdeMonday(false);
      resumen.directorio = { nuevas: dir.nuevas, actualizadas: dir.actualizadas, desactivadas: dir.desactivadas };
      return [];
    }
    case "tablero": {
      const inicio = Date.now();
      const tableros = unwrap(await db.from("tableros").select("id, sincroniza_monday, archivado_at").eq("monday_board_id", paso.boardId)) ?? [];
      const t = tableros.find((x) => !x.archivado_at) ?? tableros[0];
      const r: ResultadoBoardCorrida = { board: paso.nombre, boardId: paso.boardId, tipo: paso.tipoBoard, tableroId: t?.id ?? null };
      resumen.boards = [...resumen.boards.filter((b) => b.boardId !== paso.boardId), r];
      try {
        if (!t) {
          const imp = await importarBoard(paso.boardId, { refrescar: false, reemplazar: false }, SISTEMA);
          r.tableroId = imp.tableroId;
          r.importado = true;
        } else if (t.archivado_at) r.omitido = "Tablero archivado en la app";
        else if (!t.sincroniza_monday) r.omitido = "Ya no se sincroniza con Monday";
        else r.cambios = await sincronizarTablero(t.id);
      } catch (e) {
        r.error = mensaje(e);
      }
      r.ms = Date.now() - inicio;
      return [];
    }
    case "bitacora":
    case "comparar": {
      const r = deBoard(resumen, paso.boardId);
      if (!r?.tableroId || r.omitido) return [];
      const inicio = Date.now();
      try {
        if (paso.tipo === "bitacora") {
          const ex = await traerBitacoraYArchivos(r.tableroId);
          r.comentariosNuevos = ex.comentariosNuevos;
          r.archivosNuevos = ex.archivosNuevos;
          r.adjuntosSinTraer = ex.adjuntosSinTraer;
          if (ex.errores.length) r.error = `Archivos: ${ex.errores.slice(0, 3).join("; ")}`;
        } else {
          const completo = await leerTablero(r.tableroId, ACCESO_SISTEMA);
          if (completo) {
            const c = await compararConMonday(completo, ACCESO_SISTEMA);
            r.diferencias = c.diferencias.length + c.filas.filter((f) => !filaIgual(f)).length;
            r.avisos = c.avisos.length;
          }
        }
      } catch (e) {
        r.error = mensaje(e);
      }
      r.ms = (r.ms ?? 0) + Date.now() - inicio;
      return [];
    }
  }
}

/** Un paso que se cortó demasiadas veces se deja de intentar. Devuelve el error si eso tumba la corrida. */
function abandonar(paso: Paso, resumen: ResumenCorrida): string | null {
  const motivo = `${describirPaso(paso)}: no terminó a tiempo (se cortó ${MAX_INTENTOS_POR_PASO} veces)`;
  if (pasoCritico(paso)) return motivo;
  if (paso.tipo === "copiar") {
    const copia = (resumen.copia ??= { ok: true, boards: 0, errores: [] });
    copia.errores.push(motivo);
    copia.ok = false;
    return null;
  }
  if (paso.tipo === "tablero" || paso.tipo === "bitacora" || paso.tipo === "comparar") {
    let r = deBoard(resumen, paso.boardId);
    if (!r) resumen.boards.push(r = { board: paso.nombre, boardId: paso.boardId, tipo: paso.tipo === "tablero" ? paso.tipoBoard : "", tableroId: null });
    r.error = motivo;
  }
  return null;
}

export interface Avance {
  /** ocupada: otra llamada la está avanzando · pendiente: faltan pasos · terminada: se cerró. */
  estado: "ocupada" | "pendiente" | "terminada";
  pasos: number;
  faltan: number;
  resumen?: ResumenCorrida;
}

/** Avanza una corrida abierta paso a paso hasta terminarla o hasta `hasta` (ms de reloj; no empieza
 *  un paso después de esa hora). Toma el candado de la corrida: si otra llamada lo tiene, no hace nada. */
export async function avanzarCorrida(corridaId: number, opciones: { hasta?: number } = {}): Promise<Avance> {
  const db = getSupabaseAdmin();
  let candado = iso(Date.now() + CANDADO_MS);
  const tomada = unwrap(await db.from(T).update({ trabajando_hasta: candado })
    .eq("id", corridaId).eq("estado", "en_curso")
    .or(`trabajando_hasta.is.null,trabajando_hasta.lt."${iso(Date.now())}"`)
    .select("pasos, resumen")) ?? [];
  if (!tomada.length) return { estado: "ocupada", pasos: 0, faltan: 0 };

  let cola = (Array.isArray(tomada[0].pasos) ? tomada[0].pasos : []) as unknown as PasoEnCola[];
  const resumen = { boards: [], ...(tomada[0].resumen as object) } as ResumenCorrida;
  let hechos = 0;

  /** Guarda el avance y renueva el candado. false = otra llamada se quedó con la corrida (venció el candado). */
  const guardar = async (extra: Pick<TablesUpdate<"tablero_sincronizaciones">, "fin" | "estado" | "error" | "trabajando_hasta"> = {}): Promise<boolean> => {
    const nuevo = iso(Date.now() + CANDADO_MS);
    const filas = unwrap(await db.from(T).update({
      pasos: cola as unknown as Json, resumen: resumen as unknown as Json, latido: iso(Date.now()), trabajando_hasta: nuevo, ...extra,
    }).eq("id", corridaId).eq("trabajando_hasta", candado).select("id")) ?? [];
    candado = nuevo;
    return filas.length > 0;
  };
  const terminar = async (fallo: string | null): Promise<Avance> => {
    resumen.enCurso = null;
    cola = [];
    const conErrores = !!resumen.copia?.errores.length || resumen.boards.some((b) => b.error);
    await guardar({ fin: iso(Date.now()), estado: fallo ? "fallo" : conErrores ? "con_errores" : "ok", error: fallo, trabajando_hasta: null });
    return { estado: "terminada", pasos: hechos, faltan: 0, resumen };
  };

  while (cola.length) {
    if (opciones.hasta !== undefined && Date.now() >= opciones.hasta) break;
    const [paso, ...resto] = cola;
    const intentos = (paso.intentos ?? 0) + 1;
    if (intentos > MAX_INTENTOS_POR_PASO) {
      cola = resto;
      const fatal = abandonar(paso, resumen);
      if (fatal) return terminar(fatal);
      if (!(await guardar())) return { estado: "ocupada", pasos: hechos, faltan: cola.length };
      continue;
    }
    // Se anota el intento ANTES de correrlo: si la función se corta a medias, cuenta.
    cola = [{ ...paso, intentos }, ...resto];
    resumen.enCurso = describirPaso(paso);
    if (!(await guardar())) return { estado: "ocupada", pasos: hechos, faltan: cola.length };
    try {
      cola = [...(await ejecutarPaso(paso, resumen)), ...resto];
    } catch (e) {
      return terminar(`${describirPaso(paso)}: ${mensaje(e)}`);
    }
    hechos++;
  }
  if (!cola.length) return terminar(null);
  // Se acabó el tiempo de esta llamada: guarda y suelta el candado para que la siguiente siga.
  await guardar({ trabajando_hasta: null });
  return { estado: "pendiente", pasos: hechos, faltan: cola.length, resumen };
}

/** Corre una corrida ya abierta hasta el final, de un jalón (en esta PC: botón y script). */
export async function correrSincronizacion(corridaId: number): Promise<ResumenCorrida> {
  for (;;) {
    const a = await avanzarCorrida(corridaId);
    if (a.estado !== "pendiente") return a.resumen ?? { boards: [] };
  }
}

export interface ResultadoTick {
  /** nada: aún no toca · ocupada: otra llamada la está avanzando · avanzó / abrió: trabajó. */
  accion: "nada" | "ocupada" | "avanzó" | "abrió";
  corridaId?: number;
  pasos?: number;
  faltan?: number;
  terminada?: boolean;
  /** Con «nada»: minutos para la siguiente. */
  faltanMin?: number;
}

/** Lo que hace cada llamada programada: seguir la corrida abierta o abrir una nueva si la última
 *  empezó hace `cadaMin` o más. Con `presupuestoMs` no empieza pasos después de ese tiempo. */
export async function tickSincronizacion(o: { origen: Origen; cadaMin: number; presupuestoMs?: number }): Promise<ResultadoTick> {
  const db = getSupabaseAdmin();
  const hasta = o.presupuestoMs === undefined ? undefined : Date.now() + o.presupuestoMs;
  const [abierta, ultima] = await Promise.all([
    db.from(T).select("id, inicio").eq("estado", "en_curso").maybeSingle().then(unwrap),
    db.from(T).select("inicio").order("inicio", { ascending: false }).limit(1).maybeSingle().then(unwrap),
  ]);
  const d = decidirTick({ enCurso: abierta ?? null, ultimaInicio: ultima?.inicio ?? null, ahora: new Date(), cadaMin: o.cadaMin });
  const informe = (accion: "avanzó" | "abrió", corridaId: number, a: Avance): ResultadoTick =>
    ({ accion: a.estado === "ocupada" ? "ocupada" : accion, corridaId, pasos: a.pasos, faltan: a.faltan, terminada: a.estado === "terminada" });

  if (d.decision === "avanzar") return informe("avanzó", abierta!.id, await avanzarCorrida(abierta!.id, { hasta }));
  if (d.decision === "esperar") return { accion: "nada", faltanMin: d.faltanMin };
  // abrir (y si había una cortada, iniciarCorrida la cierra primero)
  let id: number;
  try {
    id = await iniciarCorrida(o.origen);
  } catch (e) {
    if (e instanceof ErrorTablero && e.status === 409) return { accion: "ocupada" };
    throw e;
  }
  return informe("abrió", id, await avanzarCorrida(id, { hasta }));
}

export interface Corrida {
  id: number;
  origen: string;
  inicio: string;
  fin: string | null;
  estado: string;
  error: string | null;
  resumen: ResumenCorrida;
  /** Pasos que le faltan (mientras corre). */
  pendientes: number;
  latido: string | null;
}

/** Las últimas corridas (la primera es la más reciente). */
export async function listarCorridas(limite = 10): Promise<Corrida[]> {
  const filas = unwrap(await getSupabaseAdmin().from(T).select("*").order("inicio", { ascending: false }).limit(limite)) ?? [];
  return filas.map((f) => ({
    id: f.id, origen: f.origen, inicio: f.inicio, fin: f.fin, estado: f.estado, error: f.error,
    resumen: { boards: [], ...(f.resumen as object) } as ResumenCorrida,
    pendientes: Array.isArray(f.pasos) ? f.pasos.length : 0, latido: f.latido,
  }));
}
