// src/lib/migracionFirestore.ts
// Fase 3 de la migración: documentos CRUDOS de Firestore → filas de Supabase. Puro (sin I/O) y
// con tests; scripts/migrar-firestore.ts lee Firestore, llama a planMigracion() y escribe.
// Se borra junto con firebase-admin.ts al terminar la migración (fase 6).
//
// Criterio: se copia lo que hay, sin «arreglarlo». Solo se aplican los mismos lectores que ya
// usa la app (leerDocMetas, leerOnHold, leerCalifVpa), porque el esquema nuevo no tiene dónde
// guardar lo que esos lectores descartan. Todo lo que no entra se reporta en `avisos`.

import type { TablesInsert } from "@/types/supabase";
import type { AttributionKind } from "@/types";
import { leerDocMetas } from "@/lib/implementaciones";
import { leerOnHold } from "@/lib/onHold";
import { esMesValido } from "@/lib/metodologia";
import { leerCalifVpa } from "@/lib/vpa";
import { BOOTSTRAP_ADMIN_ROLE_ID, DEFAULT_NEW_USER_ROLE_ID } from "@/lib/registry";

export interface DocCrudo {
  id: string;
  data: Record<string, unknown>;
}

/** Colección de Firestore → sus documentos. */
export type FirestoreCrudo = Record<string, DocCrudo[]>;

export const ATTRIBUTION_COLL: Record<AttributionKind, string> = {
  delay: "delay_attributions",
  reproceso: "reproceso_attributions",
  "delay-cku": "cku_delay_attributions",
  "reproceso-cku": "cku_reproceso_attributions",
};

/** Todas las colecciones que hay que leer de Firestore. */
export const COLECCIONES = [
  "roles", "groups", "users",
  "req_baselines", "proj_item_baselines",
  ...Object.values(ATTRIBUTION_COLL),
  "metodologia_califs", "vpa_califs", "implementacion_metas", "on_hold",
  "atraso_detalles", "board_alcance", "clasificacion",
  "weekly_snapshots", "preprod_restore_dates", "buenas_noticias_suplentes",
  "surveys", "survey_responses",
] as const;

/** Tablas que se llenan con planMigracion (app_users va aparte: necesita los ids de Auth). */
export const TABLAS = [
  "roles", "menu_groups",
  "req_baselines", "proj_item_baselines", "responsible_attributions",
  "metodologia_califs", "vpa_califs", "implementacion_metas_cliente", "implementacion_objetivos",
  "on_hold", "atraso_detalles", "board_alcance", "clasificacion",
  "weekly_snapshots", "preprod_restore_dates", "buenas_noticias_suplentes",
  "surveys", "survey_responses",
] as const;
export type Tabla = (typeof TABLAS)[number];

/** Columnas de la llave primaria de cada tabla (para el upsert y para el espejo). */
export const LLAVES: Record<Tabla, readonly string[]> = {
  roles: ["id"],
  menu_groups: ["id"],
  req_baselines: ["req_id"],
  proj_item_baselines: ["item_id"],
  responsible_attributions: ["kind", "item_id"],
  metodologia_califs: ["key"],
  vpa_califs: ["mes", "indicador"],
  implementacion_metas_cliente: ["cliente"],
  implementacion_objetivos: ["mes"],
  on_hold: ["tipo", "id"],
  atraso_detalles: ["item_id"],
  board_alcance: ["board_id"],
  clasificacion: ["id"],
  weekly_snapshots: ["week_of"],
  preprod_restore_dates: ["fecha"],
  buenas_noticias_suplentes: ["semana"],
  surveys: ["token"],
  survey_responses: ["token"],
};

/** Tablas que NO se espejan (no se borra lo que sobre en Supabase): usuarios, roles y grupos
 *  pueden tener cosas creadas a propósito en Supabase (p. ej. el admin de arranque). */
export const SIN_ESPEJO: ReadonlySet<Tabla> = new Set<Tabla>(["roles", "menu_groups"]);

export type Filas = { [T in Tabla]: TablesInsert<T>[] };

export interface UsuarioFirestore {
  firebaseUid: string;
  email: string;
  displayName: string;
  roleId: string | null;
  defaultPage: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlanMigracion {
  filas: Filas;
  usuarios: UsuarioFirestore[];
  avisos: string[];
}

// ── Lectores de valores sueltos ─────────────────────────────────────────────

/** Fecha/hora de Firestore → ISO. Entiende el string ISO que guarda la app y, por si acaso,
 *  Timestamp de Firestore (`toDate()`) y Date. Cualquier otra cosa → undefined. */
export function aIso(v: unknown): string | undefined {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString();
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : new Date(t).toISOString();
  }
  if (v && typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function") {
    return aIso((v as { toDate: () => Date }).toDate());
  }
  return undefined;
}

const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Pone `col` = ISO de `v` solo si es válida; si no, la omite y la columna toma su default (now()). */
function fecha<R extends object>(fila: R, col: string, v: unknown): R {
  const iso = aIso(v);
  return iso ? { ...fila, [col]: iso } : fila;
}

/** Doc de un solo documento (`actual`, `list`) dentro de una colección. */
const docUnico = (docs: DocCrudo[] | undefined, id: string) => docs?.find((d) => d.id === id)?.data;

// ── Plan completo ───────────────────────────────────────────────────────────

export function planMigracion(fs: FirestoreCrudo): PlanMigracion {
  const avisos: string[] = [];
  const aviso = (m: string) => avisos.push(m);
  const docs = (coll: string) => fs[coll] ?? [];

  const filas: Filas = {
    roles: [], menu_groups: [],
    req_baselines: [], proj_item_baselines: [], responsible_attributions: [],
    metodologia_califs: [], vpa_califs: [], implementacion_metas_cliente: [], implementacion_objetivos: [],
    on_hold: [], atraso_detalles: [], board_alcance: [], clasificacion: [],
    weekly_snapshots: [], preprod_restore_dates: [], buenas_noticias_suplentes: [],
    surveys: [], survey_responses: [],
  };

  // Roles y grupos del menú
  for (const { id, data: d } of docs("roles")) {
    let fila: TablesInsert<"roles"> = {
      id,
      name: texto(d.name) ?? id,
      permissions: (esObjeto(d.permissions) ? d.permissions : { pages: {}, actions: {}, groups: {} }) as TablesInsert<"roles">["permissions"],
      is_system: !!d.isSystem,
    };
    fila = fecha(fecha(fila, "created_at", d.createdAt), "updated_at", d.updatedAt);
    filas.roles.push(fila);
  }
  for (const { id, data: d } of docs("groups")) {
    let fila: TablesInsert<"menu_groups"> = {
      id,
      name: texto(d.name) ?? id,
      icon: texto(d.icon) ?? "🗂",
      page_keys: Array.isArray(d.pageKeys) ? d.pageKeys.filter((k): k is string => typeof k === "string") : [],
      is_system: !!d.isSystem,
    };
    fila = fecha(fecha(fila, "created_at", d.createdAt), "updated_at", d.updatedAt);
    filas.menu_groups.push(fila);
  }

  // Baselines
  for (const { id, data: d } of docs("req_baselines")) {
    const rh = numero(d.costRH), sft = numero(d.costSft);
    if (rh == null || sft == null) aviso(`req_baselines/${id}: costo no numérico (${String(d.costRH)}, ${String(d.costSft)}) → 0`);
    filas.req_baselines.push(fecha({ req_id: id, cost_rh: rh ?? 0, cost_sft: sft ?? 0 }, "saved_at", d.savedAt));
  }
  for (const { id, data: d } of docs("proj_item_baselines")) {
    const boardId = texto(d.boardId) ?? (typeof d.boardId === "number" ? String(d.boardId) : null);
    if (!boardId) { aviso(`proj_item_baselines/${id}: sin boardId → se omite`); continue; }
    const cost = numero(d.cost);
    if (cost == null) aviso(`proj_item_baselines/${id}: costo no numérico (${String(d.cost)}) → 0`);
    filas.proj_item_baselines.push(fecha({ item_id: id, board_id: boardId, cost: cost ?? 0 }, "saved_at", d.savedAt));
  }

  // Atribuciones (4 colecciones → 1 tabla). El alias Desarrollador→Desarrollo lo aplica el lector.
  for (const [kind, coll] of Object.entries(ATTRIBUTION_COLL) as [AttributionKind, string][]) {
    for (const { id, data: d } of docs(coll)) {
      const responsible = texto(d.responsible);
      if (!responsible) { aviso(`${coll}/${id}: sin responsible → se omite`); continue; }
      filas.responsible_attributions.push(
        fecha({ kind, item_id: id, responsible, updated_by: texto(d.by) }, "updated_at", d.at));
    }
  }

  // Calificaciones
  for (const { id, data: d } of docs("metodologia_califs")) {
    const score = numero(d.score);
    if (score == null || score < 0 || score > 100) { aviso(`metodologia_califs/${id}: score inválido (${String(d.score)}) → se omite`); continue; }
    filas.metodologia_califs.push(
      fecha({ key: id, score, comentario: texto(d.comentario) ?? "", updated_by: texto(d.by) }, "updated_at", d.at));
  }
  for (const { id, data: d } of docs("vpa_califs")) {
    if (!esMesValido(id)) { aviso(`vpa_califs/${id}: id no es un mes YYYY-MM → se omite`); continue; }
    const leido = leerCalifVpa(d);
    const crudas = esObjeto(d.notas) ? Object.keys(d.notas).filter((k) => (d.notas as Record<string, unknown>)[k] != null) : [];
    const descartadas = crudas.filter((k) => !(k in leido.notas));
    if (descartadas.length) aviso(`vpa_califs/${id}: se descartan notas que la app ya no lee (${descartadas.join(", ")})`);
    for (const [indicador, nota] of Object.entries(leido.notas)) {
      filas.vpa_califs.push(fecha({ mes: id, indicador, nota, updated_by: texto(d.by) }, "updated_at", d.at));
    }
  }

  // Metas de Implementación (un doc → dos tablas)
  const metasDoc = docUnico(fs.implementacion_metas, "actual");
  if (metasDoc) {
    const { metas, objetivos } = leerDocMetas(metasDoc);
    const by = texto(metasDoc.by);
    for (const m of metas) {
      if (m.vol < 0 || m.cm1 < 0) { aviso(`implementacion_metas: meta negativa de ${m.cliente} → se omite`); continue; }
      filas.implementacion_metas_cliente.push(
        fecha({ cliente: m.cliente, vol: m.vol, cm1: m.cm1, desde: m.desde ?? null, updated_by: by }, "updated_at", metasDoc.at));
    }
    for (const o of objetivos) {
      filas.implementacion_objetivos.push(fecha({ mes: o.mes, objetivo: o.objetivo, updated_by: by }, "updated_at", metasDoc.at));
    }
  }

  // On Hold (un doc con dos mapas → una fila por pausa)
  const onHoldDoc = docUnico(fs.on_hold, "actual");
  if (onHoldDoc) {
    const h = leerOnHold(onHoldDoc);
    for (const [tipo, mapa] of [["proyecto", h.proyectos], ["pml", h.pml]] as const) {
      for (const [id, e] of Object.entries(mapa)) {
        filas.on_hold.push(fecha({ tipo, id, motivo: e.motivo ?? "", created_by: e.by ?? "" }, "created_at", e.at));
      }
    }
  }

  // Textos editables
  for (const { id, data: d } of docs("atraso_detalles")) {
    filas.atraso_detalles.push(fecha({
      item_id: id,
      reparto: Array.isArray(d.reparto) ? (d.reparto as TablesInsert<"atraso_detalles">["reparto"]) : null,
      responsable_legacy: texto(d.responsable),
      motivo: texto(d.motivo) ?? "",
      updated_by: texto(d.by),
    }, "updated_at", d.at));
  }
  for (const { id, data: d } of docs("board_alcance")) {
    const alcance = texto(d.alcance);
    if (alcance == null) { aviso(`board_alcance/${id}: sin texto → se omite`); continue; }
    filas.board_alcance.push(fecha({ board_id: id, alcance, updated_by: texto(d.by) }, "updated_at", d.at));
  }
  const clasesDoc = docUnico(fs.clasificacion, "actual");
  for (const [id, e] of Object.entries(clasesDoc ?? {})) {
    const o = esObjeto(e) ? e : {};
    if (o.clase !== "A" && o.clase !== "B" && o.clase !== "C") { aviso(`clasificacion/${id}: clase inválida (${String(o.clase)}) → se omite`); continue; }
    filas.clasificacion.push(fecha({ id, clase: o.clase, updated_by: texto(o.by) ?? "" }, "updated_at", o.at));
  }

  // Control Tower
  for (const { id, data: d } of docs("weekly_snapshots")) {
    const weekOf = texto(d.weekOf) ?? id;
    if (!DIA_RE.test(weekOf)) { aviso(`weekly_snapshots/${id}: weekOf inválido (${weekOf}) → se omite`); continue; }
    filas.weekly_snapshots.push(fecha({
      week_of: weekOf,
      evm: numero(d.evm),
      beneficio_confirmado: numero(d.beneficioConfirmado) ?? 0,
      calidad: numero(d.calidad),
      cumplimiento: numero(d.cumplimiento),
      nps: numero(d.nps),
    }, "created_at", d.createdAt));
  }
  const preprodDoc = docUnico(fs.preprod_restore_dates, "list");
  if (preprodDoc) {
    const fechas = Array.isArray(preprodDoc.dates) ? preprodDoc.dates : [];
    const malas = fechas.filter((f) => typeof f !== "string" || !DIA_RE.test(f));
    if (malas.length) aviso(`preprod_restore_dates: se omiten fechas inválidas (${malas.map(String).join(", ")})`);
    for (const f of [...new Set(fechas.filter((f): f is string => typeof f === "string" && DIA_RE.test(f)))]) {
      filas.preprod_restore_dates.push(fecha({ fecha: f, updated_by: texto(preprodDoc.by) }, "updated_at", preprodDoc.at));
    }
  }
  const buenasDoc = docUnico(fs.buenas_noticias_suplentes, "list");
  for (const [semana, nombre] of Object.entries(esObjeto(buenasDoc?.suplentes) ? buenasDoc.suplentes : {})) {
    if (!DIA_RE.test(semana) || typeof nombre !== "string" || !nombre) { aviso(`buenas_noticias_suplentes: entrada inválida ${semana} → se omite`); continue; }
    filas.buenas_noticias_suplentes.push(fecha({ semana, nombre, updated_by: texto(buenasDoc!.by) }, "updated_at", buenasDoc!.at));
  }

  // Encuestas NPS
  const pendientes = new Map<string, TablesInsert<"surveys">>();
  for (const { id, data: d } of docs("surveys")) {
    let fila: TablesInsert<"surveys"> = {
      token: id,
      req_id: texto(d.reqId) ?? "",
      req_code: texto(d.reqCode) ?? "",
      req_name: texto(d.reqName) ?? "",
      pm: texto(d.pm) ?? "",
      assigned_email: (texto(d.assignedEmail) ?? "").toLowerCase(),
      assigned_name: texto(d.assignedName) ?? "",
      created_by_email: texto(d.createdByEmail) ?? "",
      cku: texto(d.cku) ?? "",
      answered: !!d.answered,
      answered_at: aIso(d.answeredAt) ?? null,
      invalidated: !!d.invalidated,
    };
    fila = fecha(fila, "created_at", d.createdAt);
    // Índice único: un solo link PENDIENTE por (REQ, persona, remitente). Si Firestore tiene dos
    // (carrera del código viejo), se queda el más reciente y se avisa.
    if (!fila.answered) {
      const k = `${fila.req_id}\u0001${fila.assigned_email}\u0001${fila.cku}`;
      const previa = pendientes.get(k);
      if (previa) {
        const [vieja, nueva] = (previa.created_at ?? "") <= (fila.created_at ?? "") ? [previa, fila] : [fila, previa];
        aviso(`surveys: dos links pendientes para ${fila.assigned_email} en REQ ${fila.req_id} — se omite ${vieja.token}, queda ${nueva.token}`);
        pendientes.set(k, nueva);
        continue;
      }
      pendientes.set(k, fila);
      continue;
    }
    filas.surveys.push(fila);
  }
  filas.surveys.push(...pendientes.values());
  for (const { id, data: d } of docs("survey_responses")) {
    filas.survey_responses.push(fecha({
      token: id,
      answers: (esObjeto(d.answers) ? d.answers : {}) as TablesInsert<"survey_responses">["answers"],
      respondent_email: texto(d.respondentEmail) ?? "",
    }, "submitted_at", d.submittedAt));
  }

  // Usuarios (la fila de app_users la arma el script con el id de Supabase Auth)
  const rolesValidos = new Set(filas.roles.map((r) => r.id));
  const porEmail = new Map<string, UsuarioFirestore>();
  for (const { id, data: d } of docs("users")) {
    const email = (texto(d.email) ?? "").trim().toLowerCase();
    if (!email) { aviso(`users/${id}: sin correo → se omite`); continue; }
    // Mismo arreglo que hacía ensureUser al leer: modelo viejo con `role` inline → roleId.
    let roleId: string | null = texto(d.roleId) ?? (d.role === "admin" ? BOOTSTRAP_ADMIN_ROLE_ID : DEFAULT_NEW_USER_ROLE_ID);
    if (!rolesValidos.has(roleId)) { aviso(`users/${id} (${email}): el rol «${roleId}» no existe → queda en espera`); roleId = null; }
    const u: UsuarioFirestore = {
      firebaseUid: id,
      email,
      displayName: texto(d.displayName) ?? email,
      roleId,
      defaultPage: texto(d.defaultPage),
      createdAt: aIso(d.createdAt),
      updatedAt: aIso(d.updatedAt),
    };
    const previo = porEmail.get(email);
    if (previo) {
      aviso(`users: ${email} aparece dos veces (${previo.firebaseUid}, ${id}) — se queda el más reciente`);
      if ((previo.updatedAt ?? "") > (u.updatedAt ?? "")) continue;
    }
    porEmail.set(email, u);
  }

  return { filas, usuarios: [...porEmail.values()], avisos };
}

/** Llave de una fila como string (para comparar con lo que ya hay en Supabase). */
export function llaveDe(tabla: Tabla, fila: Record<string, unknown>): string {
  return LLAVES[tabla].map((c) => String(fila[c])).join("\u0001");
}
