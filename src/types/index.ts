// src/types/index.ts
// Tipos compartidos entre la API route (datos crudos) y el cliente (datos procesados).

// ── Datos CRUDOS que devuelve Monday / la API route ────────────────────
export interface MondayColumnValue {
  id: string;
  text: string | null;
  column?: { title: string } | null;
  display_value?: string | null; // valor de columnas mirror / board_relation
}

export interface MondaySubitem {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
}

export interface MondayItem {
  id: string;
  name: string;
  group: { title: string };
  column_values: MondayColumnValue[];
  subitems?: MondaySubitem[];
}

export interface ProjBoardRaw {
  id: string;
  name: string;
  items_page: { items: MondayItem[] };
}

export interface CalMeetingRaw {
  codigo: string;
  meeting: string; // "M1" | "M2"
  inicio: string;
  fin: string;
}

/** Fila cruda de la hoja de Google (encabezados dinámicos → claves). */
export type SheetRow = Record<string, string | number>;

/** Fila de la hoja "ROI" (Google Sheets, pestaña "003") — un expediente C807 por
 *  fila, en formato ANCHO: cada hito del trámite es una columna con su fecha.
 *  Fuente independiente del resto del dashboard (ver apps-script/roi-log.gs).
 *  Claves = nombres exactos de columna en la hoja.
 *
 *  Nota: un mismo c807_file puede repetirse en varias filas cuando alguna
 *  dimensión difiere (hoy solo `Proceso`: Aduana / Importación). */
export interface RoiRow {
  c807_file: string;
  Proceso: string;
  Cliente: string;
  Usuario: string;
  Analista: string;
  Embarque: string;
  Documento: string;
  Mesa: string;
  Docalpha: string;
  // Hitos (fechas). Vacío = el expediente no alcanzó ese hito.
  Creado: string;
  DPR: string;
  Clasificacion_exacta: string;
  Creacion_Pre_DUCA: string;
  Revision_Analista: string;
  Solicitar_firma_def: string;
  // Digitalización. Vienen como número en la hoja; el decodificador los pasa a
  // texto y lib/tramites.ts los convierte de vuelta.
  "Documents Count": string;
  "Pages Count": string;
  Licencias: string;
  Costo: string;
}

/**
 * Hoja ROI tal como la manda el Apps Script: codificada, no en filas crudas.
 * Los textos que se repiten van por diccionario y las fechas como segundos desde
 * `epoca` — 27.6 MB pasan a 5.0 MB. `src/lib/roi.ts` la decodifica a `RoiRow[]`.
 *
 * Cada fila es posicional: primero las columnas `libres` (texto tal cual), luego
 * un índice de `dicc` por cada columna de `textos`, luego los segundos de cada
 * columna de `fechas` (null si el hito no ocurrió).
 */
export interface RoiPayload {
  epoca: number;
  /** ISO de cuándo el Apps Script armó el caché. Ausente si lo generó al vuelo. */
  generado?: string;
  libres: string[];
  textos: string[];
  fechas: string[];
  dicc: Record<string, string[]>;
  filas: (string | number | null)[][];
}

/** Fila del archivo "Clonacion files" (Google Sheets, pestaña "clonacion") —
 *  un archivo DISTINTO al de la hoja ROI de 003. Una clonación de file por
 *  fila. Fuente independiente de 003 (ver apps-script/roi-clonacion.gs).
 *  Claves = nombres exactos de columna en la hoja.
 *
 *  Nota: un mismo c807_file puede repetirse (varias clonaciones del mismo
 *  file) — no se deduplica. */
export interface ClonacionRow {
  c807_file: string;
  Solicitud_fecha: string;
  Creacion_Fecha: string;
  Usuario: string;
  Cliente: string;
}

/** Hoja "Clonación" tal como la manda el Apps Script: codificada, mismo
 *  esquema que RoiPayload (ver apps-script/roi-clonacion.gs). */
export interface ClonacionPayload {
  epoca: number;
  generado?: string;
  libres: string[];
  textos: string[];
  fechas: string[];
  dicc: Record<string, string[]>;
  filas: (string | number | null)[][];
}

/** Costo planificado de un REQ guardado en Firestore (baseline para EV/CPI). */
export interface ReqBaseline {
  costRH: number;
  costSft: number;
  savedAt: string;
}

/** Costo planificado de un item de Proyecto guardado en Firestore (baseline para EV). */
export interface ProjItemBaseline {
  boardId: string;
  cost: number;
  savedAt: string;
}

// ── Atribución de responsable (compartida por Entrega/atraso y Reproceso) ──
// Se asigna manualmente. Solo el valor "PM" (o sin asignar, en scope) penaliza la
// métrica asociada (% de Compromiso de Entregas y % de Reproceso del KPI).
// "Sin reproceso" es una opción exclusiva del dropdown de Reproceso: significa que
// la unidad no tuvo reproceso, por lo que NO penaliza (se excusa como cualquier ≠ PM).
export type DelayResponsible = "VPA" | "CKU" | "PM" | "Sponsor" | "Desarrollador" | "BRM" | "Sin reproceso";
export interface DelayAttribution {
  responsible: DelayResponsible;
  by?: string;  // correo del admin que la asignó
  at?: string;  // ISO timestamp
}
/** Tipos de atribución persistidos por ítem, cada uno en su colección Firestore. */
export type AttributionKind = "delay" | "reproceso";

// ── Detalle de un atraso (tabla "Atrasos" del Resumen Ejecutivo) ───────────
// Documentación libre de un step atrasado/stuck (tabla Atrasos): un ROL
// (mismo catálogo DELAY_RESPONSIBLES que usa ResponsibleSelect para
// Entrega/atraso y Reproceso — VPA/CKU/PM/Sponsor/Desarrollador/BRM) y un
// texto explicando el motivo. Editable por cualquier usuario con acceso a la
// página Resumen Ejecutivo (no requiere ser Admin).
export interface AtrasoDetalle {
  responsable?: string; // rol — ver DELAY_RESPONSIBLES en lib/delay.ts
  motivo?: string;      // texto libre
  by?: string;          // correo de quien lo guardó
  at?: string;           // ISO timestamp
}

/** Payload completo que devuelve `GET /api/dashboard`. */
export interface DashboardRaw {
  iniItems: MondayItem[];
  reqItems: MondayItem[];
  hrItems: MondayItem[]; // Directorio RH (email → nombre del recurso)
  estrategiaItems: MondayItem[]; // Board "Estrategia 🔝" (U Neg, País por estrategia)
  projBoards: { id: string; name: string }[];
  projRaw: ProjBoardRaw[];
  calData: CalMeetingRaw[];
  sheetRows: SheetRow[];
  baselines: Record<string, ReqBaseline>;
  projItemBaselines: Record<string, ProjItemBaseline>;
  npsRecords: NpsRecord[]; // respuestas de encuestas (Firestore) para el NPS
  delayAttributions: Record<string, DelayAttribution>; // itemId → responsable del atraso (Firestore)
  reprocesoAttributions: Record<string, DelayAttribution>; // itemId → responsable del reproceso (Firestore)
  atrasoDetalles: Record<string, AtrasoDetalle>; // itemId → detalle del atraso (Firestore) — tabla Atrasos
  reminderLog: ReminderEnvio[]; // registro de correos "Sin Valor Def" enviados por Apps Script
  fetchedAt: string;
}

/** Una fila del registro "Envios" del Apps Script de recordatorios (Sin Valor Def). */
export interface ReminderEnvio {
  fecha: string;   // yyyy-mm-dd del envío
  itemId: string;  // id de Monday
  iniId: string;   // Ini ID (ej. "IN-030") — clave de match con IniItem.id
  nombre: string;
  para: string;    // destinatario (CKU Mail)
  cc: string;      // CC (PM)
  numero: number | null; // # de correo (1..4)
  espera: string;  // fecha En Espera
}

/** Registro agregado por Ini ID: cuántos correos y la fecha del último. */
export interface ReminderRecord { count: number; lastSent: Date | null; }

// ── Datos PROCESADOS (lado cliente) ────────────────────────────────────
export interface IniItem {
  id: string;
  name: string;
  grupo: string;
  pm: string;
  status: string;
  benefit: string;
  estado: string; // ATRASADO | PARA HOY | EN TIEMPO | APROBADA | EN_ESPERA | PLAN_FUTURO | POR_DEFINIR | CAMBIO_ESTRATEGIA | SKIP | Sin fecha
  dias: number | null;
  limite: number | null;
  deadline: Date | null;
  creacion: Date | null;
  meet1?: string;
  meet2?: string;
  espera?: string;
  pku?: string;       // checkbox PKU (marcado = no se envían recordatorios) — solo EN_ESPERA
  ckuMail?: string;   // email del CKU (destinatario del recordatorio) — solo EN_ESPERA
  planFuturo?: Date | null;
  recordatorio?: Date | null;
}

/** Costo y estado de una fase REQ (base del cálculo EV/PV). */
export interface ReqPhaseInfo {
  name: string;
  cost: number;     // costo asignado a la fase (tarifa × horas, o Costo Soft en Desarrollo)
  durDays: number;  // duración planificada en días hábiles
  done: boolean;    // fase completada (cuenta en EV)
  inPv: boolean;    // según cronograma ya debería estar cerrada (cuenta en PV)
}

/** Cumplimiento de plazo de una fase: fecha real de fin vs objetivo (mismas reglas del deadline). */
export interface ReqPhaseOnTime {
  name: string;          // Valuación | Aprobación | Desarrollo | Operación
  actual: Date | null;   // fecha real de fin de la fase
  target: Date | null;   // objetivo de fin de la fase
  late: boolean;         // fin real posterior al objetivo
  slipDays: number;      // días hábiles de atraso (0 si a tiempo)
}

/** Veredicto de entrega del REQ: se evalúa la ÚLTIMA fase completada (la entrega). */
export interface ReqOnTime {
  verdict: "on-time" | "late" | "n/a"; // n/a si no hay ninguna fase con fecha real y objetivo
  deliveryPhase: string | null;         // última fase evaluada (la entrega)
  slipDays: number;                     // días hábiles de atraso de la entrega (0 si a tiempo)
  phases: ReqPhaseOnTime[];             // desglose por fase (para el tooltip)
}

export interface ReqItem {
  id: string;
  name: string;
  grupo: string;
  pm: string;
  resp: string;
  status: string;
  estrategia: string; // nombre del ítem de Estrategia 🔝 (relación board_relation_mm3g4b09)
  cku: string;        // nombre del CKU (relación board_relation_mm3gzm38, display_value)
  costRH: number;
  costSft: number;
  benefit: number;
  valueNet: number;
  tld: string;
  type: string;
  cpmEndEst: Date | null;
  creation: string;
  estado: string; // ATRASADO | PARA HOY | EN TIEMPO | EN PROCESO | CERRADO | EN_ESPERA
  deadline: Date | null;
  inicioReq: Date | null;
  inicio: Date | null;
  dias: number | null;
  limite: number | null;
  elapsed: number | null;
  expectedDays: number | null;
  estDev: Date | null;
  phases: ReqPhaseInfo[];
  onTime: ReqOnTime;
  benefitType: string; // "Benefit Type" de la Iniciativa del mismo nombre (SoftSaving/HardSaving/"")
  ev: number;
  pv: number;
  ac: number;
  spi: number | null;
  cpi: number | null;
  scope: number | null;
  vem: number | null;
}

export interface ProjSubitem {
  id: string;
  name: string;
  pmsId: string; // ID del hito desde la columna "PMS ID" de Monday (ej. PMO-002-1)
  status: string;
  person: string;
  responsible: string; // "Responsible" del subelemento (board_relation, display_value)
  developer: string; // "Developer" del subelemento (board_relation, display_value)
  tld: string;       // "TLD" del subelemento (lookup, display_value)
  deadline: Date | null;
  estado: string;
  startDate: Date | null;                     // fecha real de inicio del hito (solo plantilla nueva, vía Timeline; null si Monday no lo registra)
  actualEnd: Date | null;                     // "Actual End": fecha real de cierre del hito
  entrega: "on-time" | "late" | null;         // a tiempo si Actual End ≤ Limit Date (solo Done)
  cost: number;
  benefit: number;
}

export interface ProjItem {
  boardId: string;
  boardName: string;
  id: string;
  name: string;
  grupo: string;
  pm: string;
  resp: string;
  responsible: string; // columna "Responsible" (board_relation) — fallback cuando "Resp" viene vacío
  status: string;
  deadline: Date | null;
  startDate: Date | null;                     // "Start Date": fecha real de inicio del item
  endDate: Date | null;                       // "End Date": fecha real de cierre del item
  entrega: "on-time" | "late" | null;         // a tiempo si End Date ≤ Limit Date (solo Done)
  cost: number;
  benefit: number;
  valueNet: number;
  estado: string;
  subitems: ProjSubitem[];
}

export interface ProjBoard {
  id: string;
  name: string;
  pm: string;
  estrategia?: string; // lookup desde la Iniciativa con el mismo nombre
  sponsor?: string;    // lookup desde la Iniciativa con el mismo nombre
  cku?: string;        // lookup desde la Iniciativa (columna "CKU")
  benefitType?: string; // "Benefit Type" de la Iniciativa (SoftSaving/HardSaving/"")
}

export interface CalMeeting {
  inicio: Date;
  fin: Date;
}

export type CalMap = Map<string, { M1: CalMeeting[]; M2: CalMeeting[] }>;

/** Una respuesta individual de la encuesta PMO. */
export interface NpsResponse {
  timestamp: string;
  email: string;
  score: number | null;   // puntaje 0-10
  category: "promoter" | "passive" | "detractor" | null;
  reason: string;
  answers: { question: string; value: string }[]; // ítems Likert respondidos
}

/** Promedio (%) de una pregunta Likert sobre todas las respuestas. */
export interface NpsQuestionAvg {
  question: string;
  avg: number;    // 0-100 (escala 20% por nivel)
  count: number;  // respuestas dadas a esta pregunta
}

/** Respuesta cruda de encuesta (Firestore) lista para el cálculo de NPS.
 *  `answers` viene indexado por id de pregunta (nps, razon, G1…H2). */
export interface NpsRecord {
  answers: Record<string, string | number>;
  pm: string;              // PM del REQ asociado (vacío para respuestas importadas del Sheet)
  invalidated: boolean;    // excluida de métricas si true
  respondentEmail: string;
  submittedAt: string;
  reqCode: string;
}

/** Resultado del NPS (encuesta PMO). */
export interface NpsData {
  nps: number | null;   // -100 a 100
  promoters: number;    // respuestas 9-10
  passives: number;     // respuestas 7-8
  detractors: number;   // respuestas 0-6
  total: number;
  responses: NpsResponse[];
  questions: NpsQuestionAvg[];  // % promedio por pregunta
  overallAvg: number | null;    // promedio total de todas las preguntas
}

/** Datos ya procesados que expone el DataContext a las páginas. */
/** Entrada del Directorio RH (para el dropdown de destinatarios de encuestas). */
export interface DirectorioEntry {
  name: string;
  email: string;
}

/** Unidad de Negocio, País y Sponsor de una Estrategia (board "Estrategia 🔝"). */
export interface EstrategiaInfo {
  uNeg: string;
  pais: string;
  sponsor: string; // nombre resuelto vía Directorio RH (la columna trae email)
}

export interface DashboardData {
  ini: IniItem[];
  req: ReqItem[];
  proj: ProjItem[];
  projBoards: ProjBoard[];
  projItemBaselines: Record<string, ProjItemBaseline>;
  calMap: CalMap;
  nps: NpsData;                // NPS global (fuente: Firestore)
  npsRecords: NpsRecord[];     // respuestas crudas para NPS por PM
  delayAttributions: Record<string, DelayAttribution>; // itemId → responsable del atraso
  reprocesoAttributions: Record<string, DelayAttribution>; // itemId → responsable del reproceso
  atrasoDetalles: Record<string, AtrasoDetalle>; // itemId → detalle del atraso — tabla Atrasos
  directorio: DirectorioEntry[];
  /** nombre-normalizado de Estrategia → { U Neg, País }. */
  estrategiaMap: Map<string, EstrategiaInfo>;
  /** Ini ID → { count, lastSent } de correos "Sin Valor Def" ya enviados. */
  reminderMap: Map<string, ReminderRecord>;
  fetchedAt: Date;
}
