// src/lib/storeRows.ts
// Módulo PURO. Convierte las filas de Supabase (src/types/supabase.ts) a los tipos que la app
// usaba con Firestore, para que el resto del código reciba EXACTAMENTE lo mismo de antes.
// Lo usa lib/store.ts (I/O); aquí solo va la traducción, y por eso aquí van los tests.

import type {
  AtrasoDetalle, BoardAlcance, ClaseEntry, DelayAttribution, MetasImplementacionDoc,
  MetodologiaCalif, NpsRecord, OnHoldDoc, ProjItemBaseline, ReqBaseline, WeeklySnapshotDoc,
} from "@/types";
import type { Tables } from "@/types/supabase";
import type { SurveyAnswers, SurveyDoc, SurveyResponseDoc } from "@/lib/survey";
import type { CkuAnswers, CkuSurveyDoc, CkuSurveyResponseDoc } from "@/lib/surveyCku";
import { leerDocMetas } from "@/lib/implementaciones";
import { leerOnHold } from "@/lib/onHold";
import { esMesValido } from "@/lib/metodologia";
import { leerCalifVpa, type VpaCalifs } from "@/lib/vpa";

/** timestamptz de PostgREST ("2026-11-05T16:28:01.333+00:00") → ISO de JS ("…01.333Z"),
 *  el mismo formato que guardaba Firestore con `new Date().toISOString()`. */
export function iso(ts: string): string;
export function iso(ts: string | null | undefined): string | undefined;
export function iso(ts: string | null | undefined): string | undefined {
  if (!ts) return undefined;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toISOString();
}

/** El último (más reciente) de varios timestamps ISO, o undefined si no hay ninguno. */
function masReciente(tss: (string | null | undefined)[]): string | undefined {
  let max: string | undefined;
  for (const t of tss) {
    const v = iso(t);
    if (v && (!max || v > max)) max = v;
  }
  return max;
}

/** Agrega `by`/`at` solo si existen (Firestore no guardaba la llave cuando no había valor). */
const conAutor = (by: string | null | undefined, at: string | null | undefined) => ({
  ...(by ? { by } : {}),
  ...(at ? { at: iso(at) } : {}),
});

// ── Responsables ──────────────────────────────────────────────────────────
// Alias de compatibilidad: roles renombrados → el nombre vigente. Se aplica SOLO al
// leer; al re-guardar una fila queda con el nombre nuevo. Agregar aquí cualquier rol
// que se renombre a futuro.
const RESP_ALIAS: Record<string, string> = { Desarrollador: "Desarrollo" };
export const normResp = <T extends string>(r: T): T => (RESP_ALIAS[r] as T) ?? r;

// ── Baselines ─────────────────────────────────────────────────────────────

export function reqBaselinesDe(rows: Tables<"req_baselines">[]): Record<string, ReqBaseline> {
  const out: Record<string, ReqBaseline> = {};
  for (const r of rows) out[r.req_id] = { costRH: r.cost_rh, costSft: r.cost_sft, savedAt: iso(r.saved_at) };
  return out;
}

export function projItemBaselinesDe(rows: Tables<"proj_item_baselines">[]): Record<string, ProjItemBaseline> {
  const out: Record<string, ProjItemBaseline> = {};
  for (const r of rows) out[r.item_id] = { boardId: r.board_id, cost: r.cost, savedAt: iso(r.saved_at) };
  return out;
}

// ── Atribuciones, Metodología, VPA ────────────────────────────────────────

export function attributionsDe(rows: Tables<"responsible_attributions">[]): Record<string, DelayAttribution> {
  const out: Record<string, DelayAttribution> = {};
  for (const r of rows) {
    out[r.item_id] = {
      responsible: normResp(r.responsible) as DelayAttribution["responsible"],
      ...conAutor(r.updated_by, r.updated_at),
    };
  }
  return out;
}

export function metodologiaDe(rows: Tables<"metodologia_califs">[]): Record<string, MetodologiaCalif> {
  const out: Record<string, MetodologiaCalif> = {};
  for (const r of rows) out[r.key] = { score: r.score, ...conAutor(r.updated_by, r.updated_at), comentario: r.comentario };
  return out;
}

/** Filas (mes, indicador, nota) → califs por mes. El `by`/`at` del mes es el de la nota más
 *  reciente. Pasa por leerCalifVpa: descarta indicadores que ya no existen, igual que antes. */
export function vpaDe(rows: Tables<"vpa_califs">[]): VpaCalifs {
  const porMes = new Map<string, Tables<"vpa_califs">[]>();
  for (const r of rows) {
    if (!esMesValido(r.mes)) continue;
    const lista = porMes.get(r.mes) ?? [];
    lista.push(r);
    porMes.set(r.mes, lista);
  }
  const out: VpaCalifs = {};
  for (const [mes, lista] of porMes) {
    const ultima = lista.reduce((a, b) => (iso(b.updated_at)! > iso(a.updated_at)! ? b : a));
    out[mes] = leerCalifVpa({
      notas: Object.fromEntries(lista.map((r) => [r.indicador, r.nota])),
      ...conAutor(ultima.updated_by, ultima.updated_at),
    });
  }
  return out;
}

// ── Metas de Implementación ───────────────────────────────────────────────

/** Las dos tablas → el documento de antes. Pasa por leerDocMetas (mismo orden y mismo filtro
 *  de objetivos que con Firestore). `by`/`at` = el último guardado (se guardan juntas). */
export function metasImplementacionDe(
  metas: Tables<"implementacion_metas_cliente">[],
  objetivos: Tables<"implementacion_objetivos">[],
): MetasImplementacionDoc {
  const leido = leerDocMetas({
    metas: metas.map((m) => ({ cliente: m.cliente, vol: m.vol, cm1: m.cm1, ...(m.desde ? { desde: m.desde } : {}) })),
    objetivos: objetivos.map((o) => ({ mes: o.mes, objetivo: o.objetivo })),
  });
  const todas = [...metas, ...objetivos];
  const at = masReciente(todas.map((r) => r.updated_at));
  const by = todas.find((r) => iso(r.updated_at) === at)?.updated_by ?? "";
  return { ...leido, by, at: at ?? "" };
}

// ── On Hold, Atrasos, Alcance, Clases ─────────────────────────────────────

export function onHoldDe(rows: Tables<"on_hold">[]): OnHoldDoc {
  const proyectos: Record<string, unknown> = {};
  const pml: Record<string, unknown> = {};
  for (const r of rows) {
    const entry = { by: r.created_by, at: iso(r.created_at), motivo: r.motivo };
    if (r.tipo === "proyecto") proyectos[r.id] = entry;
    else if (r.tipo === "pml") pml[r.id] = entry;
  }
  // leerOnHold aplica la misma validación de ids que antes.
  return leerOnHold({ proyectos, pml });
}

export function atrasoDetallesDe(rows: Tables<"atraso_detalles">[]): Record<string, AtrasoDetalle> {
  const out: Record<string, AtrasoDetalle> = {};
  for (const r of rows) {
    const reparto = Array.isArray(r.reparto) ? (r.reparto as unknown as NonNullable<AtrasoDetalle["reparto"]>) : undefined;
    out[r.item_id] = {
      ...(reparto ? { reparto: reparto.map((t) => ({ ...t, resp: normResp(t.resp) })) } : {}),
      ...(r.responsable_legacy ? { responsable: normResp(r.responsable_legacy) } : {}),
      motivo: r.motivo,
      ...conAutor(r.updated_by, r.updated_at),
    };
  }
  return out;
}

export function boardAlcancesDe(rows: Tables<"board_alcance">[]): Record<string, BoardAlcance> {
  const out: Record<string, BoardAlcance> = {};
  for (const r of rows) out[r.board_id] = { alcance: r.alcance, ...conAutor(r.updated_by, r.updated_at) };
  return out;
}

export function clasesDe(rows: Tables<"clasificacion">[]): Record<string, ClaseEntry> {
  const out: Record<string, ClaseEntry> = {};
  for (const r of rows) {
    if (r.clase !== "A" && r.clase !== "B" && r.clase !== "C") continue;
    out[r.id] = { clase: r.clase, by: r.updated_by, at: iso(r.updated_at) };
  }
  return out;
}

// ── Control Tower ─────────────────────────────────────────────────────────

export function weeklySnapshotDe(r: Tables<"weekly_snapshots">): WeeklySnapshotDoc {
  return {
    weekOf: r.week_of,
    evm: r.evm,
    beneficioConfirmado: r.beneficio_confirmado,
    calidad: r.calidad,
    cumplimiento: r.cumplimiento,
    nps: r.nps,
    createdAt: iso(r.created_at),
  };
}

// ── Encuestas ─────────────────────────────────────────────────────────────

export function surveyDe(r: Tables<"surveys">): SurveyDoc {
  return {
    token: r.token,
    reqId: r.req_id,
    reqCode: r.req_code,
    reqName: r.req_name,
    pm: r.pm,
    assignedEmail: r.assigned_email.toLowerCase(),
    assignedName: r.assigned_name,
    createdByEmail: r.created_by_email,
    createdAt: iso(r.created_at),
    answered: r.answered,
    answeredAt: iso(r.answered_at) ?? null,
    invalidated: r.invalidated,
    cku: r.cku,
  };
}

export function surveyResponseDe(r: Tables<"survey_responses">): SurveyResponseDoc {
  return {
    answers: (r.answers ?? {}) as SurveyAnswers,
    respondentEmail: r.respondent_email,
    submittedAt: iso(r.submitted_at),
  };
}

/** Respuestas unidas con el PM/`invalidated` de su encuesta. Las importadas del Sheet no
 *  tienen encuesta: quedan con pm="" y sin invalidar, igual que antes. */
export function npsRecordsDe(responses: Tables<"survey_responses">[], surveys: Tables<"surveys">[]): NpsRecord[] {
  const porToken = new Map(surveys.map((s) => [s.token, s]));
  return responses.map((r) => {
    const s = porToken.get(r.token);
    return {
      answers: (r.answers ?? {}) as NpsRecord["answers"],
      pm: s?.pm ?? "",
      invalidated: !!s?.invalidated,
      respondentEmail: r.respondent_email,
      submittedAt: iso(r.submitted_at),
      reqCode: s?.req_code ?? "",
      reqId: s?.req_id ?? "",
      cku: s?.cku ?? "",
      token: r.token,
    };
  });
}

// ── Encuestas NPS de un CKU (cku_surveys / cku_survey_responses) ─────────────

export function ckuSurveyDe(r: Tables<"cku_surveys">, respuestas = 0): CkuSurveyDoc {
  return {
    token: r.token, cku: r.cku, ckuEmail: r.cku_email, nombre: r.nombre,
    createdByEmail: r.created_by_email, createdAt: iso(r.created_at), respuestas,
  };
}

export function ckuSurveyResponseDe(r: Tables<"cku_survey_responses">): CkuSurveyResponseDoc {
  return {
    id: r.id, surveyToken: r.survey_token, respondentName: r.respondent_name, respondentEmail: r.respondent_email,
    answers: (r.answers ?? {}) as CkuAnswers, invalidated: r.invalidated, submittedAt: iso(r.submitted_at),
  };
}

/** Las respuestas de las encuestas de CKU como NpsRecord, para el NPS del Player de ese CKU. `pm` va vacío y `cku` lleva
 *  el nombre del dueño: así NO entran al NPS de PM, de proyecto ni global (ver calcNpsFromRecords). Si la encuesta ya no
 *  existe (no debería: FK en cascada) la respuesta se ignora. */
export function ckuNpsRecordsDe(responses: Tables<"cku_survey_responses">[], surveys: Tables<"cku_surveys">[]): NpsRecord[] {
  const porToken = new Map(surveys.map((s) => [s.token, s]));
  const out: NpsRecord[] = [];
  for (const r of responses) {
    const s = porToken.get(r.survey_token);
    if (!s) continue;
    out.push({
      answers: (r.answers ?? {}) as NpsRecord["answers"],
      pm: "",
      invalidated: r.invalidated,
      respondentEmail: r.respondent_email,
      respondentName: r.respondent_name,
      submittedAt: iso(r.submitted_at),
      reqCode: "",
      reqId: "",
      cku: s.cku,
      token: s.token,
      ckuEncuesta: true,
    });
  }
  return out;
}
