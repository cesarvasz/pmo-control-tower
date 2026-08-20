// src/lib/monday.ts
// SOLO SERVIDOR. Usa MONDAY_API_KEY (sin NEXT_PUBLIC_) → nunca llega al cliente.
// Este módulo solo debe importarse desde Route Handlers / código de servidor.

import type {
  CalMeetingRaw,
  DashboardRaw,
  MondayItem,
  ProjBoardRaw,
  ReminderEnvio,
  SheetRow,
} from "@/types";

const MONDAY_URL = "https://api.monday.com/v2";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name} en .env.local`);
  return v;
}

interface MondayResponse<T> {
  data: T;
  errors?: { message: string }[];
}

async function mondayFetch<T>(query: string): Promise<T> {
  const res = await fetch(MONDAY_URL, {
    method: "POST",
    headers: {
      Authorization: env("MONDAY_API_KEY"),
      "Content-Type": "application/json",
      "API-Version": "2024-01",
    },
    body: JSON.stringify({ query }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Monday HTTP ${res.status}`);
  const json = (await res.json()) as MondayResponse<T>;
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

/** Web App de Google: ahora devuelve calendario + hoja en un solo objeto.
 *  Retrocompatible: si la respuesta es un array (formato viejo) = solo calendario. */
async function fetchWebApp(): Promise<{ calData: CalMeetingRaw[]; sheetRows: SheetRow[] }> {
  try {
    const res = await fetch(env("CALENDAR_WEBAPP_URL"), {
      redirect: "follow",
      cache: "no-store",
    });
    const json = await res.json();
    if (Array.isArray(json)) {
      return { calData: json as CalMeetingRaw[], sheetRows: [] };
    }
    return {
      calData: (json.calendar ?? []) as CalMeetingRaw[],
      sheetRows: (json.sheet ?? []) as SheetRow[],
    };
  } catch (e) {
    console.warn("WebApp fetch failed:", e);
    return { calData: [], sheetRows: [] };
  }
}

/** Web App del Apps Script de recordatorios: devuelve el registro de correos enviados.
 *  Opcional: si REMINDERS_WEBAPP_URL no está configurado o falla, retorna []. */
async function fetchReminderLog(): Promise<ReminderEnvio[]> {
  const url = process.env.REMINDERS_WEBAPP_URL;
  if (!url) return [];
  try {
    const res = await fetch(url, { redirect: "follow", cache: "no-store" });
    const json = await res.json();
    return (json.envios ?? []) as ReminderEnvio[];
  } catch (e) {
    console.warn("Reminder log fetch failed:", e);
    return [];
  }
}

// ── Queries ────────────────────────────────────────────────────────────
const boardItemsQuery = (boardId: string) =>
  `{ boards(ids:[${boardId}]) { items_page(limit:500) { items { id name group { title } column_values { id text } } } } }`;

// Query "rica": además del texto y el título de columna (para match por nombre, ej. CKU),
// trae display_value de columnas mirror/board_relation (Estrategia, Sponsor).
// Se usa para Iniciativas y REQ (ambos con relación a "Estrategia 🔝").
const richBoardQuery = (boardId: string) =>
  `{ boards(ids:[${boardId}]) { items_page(limit:500) { items { id name group { title } column_values { id text column { title } ... on MirrorValue { display_value } ... on BoardRelationValue { display_value } } } } } }`;

// Board "Estrategia 🔝": nombre + U Neg + País + Sponsor (people; suele venir como email).
const estBoardQuery = (boardId: string) =>
  `{ boards(ids:[${boardId}]) { items_page(limit:500) { items { id name column_values(ids:["text_mkx5ehzc","text_mkx5fa5a","multiple_person_mkz54zk0"]) { id text } } } } }`;

const projBoardsQuery = (ids: string) =>
  `{ boards(ids:[${ids}]) { id name items_page(limit:500) { items { id name group { title } column_values { id text column { title } ... on BoardRelationValue { display_value } ... on MirrorValue { display_value } } subitems { id name column_values { id text column { title } ... on BoardRelationValue { display_value } ... on MirrorValue { display_value } } } } } } }`;

async function discoverProjBoards(): Promise<{ id: string; name: string }[]> {
  const data = await mondayFetch<{
    folders: { children: { id: string; name: string }[] }[];
  }>(`{ folders(ids:[${env("MONDAY_PROJ_FOLDER_ID")}]) { children { id name } } }`);
  return data.folders?.[0]?.children ?? [];
}

// ── Caché en memoria (TTL) + single-flight ───────────────────────────────
// El fetch a Monday/Apps Script es la parte cara y con rate-limit. Se cachea
// una ventana corta y se coalescen las peticiones concurrentes (una sola
// llamada en vuelo). Ante un fallo transitorio se sirve la última copia buena.
const DASHBOARD_TTL_MS = 60_000;
let dashboardCache: { data: DashboardRaw; at: number } | null = null;
let dashboardInflight: Promise<DashboardRaw> | null = null;

/** Single Fetch con caché TTL, coalescencia de peticiones y fallback a copia previa. */
export async function fetchDashboardRaw(): Promise<DashboardRaw> {
  if (dashboardCache && Date.now() - dashboardCache.at < DASHBOARD_TTL_MS) {
    return dashboardCache.data;
  }
  if (dashboardInflight) return dashboardInflight;

  dashboardInflight = (async () => {
    try {
      const data = await fetchDashboardRawUncached();
      dashboardCache = { data, at: Date.now() };
      return data;
    } catch (err) {
      // Resiliencia: si hay una copia previa (aunque esté vencida) se sirve,
      // para sobrevivir a caídas transitorias de Monday/Apps Script.
      if (dashboardCache) {
        console.warn("fetchDashboardRaw falló; se sirve la copia en caché:", err);
        return dashboardCache.data;
      }
      throw err;
    } finally {
      dashboardInflight = null;
    }
  })();

  return dashboardInflight;
}

/** Trae TODO de Monday/Apps Script en paralelo y devuelve datos crudos serializables.
 *  Degrada con parciales: las fuentes de enriquecimiento (RH, Estrategia, calendario,
 *  boards de Proyectos) que fallen quedan vacías; Iniciativas y REQ son obligatorias. */
async function fetchDashboardRawUncached(): Promise<DashboardRaw> {
  const iniId = env("MONDAY_INI_BOARD_ID");
  const reqId = env("MONDAY_REQ_BOARD_ID");
  // Board "Directorio RH": el nombre del item es el nombre del recurso; email en email_mkz5qg4v.
  const rhId  = env("MONDAY_RH_BOARD_ID");
  // Board "Estrategia 🔝": fuente de U Neg/País. Configurable; default al id descubierto.
  const estId = process.env.MONDAY_EST_BOARD_ID || "18291587533";

  // 1ª tanda en paralelo: ini, req, RH, Estrategia, web app (calendario + hoja) y descubrir boards.
  // allSettled → una fuente que falle no tumba todo el dashboard.
  type BoardsResp = { boards: { items_page: { items: MondayItem[] } }[] };
  const emptyBoards: BoardsResp = { boards: [] };
  const [iniR, reqR, rhR, estR, webAppR, projBoardsR, reminderLogR] = await Promise.allSettled([
    mondayFetch<BoardsResp>(richBoardQuery(iniId)),
    mondayFetch<BoardsResp>(richBoardQuery(reqId)),
    mondayFetch<BoardsResp>(boardItemsQuery(rhId)),
    mondayFetch<BoardsResp>(estBoardQuery(estId)),
    fetchWebApp(),
    discoverProjBoards(),
    fetchReminderLog(),
  ]);

  // Iniciativas y REQ son obligatorias: si fallan, se propaga el error
  // (el wrapper con caché servirá la última copia buena si existe).
  const reason = (r: PromiseRejectedResult) => (r.reason instanceof Error ? r.reason.message : String(r.reason));
  if (iniR.status === "rejected") throw new Error(`Iniciativas: ${reason(iniR)}`);
  if (reqR.status === "rejected") throw new Error(`REQ: ${reason(reqR)}`);
  const iniData = iniR.value;
  const reqData = reqR.value;

  // Enriquecimiento opcional: si falla, se degrada a vacío (con aviso).
  const soft = <T>(r: PromiseSettledResult<T>, fallback: T, label: string): T => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`${label} falló; se degrada a vacío:`, r.reason);
    return fallback;
  };
  const rhData = soft(rhR, emptyBoards, "Directorio RH");
  const estData = soft(estR, emptyBoards, "Estrategia");
  const webApp = soft(webAppR, { calData: [] as CalMeetingRaw[], sheetRows: [] as SheetRow[] }, "WebApp");
  const projBoards = soft(projBoardsR, [] as { id: string; name: string }[], "Boards de Proyectos");
  const reminderLog = soft(reminderLogR, [] as ReminderEnvio[], "Registro de recordatorios");

  // 2ª tanda: items de todos los boards de proyectos (depende del descubrimiento).
  let projRaw: ProjBoardRaw[] = [];
  if (projBoards.length) {
    const ids = projBoards.map((b) => b.id).join(",");
    const data = await mondayFetch<{ boards: ProjBoardRaw[] }>(projBoardsQuery(ids));
    projRaw = data.boards ?? [];
  }

  return {
    iniItems: iniData.boards[0]?.items_page.items ?? [],
    reqItems: reqData.boards[0]?.items_page.items ?? [],
    hrItems: rhData.boards[0]?.items_page.items ?? [],
    estrategiaItems: estData.boards[0]?.items_page.items ?? [],
    projBoards,
    projRaw,
    calData: webApp.calData,
    sheetRows: webApp.sheetRows,
    baselines: {},          // el route handler inyecta los baselines de REQ desde Firestore
    projItemBaselines: {}, // el route handler inyecta los baselines de Proyectos desde Firestore
    npsRecords: [],        // el route handler inyecta las respuestas de encuestas desde Firestore
    delayAttributions: {}, // el route handler inyecta los responsables de atraso desde Firestore
    reprocesoAttributions: {}, // el route handler inyecta los responsables de reproceso desde Firestore
    reminderLog,
    fetchedAt: new Date().toISOString(),
  };
}
