// src/lib/store.ts
// SOLO SERVIDOR. Datos propios de la app en Supabase. Conservan los nombres y
// firmas de cuando estaban en Firestore, así que los Route Handlers no dependen de la base.
// La traducción fila → tipo vive en storeRows.ts (puro, con tests).

import type {
  AtrasoDetalle, AtrasoReparto, AttributionKind, BoardAlcance, ClaseEntry, DelayAttribution,
  DelayResponsible, MetaCliente, MetasImplementacionDoc, MetodologiaCalif, ObjetivoMes, OnHoldDoc,
  ProjItemBaseline, ReqBaseline, WeeklySnapshotDoc,
} from "@/types";
import type { Json } from "@/types/supabase";
import type { OnHoldTipo } from "@/lib/onHold";
import type { VpaCalifs } from "@/lib/vpa";
import { enTrozos, getSupabaseAdmin, selectAll, unwrap } from "@/lib/supabase-admin";
import {
  atrasoDetallesDe, attributionsDe, boardAlcancesDe, clasesDe, metasImplementacionDe, metodologiaDe,
  onHoldDe, projItemBaselinesDe, reqBaselinesDe, vpaDe, weeklySnapshotDe,
} from "@/lib/storeRows";

const db = getSupabaseAdmin;
const ahora = () => new Date().toISOString();

// ── Baselines de costo (EV / CPI) ─────────────────────────────────────────

export async function getReqBaselines(): Promise<Record<string, ReqBaseline>> {
  const rows = await selectAll((a, b) => db().from("req_baselines").select("*").order("req_id").range(a, b));
  return reqBaselinesDe(rows);
}

export async function saveReqBaseline(reqId: string, data: Omit<ReqBaseline, "savedAt">): Promise<void> {
  unwrap(await db().from("req_baselines").upsert({ req_id: reqId, cost_rh: data.costRH, cost_sft: data.costSft, saved_at: ahora() }));
}

export async function getProjItemBaselines(): Promise<Record<string, ProjItemBaseline>> {
  const rows = await selectAll((a, b) => db().from("proj_item_baselines").select("*").order("item_id").range(a, b));
  return projItemBaselinesDe(rows);
}

export async function saveProjItemBaseline(itemId: string, data: Omit<ProjItemBaseline, "savedAt">): Promise<void> {
  unwrap(await db().from("proj_item_baselines").upsert({ item_id: itemId, board_id: data.boardId, cost: data.cost, saved_at: ahora() }));
}

/** Baselines de un CONJUNTO de items puntual (refresh de un solo board de Proyectos). */
export async function getProjItemBaselinesFor(itemIds: string[]): Promise<Record<string, ProjItemBaseline>> {
  if (itemIds.length === 0) return {};
  const trozos = await Promise.all(
    enTrozos([...new Set(itemIds)], 150).map(async (ids) =>
      unwrap(await db().from("proj_item_baselines").select("*").in("item_id", ids)) ?? []),
  );
  return projItemBaselinesDe(trozos.flat());
}

// ── Atribuciones de responsable (delay / reproceso, de PM y de CKU) ─────────

export async function getAttributions(kind: AttributionKind): Promise<Record<string, DelayAttribution>> {
  const rows = await selectAll((a, b) =>
    db().from("responsible_attributions").select("*").eq("kind", kind).order("item_id").range(a, b));
  return attributionsDe(rows);
}

export async function saveAttribution(kind: AttributionKind, itemId: string, responsible: DelayResponsible, by: string): Promise<void> {
  unwrap(await db().from("responsible_attributions").upsert({ kind, item_id: itemId, responsible, updated_by: by, updated_at: ahora() }));
}

export async function deleteAttribution(kind: AttributionKind, itemId: string): Promise<void> {
  unwrap(await db().from("responsible_attributions").delete().eq("kind", kind).eq("item_id", itemId));
}

// ── Metodología VALOR ─────────────────────────────────────────────────────

export async function getMetodologiaCalifs(): Promise<Record<string, MetodologiaCalif>> {
  const rows = await selectAll((a, b) => db().from("metodologia_califs").select("*").order("key").range(a, b));
  return metodologiaDe(rows);
}

export async function saveMetodologiaCalif(phaseKey: string, score: number, by: string, comentario: string = ""): Promise<void> {
  unwrap(await db().from("metodologia_califs").upsert({ key: phaseKey, score, comentario, updated_by: by, updated_at: ahora() }));
}

export async function deleteMetodologiaCalif(phaseKey: string): Promise<void> {
  unwrap(await db().from("metodologia_califs").delete().eq("key", phaseKey));
}

// ── Calificación mensual del VPA ──────────────────────────────────────────
// Una fila por (mes, indicador): calificar un indicador no pisa a otro.

export async function getVpaCalifs(): Promise<VpaCalifs> {
  const rows = await selectAll((a, b) =>
    db().from("vpa_califs").select("*").order("mes").order("indicador").range(a, b));
  return vpaDe(rows);
}

/** Pone la nota de un indicador en un mes; `null` la quita. */
export async function saveVpaNota(mes: string, indicador: string, nota: number | null, by: string): Promise<void> {
  if (nota == null) {
    unwrap(await db().from("vpa_califs").delete().eq("mes", mes).eq("indicador", indicador));
    return;
  }
  unwrap(await db().from("vpa_califs").upsert({ mes, indicador, nota, updated_by: by, updated_at: ahora() }));
}

// ── Metas de Implementación ───────────────────────────────────────────────

export async function getMetasImplementacion(): Promise<MetasImplementacionDoc> {
  const [metas, objetivos] = await Promise.all([
    selectAll((a, b) => db().from("implementacion_metas_cliente").select("*").order("cliente").range(a, b)),
    selectAll((a, b) => db().from("implementacion_objetivos").select("*").order("mes").range(a, b)),
  ]);
  return metasImplementacionDe(metas, objetivos);
}

/** Reemplaza todas las metas y objetivos de una vez (función guardar_metas_implementacion). */
export async function saveMetasImplementacion(
  metas: MetaCliente[], objetivos: ObjetivoMes[], by: string,
): Promise<MetasImplementacionDoc> {
  unwrap(await db().rpc("guardar_metas_implementacion", {
    p_metas: metas.map((m) => ({ cliente: m.cliente, vol: m.vol, cm1: m.cm1, desde: m.desde ?? null })),
    p_objetivos: objetivos.map((o) => ({ mes: o.mes, objetivo: o.objetivo })),
    p_by: by,
  }));
  return { metas, objetivos, by, at: ahora() };
}

// ── On Hold ───────────────────────────────────────────────────────────────

export async function getOnHold(): Promise<OnHoldDoc> {
  const rows = await selectAll((a, b) => db().from("on_hold").select("*").order("tipo").order("id").range(a, b));
  return onHoldDe(rows);
}

export async function setOnHold(tipo: OnHoldTipo, id: string, activo: boolean, by: string, motivo = ""): Promise<void> {
  if (!activo) {
    unwrap(await db().from("on_hold").delete().eq("tipo", tipo).eq("id", id));
    return;
  }
  unwrap(await db().from("on_hold").upsert({ tipo, id, motivo, created_by: by, created_at: ahora() }));
}

/** Cambia el motivo de algo que YA está en On Hold (quién y cuándo lo pausó se quedan).
 *  Devuelve false si ya no está en On Hold: el UPDATE no encuentra la fila. */
export async function setMotivoOnHold(tipo: OnHoldTipo, id: string, motivo: string): Promise<boolean> {
  const rows = unwrap(await db().from("on_hold").update({ motivo }).eq("tipo", tipo).eq("id", id).select("id"));
  return (rows?.length ?? 0) > 0;
}

// ── Detalle de atraso (tabla Atrasos del Resumen Ejecutivo) ───────────────

export async function getAtrasoDetalles(): Promise<Record<string, AtrasoDetalle>> {
  const rows = await selectAll((a, b) => db().from("atraso_detalles").select("*").order("item_id").range(a, b));
  return atrasoDetallesDe(rows);
}

export async function saveAtrasoDetalle(itemId: string, reparto: AtrasoReparto[], motivo: string, by: string): Promise<void> {
  // Reemplaza la fila completa → un `responsable` legacy desaparece al editar (igual que antes).
  unwrap(await db().from("atraso_detalles").upsert({
    item_id: itemId,
    reparto: reparto as unknown as Json,
    responsable_legacy: null,
    motivo,
    updated_by: by,
    updated_at: ahora(),
  }));
}

export async function deleteAtrasoDetalle(itemId: string): Promise<void> {
  unwrap(await db().from("atraso_detalles").delete().eq("item_id", itemId));
}

// ── Alcance de un proyecto (Status Card) ──────────────────────────────────

export async function getBoardAlcances(): Promise<Record<string, BoardAlcance>> {
  const rows = await selectAll((a, b) => db().from("board_alcance").select("*").order("board_id").range(a, b));
  return boardAlcancesDe(rows);
}

export async function saveBoardAlcance(boardId: string, alcance: string, by: string): Promise<void> {
  unwrap(await db().from("board_alcance").upsert({ board_id: boardId, alcance, updated_by: by, updated_at: ahora() }));
}

export async function deleteBoardAlcance(boardId: string): Promise<void> {
  unwrap(await db().from("board_alcance").delete().eq("board_id", boardId));
}

// ── Clase A/B/C de Proyectos y PML ────────────────────────────────────────

export async function getClases(): Promise<Record<string, ClaseEntry>> {
  const rows = await selectAll((a, b) => db().from("clasificacion").select("*").order("id").range(a, b));
  return clasesDe(rows);
}

export async function saveClase(id: string, clase: ClaseEntry["clase"], by: string): Promise<void> {
  unwrap(await db().from("clasificacion").upsert({ id, clase, updated_by: by, updated_at: ahora() }));
}

// ── Histórico semanal del portafolio ──────────────────────────────────────
// PK = lunes de la semana: volver a guardar la misma semana la sobreescribe (idempotente).

export async function saveWeeklySnapshot(weekOf: string, metrics: Omit<WeeklySnapshotDoc, "weekOf" | "createdAt">): Promise<void> {
  unwrap(await db().from("weekly_snapshots").upsert({
    week_of: weekOf,
    evm: metrics.evm,
    beneficio_confirmado: metrics.beneficioConfirmado,
    calidad: metrics.calidad,
    cumplimiento: metrics.cumplimiento,
    nps: metrics.nps,
    created_at: ahora(),
  }));
}

export async function listWeeklySnapshots(): Promise<WeeklySnapshotDoc[]> {
  const rows = await selectAll((a, b) => db().from("weekly_snapshots").select("*").order("week_of", { ascending: true }).range(a, b));
  return rows.map(weeklySnapshotDe);
}

// ── Fechas de restauración de Pre-producción ──────────────────────────────

export async function getPreprodRestoreDates(): Promise<string[]> {
  const rows = await selectAll((a, b) => db().from("preprod_restore_dates").select("fecha").order("fecha").range(a, b));
  return rows.map((r) => r.fecha);
}

/** Reemplaza la lista completa (función guardar_fechas_preprod). Devuelve la lista sin
 *  duplicados y ordenada, como antes. */
export async function savePreprodRestoreDates(dates: string[], by: string): Promise<string[]> {
  const sorted = [...new Set(dates)].sort();
  unwrap(await db().rpc("guardar_fechas_preprod", { p_fechas: sorted, p_by: by }));
  return sorted;
}

// ── Suplentes de Buenas noticias (portada) ────────────────────────────────
// Una fila por semana (lunes YYYY-MM-DD) → nombre del suplente. Sin fila = da las buenas
// noticias quien toca por la rotación (ver lib/buenasNoticias.ts).

export async function getBuenasNoticiasSuplentes(): Promise<Record<string, string>> {
  const rows = await selectAll((a, b) =>
    db().from("buenas_noticias_suplentes").select("semana, nombre").order("semana").range(a, b));
  return Object.fromEntries(rows.map((r) => [r.semana, r.nombre]));
}

/** Pone (o quita, con nombre null) el suplente de una semana y devuelve el mapa completo. */
export async function setBuenasNoticiasSuplente(semana: string, nombre: string | null, by: string): Promise<Record<string, string>> {
  if (nombre) {
    unwrap(await db().from("buenas_noticias_suplentes").upsert({ semana, nombre, updated_by: by, updated_at: ahora() }));
  } else {
    unwrap(await db().from("buenas_noticias_suplentes").delete().eq("semana", semana));
  }
  // Se podan las semanas de hace más de ~2 meses, para que la tabla no crezca sin fin.
  const corte = new Date(); corte.setDate(corte.getDate() - 60);
  const limite = `${corte.getFullYear()}-${String(corte.getMonth() + 1).padStart(2, "0")}-${String(corte.getDate()).padStart(2, "0")}`;
  unwrap(await db().from("buenas_noticias_suplentes").delete().lt("semana", limite));
  return getBuenasNoticiasSuplentes();
}
