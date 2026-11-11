// src/lib/portafolio.ts
// Dashboard de Portafolio (/portafolio): una sola vista con la salud, el avance, los hitos y los
// atrasos de TODOS los Proyectos y PML, filtrable por PM, Clase, Unidad de Negocio y Tipo.
// No inventa métricas: la salud de cada proyecto es la de buildBoardMaps (la misma del Control
// Tower), la de un PML es su VEM, y el EVM se pondera por Clase con partesEvm/weightedEvm, así
// que sin filtros da exactamente el «EVM · PMO» del Control Tower.
// Módulo PURO. Recibe el `data` SIN lo que está en On Hold (ver aplicarOnHold).

import { businessDays } from "@/lib/business";
import { claseDeBoard, claseDePml, type Clase } from "@/lib/claseProyecto";
import { isFase2, sinLetraDeFase } from "@/lib/dashboard";
import { classifyDev } from "@/lib/devTimeline";
import { partesEvm } from "@/lib/evmClase";
import { healthStatusFromIndex, type HealthStatus, type PartesEvm } from "@/lib/health";
import { calcIniPMHealth } from "@/lib/ini";
import { lookupEstrategia, type BoardHealthData } from "@/lib/proj";
import { buildProjectSummary, currentPhaseIndex } from "@/lib/projSummary";
import { REQ_ACTIVE_GRUPOS } from "@/lib/req";
import { codigoYNombre } from "@/lib/clasificacion";
import type { CalMap, DashboardData, IniItem, ProjItem, ReqItem } from "@/types";

export type TipoPortafolio = "proyecto" | "pml";

/** Un Proyecto o un PML del portafolio. */
export interface ElementoPortafolio {
  tipo: TipoPortafolio;
  /** Id del board (proyecto) o del item (PML). */
  id: string;
  codigo: string;
  nombre: string;
  pm: string;
  clase: Clase;
  /** Unidad de Negocio de su Estrategia; "" si no la tiene. */
  uNeg: string;
  /** País de su Estrategia; "" si no lo tiene. */
  pais: string;
  /** Nota EVM (0–1): índice del board o VEM del PML; null si no se puede calcular. */
  healthIndex: number | null;
  salud: HealthStatus | null;
  /** Fase en la que va (proyecto: la primera que no está 100 % Done; PML: su grupo). */
  fase: string;
  /** Proyecto completo. Cuenta en el EVM (igual que en el Control Tower) pero no en las listas
   *  de lo activo. Un PML del portafolio nunca está completo (los CERRADOS no entran). */
  completo: boolean;
}

/** Una actividad con fecha: el hito (subitem) de un proyecto, o el item si no tiene hitos; un PML
 *  cuenta como UNA actividad con la fecha límite de su fase. */
export interface ActividadPortafolio {
  tipo: TipoPortafolio;
  /** Id del Proyecto o PML al que pertenece. */
  elementoId: string;
  codigo: string;
  /** Nombre del Proyecto o PML. */
  elemento: string;
  id: string;
  nombre: string;
  fase: string;
  responsable: string;
  status: string;
  /** ATRASADO | PARA HOY | EN TIEMPO | … (lo calcula el procesamiento de Monday). */
  estado: string;
  limite: Date | null;
  /** «New Limit Date» si la fecha original se movió. */
  nuevaFecha: Date | null;
  /** Fecha real de cierre (Actual End / End Date). */
  fin: Date | null;
  done: boolean;
}

export interface FiltrosPortafolio {
  tipo: "todos" | TipoPortafolio;
  pm: string[];
  clase: string[];
  uNeg: string[];
  pais: string[];
}

export const SIN_FILTROS_PORTAFOLIO: FiltrosPortafolio = { tipo: "todos", pm: [], clase: [], uNeg: [], pais: [] };

export const hayFiltroPortafolio = (f: FiltrosPortafolio) =>
  f.tipo !== "todos" || f.pm.length > 0 || f.clase.length > 0 || f.uNeg.length > 0 || f.pais.length > 0;

// ── Elementos y actividades ─────────────────────────────────────────────

/** Todos los Proyectos (también los completos) y los PML activos (REQ_ACTIVE_GRUPOS: los mismos
 *  que cuentan en el EVM), con su salud, clase, Unidad de Negocio y fase. Primero los proyectos
 *  por su ID y luego los PML en orden natural. */
export function elementosPortafolio(
  data: Pick<DashboardData, "projBoards" | "proj" | "req" | "clases" | "estrategiaMap">,
  boardHealthMap: Map<string, BoardHealthData>,
): ElementoPortafolio[] {
  const itemsPorBoard = agruparPorBoard(data.proj);
  const out: ElementoPortafolio[] = [];

  for (const b of data.projBoards) {
    const { code, name } = codigoYNombre(b.name);
    const { phases, completion } = buildProjectSummary(itemsPorBoard.get(b.id) ?? []);
    const idx = currentPhaseIndex(phases);
    const healthIndex = boardHealthMap.get(b.id)?.healthIndex ?? null;
    out.push({
      tipo: "proyecto", id: b.id, codigo: code || b.name, nombre: code ? name : "",
      pm: b.pm || "", clase: claseDeBoard(b, data.clases),
      uNeg: lookupEstrategia(data.estrategiaMap, b.estrategia ?? "")?.uNeg || "",
      pais: (lookupEstrategia(data.estrategiaMap, b.estrategia ?? "")?.pais || "").trim(),
      healthIndex, salud: healthStatusFromIndex(healthIndex),
      fase: completion.isComplete ? "Completado" : idx >= 0 ? sinLetraDeFase(phases[idx].grupo) : "—",
      completo: completion.isComplete,
    });
  }

  for (const r of data.req) {
    if (!REQ_ACTIVE_GRUPOS.has(r.grupo)) continue;
    out.push({
      tipo: "pml", id: r.id, codigo: r.id, nombre: r.name,
      pm: r.pm || "", clase: claseDePml(r.id, data.clases),
      uNeg: lookupEstrategia(data.estrategiaMap, r.estrategia)?.uNeg || "",
      pais: (lookupEstrategia(data.estrategiaMap, r.estrategia)?.pais || "").trim(),
      healthIndex: r.vem, salud: healthStatusFromIndex(r.vem),
      fase: r.grupo, completo: false,
    });
  }

  return out.sort((a, b) =>
    (a.tipo === b.tipo ? 0 : a.tipo === "proyecto" ? -1 : 1)
    || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
}

function agruparPorBoard(proj: ProjItem[]): Map<string, ProjItem[]> {
  const m = new Map<string, ProjItem[]>();
  for (const it of proj) {
    const arr = m.get(it.boardId);
    if (arr) arr.push(it); else m.set(it.boardId, [it]);
  }
  return m;
}

/** Las actividades de los elementos ACTIVOS que se pasan (los proyectos completos no aportan). */
export function actividadesPortafolio(
  elementos: ElementoPortafolio[],
  proj: ProjItem[],
  req: ReqItem[],
): ActividadPortafolio[] {
  const activos = elementos.filter((e) => !e.completo);
  const proyectos = new Map(activos.filter((e) => e.tipo === "proyecto").map((e) => [e.id, e]));
  const pmls = new Map(activos.filter((e) => e.tipo === "pml").map((e) => [e.id, e]));
  const out: ActividadPortafolio[] = [];

  for (const it of proj) {
    const e = proyectos.get(it.boardId);
    if (!e) continue;
    const base = { tipo: "proyecto" as const, elementoId: e.id, codigo: e.codigo, elemento: e.nombre || e.codigo, fase: sinLetraDeFase(it.grupo) };
    if (it.subitems.length > 0) {
      for (const s of it.subitems) {
        out.push({
          ...base, id: s.id, nombre: s.name, responsable: s.responsible || s.person || "",
          status: s.status, estado: s.estado, limite: s.deadline, nuevaFecha: s.newLimitDate, fin: s.actualEnd,
          done: s.status === "Done",
        });
      }
    } else {
      out.push({
        ...base, id: it.id, nombre: it.name, responsable: it.responsible || it.resp || "",
        status: it.status, estado: it.estado, limite: it.deadline, nuevaFecha: null, fin: it.endDate,
        done: it.status === "Done",
      });
    }
  }

  for (const r of req) {
    const e = pmls.get(r.id);
    if (!e) continue;
    out.push({
      tipo: "pml", elementoId: e.id, codigo: e.codigo, elemento: e.nombre, id: r.id, nombre: `Fase ${r.grupo}`,
      fase: r.grupo, responsable: r.resp || r.pm || "", status: r.status, estado: r.estado,
      limite: r.deadline, nuevaFecha: null, fin: null, done: false,
    });
  }

  return out;
}

// ── Filtros ─────────────────────────────────────────────────────────────

export type DimensionPortafolio = "pm" | "clase" | "uNeg" | "pais";

export function pasaFiltros(e: ElementoPortafolio, f: FiltrosPortafolio, ignorar?: DimensionPortafolio | "tipo"): boolean {
  return (ignorar === "tipo" || f.tipo === "todos" || e.tipo === f.tipo)
    && (["pm", "clase", "uNeg", "pais"] as const).every((d) => ignorar === d || !f[d].length || f[d].includes(e[d]));
}

// ── KPI ─────────────────────────────────────────────────────────────────

export interface ConteoSalud { onTrack: number; inRisk: number; offTrack: number; sinDatos: number; total: number }

/** Cuántos elementos ACTIVOS hay en cada estado de salud. */
export function conteoSalud(elementos: ElementoPortafolio[]): ConteoSalud {
  const activos = elementos.filter((e) => !e.completo);
  const n = (s: HealthStatus) => activos.filter((e) => e.salud === s).length;
  return {
    onTrack: n("on-track"), inRisk: n("in-risk"), offTrack: n("off-track"),
    sinDatos: activos.filter((e) => e.salud === null).length, total: activos.length,
  };
}

/** Nota de Iniciativas de un grupo de PMs: el promedio de la de cada PM que tiene Iniciativas
 *  (misma cuenta que el EVM · PMO del Control Tower). null si ninguno tiene. */
export function saludIniciativas(pms: string[], ini: IniItem[], calMap: CalMap): number | null {
  const notas = pms.map((pm) => calcIniPMHealth(pm, ini, calMap)).filter((h) => h.total > 0).map((h) => h.index);
  return notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
}

/** Las partes del EVM de los elementos que se pasan (proyectos completos incluidos, como en el
 *  Control Tower): Iniciativas tal cual y el promedio de cada Clase A, B y C. */
export function partesEvmPortafolio(ini: number | null, elementos: ElementoPortafolio[]): PartesEvm {
  return partesEvm(ini, elementos.filter((e) => e.healthIndex != null).map((e) => ({ clase: e.clase, valor: e.healthIndex! })));
}

// ── Atrasos ─────────────────────────────────────────────────────────────

export type Gravedad = "alta" | "media" | "baja";

/** Alta: más de 10 días hábiles de atraso · Media: de 5 a 10 · Baja: menos de 5. */
export const gravedadAtraso = (dias: number): Gravedad => (dias > 10 ? "alta" : dias >= 5 ? "media" : "baja");

export interface AtrasoPortafolio extends ActividadPortafolio { dias: number; gravedad: Gravedad }

/** Actividades abiertas (no Done) que ya están ATRASADAS, con sus días hábiles de atraso desde su
 *  Limit Date (como el resto de la app) y su gravedad, de la más atrasada a la menos. */
export function atrasosAbiertos(actividades: ActividadPortafolio[], hoy: Date): AtrasoPortafolio[] {
  return actividades
    .filter((a): a is ActividadPortafolio & { limite: Date } => !a.done && a.estado === "ATRASADO" && a.limite !== null)
    .map((a) => {
      const dias = businessDays(a.limite, hoy, true);
      return { ...a, dias, gravedad: gravedadAtraso(dias) };
    })
    .sort((a, b) => b.dias - a.dias || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
}

export function conteoGravedad(atrasos: AtrasoPortafolio[]): Record<Gravedad, number> {
  const c = { alta: 0, media: 0, baja: 0 };
  for (const a of atrasos) c[a.gravedad]++;
  return c;
}

// ── Curva Plan vs Real ──────────────────────────────────────────────────

export interface PuntoCurva {
  /** Domingo que cierra la semana. */
  semana: Date;
  /** % acumulado de actividades que, según su Limit Date, ya debían estar cerradas. */
  plan: number;
  /** % acumulado de actividades cerradas (Done) a esa fecha; null en las semanas futuras. */
  real: number | null;
}

/** Curva S de las actividades de PROYECTOS: semana a semana, cuánto debía estar cerrado según el
 *  plan (Limit Date) y cuánto se cerró de verdad (Actual End). Una actividad Done sin fecha de
 *  cierre se toma como cerrada desde siempre. Toma `atras` semanas hasta la actual y `adelante`
 *  semanas de plan. Sin actividades con fecha devuelve []. */
export function curvaPlanReal(actividades: ActividadPortafolio[], hoy: Date, atras = 12, adelante = 4): PuntoCurva[] {
  const acts = actividades.filter((a) => a.tipo === "proyecto" && (a.limite !== null || a.done));
  if (!acts.length) return [];
  const domingo = new Date(hoy);
  domingo.setHours(23, 59, 59, 999);
  domingo.setDate(domingo.getDate() + ((7 - domingo.getDay()) % 7));

  const pct = (n: number) => Math.round((n / acts.length) * 1000) / 10;
  const out: PuntoCurva[] = [];
  for (let i = -atras; i <= adelante; i++) {
    const fin = new Date(domingo);
    fin.setDate(fin.getDate() + i * 7);
    const plan = acts.filter((a) => a.limite !== null && a.limite <= fin).length;
    const real = acts.filter((a) => a.done && (a.fin === null || a.fin <= fin)).length;
    out.push({ semana: fin, plan: pct(plan), real: i <= 0 ? pct(real) : null });
  }
  return out;
}

// ── Avance de entregables por proyecto ──────────────────────────────────

export interface AvanceProyecto {
  id: string;
  codigo: string;
  nombre: string;
  done: number;
  enCurso: number;
  atrasadas: number;
  pendientes: number;
  total: number;
}

/** Por proyecto activo, sus actividades Done, En curso (empezadas), Atrasadas (vencidas sin
 *  cerrar) y Pendientes (sin empezar). Cada actividad cae en un solo grupo. */
export function avancePorProyecto(actividades: ActividadPortafolio[]): AvanceProyecto[] {
  const m = new Map<string, AvanceProyecto>();
  for (const a of actividades) {
    if (a.tipo !== "proyecto") continue;
    let p = m.get(a.elementoId);
    if (!p) {
      p = { id: a.elementoId, codigo: a.codigo, nombre: a.elemento, done: 0, enCurso: 0, atrasadas: 0, pendientes: 0, total: 0 };
      m.set(a.elementoId, p);
    }
    p.total++;
    if (a.done) p.done++;
    else if (a.estado === "ATRASADO") p.atrasadas++;
    else if (classifyDev(a.status) === "working") p.enCurso++;
    else p.pendientes++;
  }
  return [...m.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
}

// ── Próximos hitos ──────────────────────────────────────────────────────

/** Fecha que manda hoy: la nueva si se movió, si no la original. */
export const fechaVigente = (a: ActividadPortafolio): Date | null => a.nuevaFecha ?? a.limite;

/** Actividades abiertas que vencen desde hoy hasta `dias` días naturales adelante, por fecha. */
export function proximosHitos(actividades: ActividadPortafolio[], hoy: Date, dias = 14): ActividadPortafolio[] {
  const hasta = new Date(hoy);
  hasta.setDate(hasta.getDate() + dias);
  hasta.setHours(23, 59, 59, 999);
  return actividades
    .filter((a) => {
      const f = fechaVigente(a);
      return !a.done && a.estado !== "ATRASADO" && f !== null && f >= hoy && f <= hasta;
    })
    .sort((a, b) => fechaVigente(a)!.getTime() - fechaVigente(b)!.getTime());
}

// ── Resumen gerencial ───────────────────────────────────────────────────

export interface ResumenGerencial {
  /** Actividades cerradas en los últimos 7 días y los proyectos/PML que más cerraron. */
  logros: { cerradas: number; top: { codigo: string; nombre: string; n: number }[] };
  /** Los 3 elementos activos con la peor nota EVM (At Risk u Off Track). */
  riesgos: ElementoPortafolio[];
  /** Lo que espera una decisión: elementos en la fase de Aprobación. */
  decisiones: ElementoPortafolio[];
  /** Actividades que vencen en los próximos 7 días. */
  foco: number;
}

export function resumenGerencial(elementos: ElementoPortafolio[], actividades: ActividadPortafolio[], hoy: Date): ResumenGerencial {
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - 7);
  const cerradas = actividades.filter((a) => a.done && a.fin !== null && a.fin > desde && a.fin <= finDelDia(hoy));
  const porElemento = new Map<string, { codigo: string; nombre: string; n: number }>();
  for (const a of cerradas) {
    const x = porElemento.get(a.elementoId) ?? { codigo: a.codigo, nombre: a.elemento, n: 0 };
    x.n++;
    porElemento.set(a.elementoId, x);
  }
  const activos = elementos.filter((e) => !e.completo);
  return {
    logros: { cerradas: cerradas.length, top: [...porElemento.values()].sort((a, b) => b.n - a.n).slice(0, 3) },
    riesgos: activos
      .filter((e) => e.salud === "off-track" || e.salud === "in-risk")
      .sort((a, b) => (a.healthIndex ?? 1) - (b.healthIndex ?? 1))
      .slice(0, 3),
    decisiones: activos.filter((e) => isFase2(e.fase)),
    foco: proximosHitos(actividades, hoy, 7).length,
  };
}

function finDelDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
