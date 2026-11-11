// El dashboard COMPLETO leído de Supabase (preparación de la Fase 6). Lógica PURA:
//   · personasAHrItems: el directorio (`personas`) con la forma del board Directorio RH de Monday,
//     para que los procesadores de la app (nombres por correo, roster de desarrollo…) no cambien.
//   · compararDashboard: el DashboardData armado con Monday contra el armado con los tableros,
//     sección por sección, y los indicadores del Control Tower lado a lado.
// Si el DashboardData sale igual, TODAS las páginas salen igual: Control Tower, Players,
// Portafolio, Proyectos… son funciones de ese mismo objeto.

import { computeWeeklySnapshotMetrics } from "@/lib/weeklySnapshot";
import { aplicarOnHold } from "@/lib/onHold";
import { splitBoardName } from "@/lib/proj";
import type { DashboardData, MondayColumnValue, MondayItem, ProjItem } from "@/types";
import { diferenciasPorId, diferenciasProfundas, diferenciasProjItems, separarExplicadas, separarPersonasFuera } from "./paridad";

// ── Directorio: personas → items del board Directorio RH ─────────────────────

export interface PersonaRh {
  id: string;
  nombre: string;
  email: string | null;
  grupo: string | null;
  rol: string | null;
  tld: string | null;
  hrsMes: number | null;
  activo: boolean;
  mondayItemId: string | null;
}

/** Qué dato de la persona va en cada columna del Directorio RH (por el TÍTULO de la columna). */
const CAMPO_POR_TITULO: Record<string, (p: PersonaRh) => string | null> = {
  email: (p) => p.email,
  role: (p) => p.rol,
  tld: (p) => p.tld,
  "hrs mes": (p) => (p.hrsMes === null ? null : String(p.hrsMes)),
  status: (p) => (p.activo ? "Active" : "Inactive"),
};

/**
 * El directorio con la forma de los items del board Directorio RH (mismos ids de columna, que
 * salen de `columnasRh`: id → título). Lo que el directorio no guarda (p. ej. «RH ID») va vacío.
 */
export function personasAHrItems(personas: PersonaRh[], columnasRh: Record<string, { title: string }>): MondayItem[] {
  const columnas = Object.entries(columnasRh).filter(([id]) => id !== "name");
  return [...personas]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map((p) => ({
      id: p.mondayItemId ?? p.id,
      name: p.nombre,
      email: null,
      group: { title: p.grupo ?? "" },
      column_values: columnas.map(([id, c]): MondayColumnValue => ({
        id, text: CAMPO_POR_TITULO[c.title.trim().toLowerCase()]?.(p) ?? null, column: { title: c.title },
      })),
    }));
}

// ── Comparar el dashboard armado con Monday y con Supabase ───────────────────

export interface SeccionParidad {
  clave: string;
  nombre: string;
  /** Cuántos registros hay de cada lado. */
  monday: number;
  supabase: number;
  /** Diferencias que nadie decidió (las de verdad). */
  total: number;
  muestra: string[];
  /** Diferencias decididas (p. ej. PM-018): su motivo y cuántas son. */
  explicadas: { motivo: string; cantidad: number }[];
  /** Valores con personas que no están en el directorio (en la app quedan vacíos): no cuentan. */
  avisos: string[];
}

export type EstadoKpi = "igual" | "explicada" | "distinta";
export interface KpiParidad { clave: string; etiqueta: string; monday: number | null; supabase: number | null; estado: EstadoKpi }

export interface ResultadoParidadDashboard {
  /** Sin diferencias de verdad (las decididas no cuentan). */
  igual: boolean;
  secciones: SeccionParidad[];
  kpis: KpiParidad[];
  /** Tableros de proyecto que existen solo en la app (no vienen de Monday): no son diferencia. */
  soloEnLaApp: string[];
  /** Personas que Monday tiene y el directorio no (las de los avisos), sin repetir. */
  personasFuera: string[];
}

const MUESTRA = 30;

/** `enDirectorio`: si se da, las diferencias que solo son «esta persona no está en el directorio» van a avisos. */
function armarSeccion(enDirectorio?: (nombre: string) => boolean) {
  return (clave: string, nombre: string, monday: number, supabase: number, difs: string[], explicadas: SeccionParidad["explicadas"] = []): SeccionParidad => {
    const p = enDirectorio ? separarPersonasFuera(difs, enDirectorio) : { diferencias: difs, avisos: [] };
    return { clave, nombre, monday, supabase, total: p.diferencias.length, muestra: p.diferencias.slice(0, MUESTRA), explicadas, avisos: p.avisos };
  };
}

/** Junta motivos repetidos sumando sus cantidades. */
function juntarExplicadas(listas: { motivo: string; cantidad: number }[][]): { motivo: string; cantidad: number }[] {
  const m = new Map<string, number>();
  for (const l of listas) for (const x of l) m.set(x.motivo, (m.get(x.motivo) ?? 0) + x.cantidad);
  return [...m].map(([motivo, cantidad]) => ({ motivo, cantidad }));
}

const KPIS: { clave: "evm" | "calidad" | "cumplimiento" | "nps"; etiqueta: string }[] = [
  { clave: "evm", etiqueta: "EVM del equipo (Salud)" },
  { clave: "calidad", etiqueta: "Calidad de Entregas" },
  { clave: "cumplimiento", etiqueta: "Cumplimiento de Entrega" },
  { clave: "nps", etiqueta: "NPS" },
];

/**
 * Compara el DashboardData armado con Monday (`a`) y con los tableros de Supabase (`b`).
 * `soloEnLaApp`: ids de board de los tableros que nacieron en la app (no tienen board en Monday).
 * `enDirectorio`: si se da, un valor de Monday con una persona que no está en el directorio es aviso.
 */
export function compararDashboard(
  a: DashboardData, b: DashboardData, soloEnLaApp: Set<string> = new Set(), enDirectorio?: (nombre: string) => boolean,
): ResultadoParidadDashboard {
  const secciones: SeccionParidad[] = [];
  const seccion = armarSeccion(enDirectorio);

  secciones.push(seccion("ini", "Iniciativas", a.ini.length, b.ini.length, diferenciasPorId(a.ini, b.ini)));
  secciones.push(seccion("req", "PML / VALOR Lite", a.req.length, b.req.length, diferenciasPorId(a.req, b.req)));

  // Proyectos: board por board, para apartar las diferencias decididas de ese board (por su código).
  const porBoard = (lista: ProjItem[]) => {
    const m = new Map<string, ProjItem[]>();
    for (const p of lista) m.set(p.boardId, [...(m.get(p.boardId) ?? []), p]);
    return m;
  };
  const projA = porBoard(a.proj);
  const projB = porBoard(b.proj);
  const nombreDe = new Map([...a.projBoards, ...b.projBoards].map((x) => [x.id, x.name]));
  const difProj: string[] = [];
  const explProj: { motivo: string; cantidad: number }[][] = [];
  /** Boards cuyas diferencias son TODAS decididas: lo que se deriva de ellas (su fila de board) también. */
  const boardsSoloDecididas = new Set<string>();
  const ids = [...new Set([...projA.keys(), ...projB.keys()])].filter((id) => !soloEnLaApp.has(id));
  for (const id of ids) {
    const nombre = nombreDe.get(id) ?? id;
    const sa = projA.get(id) ?? [];
    const sb = projB.get(id) ?? [];
    if (!sb.length && sa.length) { difProj.push(`${nombre}: está en Monday y no en Supabase`); continue; }
    if (!sa.length && sb.length) { difProj.push(`${nombre}: está en Supabase y no en Monday`); continue; }
    const e = separarExplicadas(splitBoardName(nombre).code || null, diferenciasProjItems(sa, sb), []);
    difProj.push(...e.diferencias.map((d) => `${nombre} · ${d}`));
    if (e.explicadas.length) { explProj.push(e.explicadas); if (!e.diferencias.length) boardsSoloDecididas.add(id); }
  }
  const nProj = (l: ProjItem[]) => l.filter((p) => !soloEnLaApp.has(p.boardId)).reduce((n, p) => n + 1 + p.subitems.length, 0);
  secciones.push(seccion("proj", "Proyectos (elementos y subelementos)", nProj(a.proj), nProj(b.proj), difProj, juntarExplicadas(explProj)));

  // Tableros de proyecto (PM, estrategia, sponsor, CKU…).
  const boardsA = a.projBoards.filter((x) => !soloEnLaApp.has(x.id));
  const boardsB = b.projBoards.filter((x) => !soloEnLaApp.has(x.id));
  const difBoards = diferenciasPorId(boardsA, boardsB);
  const derivadas = difBoards.filter((d) => [...boardsSoloDecididas].some((id) => d.startsWith(`«${nombreDe.get(id)}»`)));
  secciones.push(seccion("boards", "Proyectos (tableros)", boardsA.length, boardsB.length, difBoards.filter((d) => !derivadas.includes(d)),
    derivadas.length ? [{ motivo: "Se deriva de una diferencia decidida de ese proyecto.", cantidad: derivadas.length }] : []));

  // Estrategia (U Neg, País) y Directorio (correo → nombre, equipo de desarrollo).
  const est = (d: DashboardData) => [...d.estrategiaMap].sort(([x], [y]) => x.localeCompare(y));
  secciones.push(seccion("est", "Estrategia", a.estrategiaMap.size, b.estrategiaMap.size, diferenciasProfundas("Estrategia", est(a), est(b))));
  const dir = (d: DashboardData) => ({ directorio: d.directorio, equipoDesarrollo: [...d.devTeamRoster].sort() });
  secciones.push(seccion("dir", "Directorio", a.directorio.length, b.directorio.length, diferenciasProfundas("Directorio", dir(a), dir(b))));

  // Indicadores del Control Tower (los mismos que guarda el histórico semanal).
  const ka = computeWeeklySnapshotMetrics(aplicarOnHold(a), 0);
  const kb = computeWeeklySnapshotMetrics(aplicarOnHold(b), 0);
  const reales = secciones.reduce((n, s) => n + s.total, 0);
  const hayDecididas = secciones.some((s) => s.explicadas.length);
  const kpis: KpiParidad[] = KPIS.map(({ clave, etiqueta }) => {
    const m = ka[clave];
    const s = kb[clave];
    const igual = m === s || (typeof m === "number" && typeof s === "number" && Math.abs(m - s) < 1e-9);
    // Si los datos solo difieren en lo decidido, un indicador distinto es consecuencia de eso.
    return { clave, etiqueta, monday: m, supabase: s, estado: igual ? "igual" : !reales && hayDecididas ? "explicada" : "distinta" };
  });

  return {
    igual: reales === 0 && kpis.every((k) => k.estado !== "distinta"),
    secciones, kpis,
    soloEnLaApp: [...soloEnLaApp].map((id) => b.projBoards.find((x) => x.id === id)?.name ?? id),
    personasFuera: [...new Set(secciones.flatMap((s) => s.avisos).map((d) => d.match(/: Monday "(.+)" ≠ app/)?.[1] ?? "").filter(Boolean))].sort(),
  };
}
