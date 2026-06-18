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

/** Payload completo que devuelve `GET /api/dashboard`. */
export interface DashboardRaw {
  iniItems: MondayItem[];
  reqItems: MondayItem[];
  hrItems: MondayItem[]; // Directorio RH (email → nombre del recurso)
  projBoards: { id: string; name: string }[];
  projRaw: ProjBoardRaw[];
  calData: CalMeetingRaw[];
  sheetRows: SheetRow[];
  baselines: Record<string, ReqBaseline>;
  projItemBaselines: Record<string, ProjItemBaseline>;
  fetchedAt: string;
}

// ── Datos PROCESADOS (lado cliente) ────────────────────────────────────
export interface IniItem {
  id: string;
  name: string;
  grupo: string;
  pm: string;
  status: string;
  benefit: string;
  estado: string; // ATRASADO | PARA HOY | EN TIEMPO | APROBADA | EN_ESPERA | PLAN_FUTURO | SKIP | Sin fecha
  dias: number | null;
  limite: number | null;
  deadline: Date | null;
  creacion: Date | null;
  meet1?: string;
  meet2?: string;
  espera?: string;
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

export interface ReqItem {
  id: string;
  name: string;
  grupo: string;
  pm: string;
  resp: string;
  status: string;
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
  status: string;
  person: string;
  deadline: Date | null;
  estado: string;
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
  status: string;
  deadline: Date | null;
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
export interface DashboardData {
  ini: IniItem[];
  req: ReqItem[];
  proj: ProjItem[];
  projBoards: ProjBoard[];
  projItemBaselines: Record<string, ProjItemBaseline>;
  calMap: CalMap;
  nps: NpsData;
  fetchedAt: Date;
}
