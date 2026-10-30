// src/lib/ckuDetalle.ts
// Detalle de QUÉ se mide en Cumplimiento de Entrega y en Calidad de Entregas de un CKU
// (Players): las unidades que entran, el resultado de cada una y cómo pesa cada fuente
// (Iniciativas / PML / Proyectos, con los mismos pesos del EVM). Sale de los mismos
// constructores de filas que la página de auditoría, y su `pct` coincide con el del
// scoreboard (calcEntregaStatsPonderado / calcReprocesoStatsPonderado). Módulo PURO.

import { buildEntregaRows, buildReprocesoRows, calidadActividadCku, entregaActividadCku, entregablesDelCku, notaCalidadCku, projPhaseKey, redondearPct, type MotivoCalidadActividad } from "@/lib/dashboard";
import { lateExcused, type DelayMap } from "@/lib/delay";
import { EVM_WEIGHTS, weightedEvm } from "@/lib/health";
import { splitBoardName } from "@/lib/proj";
import type { IniItem, ProjBoard, ProjItem, ReqItem } from "@/types";

export type FuenteMedida = "ini" | "req" | "proj";
export const FUENTE_LABEL: Record<FuenteMedida, string> = { ini: "Iniciativas", req: "PML", proj: "Proyectos" };
const FUENTES: FuenteMedida[] = ["ini", "req", "proj"];
const fuenteDe = (source: "REQ" | "Proyecto" | "Iniciativa"): FuenteMedida =>
  source === "REQ" ? "req" : source === "Proyecto" ? "proj" : "ini";

export interface UnidadMedida {
  id: string;
  fuente: FuenteMedida;
  nombre: string;
  /** Fase / grupo (vacío si ya va dentro del nombre). */
  fase: string;
  /** Cumplimiento: ok = a tiempo · excusado = atraso con responsable que no penaliza · atraso = penaliza.
   *  Calidad: ok = nota 100 · atraso = nota 0 (PML e Iniciativas: según su responsable; actividades de
   *  Proyectos: según sus fechas). */
  estado: "ok" | "parcial" | "excusado" | "atraso";
  /** ¿Entra en la nota? Un atraso excusado (PML, Iniciativa o actividad de un Proyecto) se EXCLUYE:
   *  no suma ni resta. */
  cuenta: boolean;
  /** 0–1 que aporta a su fuente (Cumplimiento: 1 a tiempo / 0 atraso · Calidad: nota ÷ 100). */
  valor: number;
  /** Solo Calidad: nota 0 / 100. */
  nota?: number;
  /** Responsable asignado, con la etiqueta original (sin el cambio PM ↔ CKU). */
  responsable: string | null;
  /** Solo Proyectos: el proyecto (board) al que pertenece la actividad, p. ej. "PM-013 · TDP ADU". */
  proyecto?: string;
}

// ── Cumplimiento de Proyectos: proyecto → item → actividad ───────────────────
// La unidad que se mide es la ACTIVIDAD (subitem) de un item de la Fase 3, ambos a cargo del CKU; el item solo las agrupa.

/** Una actividad (subitem) de un item de Fase 3. ok / atraso = ya cerró con veredicto y cuenta;
 *  excusado = cerró tarde pero su fase tiene un responsable ≠ CKU, así que no cuenta;
 *  pendiente = todavía sin veredicto (sin cerrar, o sin fechas): no cuenta. */
export interface ActividadCumplimiento {
  id: string;
  nombre: string;
  status: string;
  deadline: Date | null;
  /** "Actual End": cuándo cerró en realidad. */
  cierre: Date | null;
  estado: "ok" | "atraso" | "excusado" | "pendiente";
  /** El PMO la dejó «a tiempo» a mano aunque en Monday figure con atraso (ver ckuAjustes). */
  ajustada: boolean;
  /** Persona responsable de la actividad en Monday (columna "Responsible"). */
  responsable: string | null;
}

/** Un item (entregable) de la Fase 3 con sus actividades, por fecha límite. */
export interface ItemCumplimiento {
  id: string;
  nombre: string;
  status: string;
  deadline: Date | null;
  /** Persona responsable del item en Monday (columna "Responsible"; "Resp" si esa viene vacía). */
  responsable: string | null;
  actividades: ActividadCumplimiento[];
}

/** Un proyecto (board con plantilla nueva) y los items de su Fase 3. */
export interface ProyectoCumplimiento {
  proyecto: string;
  /** Responsable asignado al atraso de la Fase 3 (etiqueta original); null si no hay. */
  responsableFase: string | null;
  items: ItemCumplimiento[];
}

export interface ConteoActividades { ok: number; atraso: number; excusado: number; pendiente: number }

/** Cuántas actividades hay en cada estado. A tiempo = ok · Cuentan = ok + atraso. */
export function contarActividades(items: ItemCumplimiento[]): ConteoActividades {
  const c: ConteoActividades = { ok: 0, atraso: 0, excusado: 0, pendiente: 0 };
  for (const it of items) for (const a of it.actividades) c[a.estado]++;
  return c;
}

/** Cronológico: sin fecha límite al final. */
const porFechaLimite = (a: { deadline: Date | null; nombre: string }, b: { deadline: Date | null; nombre: string }) =>
  (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) || a.nombre.localeCompare(b.nombre);

/** Los items con atrasos que penalizan primero, luego los de atraso excusado, luego el resto. */
const rangoItem = (it: ItemCumplimiento) =>
  it.actividades.some((a) => a.estado === "atraso") ? 0 : it.actividades.some((a) => a.estado === "excusado") ? 1 : 2;

/** Arma el árbol proyecto → item → actividad de la Fase 3 (ya recortada a plantilla nueva). Un item sin
 *  actividades (p. ej. ninguna cae en el mes filtrado) no se lista, ni el proyecto que se quede sin items.
 *  `delays` es el mapa con PM ↔ CKU intercambiado (decide la excusa); `delaysOriginal`, solo para la etiqueta. */
function armarProyectos(fase3: ProjItem[], delays: DelayMap, delaysOriginal: DelayMap): ProyectoCumplimiento[] {
  const porBoard = new Map<string, ProyectoCumplimiento>();
  for (const p of fase3) {
    if (p.subitems.length === 0) continue;
    const llave = projPhaseKey(p.boardId, p.grupo);
    const excusada = lateExcused(llave, delays);
    let proy = porBoard.get(p.boardId);
    if (!proy) {
      const { code, name } = splitBoardName(p.boardName);
      proy = { proyecto: code ? `${code} · ${name}` : name, responsableFase: delaysOriginal[llave]?.responsible ?? null, items: [] };
      porBoard.set(p.boardId, proy);
    }
    proy.items.push({
      id: p.id, nombre: p.name, status: p.status, deadline: p.deadline,
      responsable: p.responsible?.trim() || p.resp?.trim() || null,
      actividades: p.subitems.map((s): ActividadCumplimiento => {
        const entrega = entregaActividadCku(s);
        return {
          id: s.id, nombre: s.name, status: s.status, deadline: s.deadline ?? null, cierre: s.actualEnd ?? null,
          estado: entrega === "on-time" ? "ok" : entrega === "late" ? (excusada ? "excusado" : "atraso") : "pendiente",
          ajustada: entrega !== s.entrega,
          responsable: s.responsible?.trim() || null,
        };
      }).sort(porFechaLimite),
    });
  }
  const proyectos = [...porBoard.values()];
  for (const proy of proyectos) proy.items.sort((a, b) => rangoItem(a) - rangoItem(b) || a.nombre.localeCompare(b.nombre));
  const conAtraso = (proy: ProyectoCumplimiento) => (contarActividades(proy.items).atraso > 0 ? 0 : 1);
  return proyectos.sort((a, b) => conAtraso(a) - conAtraso(b) || a.proyecto.localeCompare(b.proyecto));
}

// ── Calidad de Proyectos: proyecto → item → actividad ────────────────────────
// Igual que en Cumplimiento, la unidad es la ACTIVIDAD a cargo del CKU de un entregable suyo de la Fase 3.

/** Una actividad en Calidad. `nota` 100 = calidad 1 · 0 = calidad 0 · null = todavía no se mide (no cuenta). */
export interface ActividadCalidad {
  id: string;
  nombre: string;
  status: string;
  deadline: Date | null;
  /** "Actual End": cuándo cerró en realidad. */
  cierre: Date | null;
  /** "New Limit Date": la nueva fecha límite, si se movió. */
  nuevaFecha: Date | null;
  /** Persona responsable de la actividad en Monday (columna "Responsible"). */
  responsable: string | null;
  nota: 0 | 100 | null;
  motivo: MotivoCalidadActividad | null;
}

export interface ItemCalidad {
  id: string;
  nombre: string;
  status: string;
  deadline: Date | null;
  /** Persona responsable del item en Monday (columna "Responsible"; "Resp" si esa viene vacía). */
  responsable: string | null;
  actividades: ActividadCalidad[];
}

export interface ProyectoCalidadCku { proyecto: string; items: ItemCalidad[] }

export interface ConteoCalidad { buenas: number; malas: number; sinMedir: number }

/** Cuántas actividades tienen calidad 1, calidad 0 y cuántas todavía no se miden. */
export function contarCalidad(items: ItemCalidad[]): ConteoCalidad {
  const c: ConteoCalidad = { buenas: 0, malas: 0, sinMedir: 0 };
  for (const it of items) for (const a of it.actividades) {
    if (a.nota === 100) c.buenas++; else if (a.nota === 0) c.malas++; else c.sinMedir++;
  }
  return c;
}

/** Arma el árbol proyecto → item → actividad con la Calidad de cada actividad (la Fase 3 ya recortada a
 *  lo del CKU). Los items con calidad 0 primero, y el proyecto con peor calidad primero. Un item sin
 *  actividades no se lista, ni el proyecto que se quede sin items. */
function armarProyectosCalidad(fase3: ProjItem[]): ProyectoCalidadCku[] {
  const porBoard = new Map<string, ProyectoCalidadCku>();
  for (const p of fase3) {
    if (p.subitems.length === 0) continue;
    let proy = porBoard.get(p.boardId);
    if (!proy) {
      const { code, name } = splitBoardName(p.boardName);
      proy = { proyecto: code ? `${code} · ${name}` : name, items: [] };
      porBoard.set(p.boardId, proy);
    }
    proy.items.push({
      id: p.id, nombre: p.name, status: p.status, deadline: p.deadline,
      responsable: p.responsible?.trim() || p.resp?.trim() || null,
      actividades: p.subitems.map((s): ActividadCalidad => {
        const c = calidadActividadCku(s);
        return {
          id: s.id, nombre: s.name, status: s.status, deadline: s.deadline ?? null, cierre: s.actualEnd ?? null,
          nuevaFecha: s.newLimitDate ?? null, responsable: s.responsible?.trim() || null,
          nota: c?.nota ?? null, motivo: c?.motivo ?? null,
        };
      }).sort(porFechaLimite),
    });
  }
  const proyectos = [...porBoard.values()];
  const malas = (it: ItemCalidad) => contarCalidad([it]).malas;
  for (const proy of proyectos) proy.items.sort((a, b) => malas(b) - malas(a) || a.nombre.localeCompare(b.nombre));
  const pct = (proy: ProyectoCalidadCku) => {
    const c = contarCalidad(proy.items);
    return c.buenas + c.malas > 0 ? c.buenas / (c.buenas + c.malas) : 2;   // sin nada medido, al final
  };
  return proyectos.sort((a, b) => pct(a) - pct(b) || a.proyecto.localeCompare(b.proyecto));
}

export interface FuenteResumen {
  fuente: FuenteMedida;
  label: string;
  /** Unidades que entran en la nota de esta fuente. */
  total: number;
  /** Cumplimiento: a tiempo · Calidad: unidades con nota 100. */
  buenas: number;
  /** 0–100 de la fuente (Cumplimiento: % a tiempo · Calidad: nota promedio); null sin unidades. */
  pct: number | null;
  /** Peso base del EVM (0.10 / 0.20 / 0.70). */
  peso: number;
  /** Peso real tras repartir el de las fuentes sin unidades; null si esta fuente no tiene unidades. */
  pesoEfectivo: number | null;
}

export interface DetalleMedicion {
  /** La misma cifra del scoreboard. */
  pct: number | null;
  fuentes: FuenteResumen[];
  unidades: UnidadMedida[];
  /** Solo Cumplimiento: los proyectos (Fase 3) con sus items y actividades, incluidas las que no
   *  cuentan (excusadas y pendientes) para poder verlas. */
  proyectos?: ProyectoCumplimiento[];
  /** Solo Calidad: los proyectos (Fase 3) con sus items y actividades, incluidas las que todavía no se miden. */
  proyectosCalidad?: ProyectoCalidadCku[];
}

interface Scope {
  ini: IniItem[]; req: ReqItem[]; proj: ProjItem[]; projBoards: ProjBoard[];
}

/** Arma el resumen por fuente y el % ponderado a partir de las unidades. */
function resumir(unidades: UnidadMedida[], buena: (u: UnidadMedida) => boolean): DetalleMedicion {
  const cuentan = unidades.filter((u) => u.cuenta);
  const frac = Object.fromEntries(FUENTES.map((f) => {
    const us = cuentan.filter((u) => u.fuente === f);
    return [f, us.length ? us.reduce((s, u) => s + u.valor, 0) / us.length : null];
  })) as Record<FuenteMedida, number | null>;
  const wSum = FUENTES.reduce((s, f) => s + (frac[f] !== null ? EVM_WEIGHTS[f] : 0), 0);

  const fuentes = FUENTES.map((f): FuenteResumen => {
    const us = cuentan.filter((u) => u.fuente === f);
    return {
      fuente: f, label: FUENTE_LABEL[f], total: us.length, buenas: us.filter(buena).length,
      pct: frac[f] === null ? null : redondearPct(frac[f] as number),
      peso: EVM_WEIGHTS[f], pesoEfectivo: frac[f] === null || wSum === 0 ? null : EVM_WEIGHTS[f] / wSum,
    };
  });
  const ponderado = weightedEvm(frac);
  return { pct: ponderado === null ? null : redondearPct(ponderado), fuentes, unidades };
}

/** Detalle de Cumplimiento de Entrega. `s.cku` es el CKU medido: en Proyectos solo cuentan (y se
 *  listan) los entregables a su cargo y, dentro de ellos, las actividades a su cargo. `delays` es el
 *  mapa con PM ↔ CKU ya intercambiado (el que decide qué penaliza, igual que el scoreboard);
 *  `delaysOriginal`, el de Firestore tal cual, solo para mostrar el responsable con su etiqueta real. */
export function detalleCumplimiento(s: Scope & { cku: string }, delays: DelayMap, delaysOriginal: DelayMap = delays): DetalleMedicion {
  // PML e Iniciativas: una unidad cada uno. Un atraso excusado sale de la cuenta (ver calcEntregaStats).
  const unidades = buildEntregaRows(s.req, [], s.projBoards, s.ini).map((r): UnidadMedida => {
    const tarde = r.verdict === "late";
    const base = {
      id: r.id, fuente: fuenteDe(r.source), nombre: r.name, fase: r.fase, responsable: delaysOriginal[r.id]?.responsible ?? null,
    };
    if (!tarde) return { ...base, estado: "ok", cuenta: true, valor: 1 };
    if (lateExcused(r.id, delays)) return { ...base, estado: "excusado", cuenta: false, valor: 0 };
    return { ...base, estado: "atraso", cuenta: true, valor: 0 };
  });

  // Proyectos: cada ACTIVIDAD ya cerrada, a cargo del CKU, de un entregable suyo de la Fase 3 (plantilla
  // nueva) es una unidad, igual que en calcEntregaStatsCku (el número del scoreboard). Las pendientes no.
  const proyectos = armarProyectos(entregablesDelCku(s.proj, s.cku), delays, delaysOriginal);
  for (const proy of proyectos) {
    for (const it of proy.items) {
      for (const a of it.actividades) {
        if (a.estado === "pendiente") continue;
        unidades.push({
          id: a.id, fuente: "proj", nombre: a.nombre, fase: it.nombre, proyecto: proy.proyecto,
          estado: a.estado, cuenta: a.estado !== "excusado", valor: a.estado === "ok" ? 1 : 0,
          responsable: a.estado === "ok" ? null : proy.responsableFase,
        });
      }
    }
  }
  return { ...resumir(unidades, (u) => u.estado !== "atraso"), proyectos };
}

/** Detalle de Calidad de Entregas de un CKU (misma convención de mapas que detalleCumplimiento).
 *  PML e Iniciativas valen 100 si su responsable no es el CKU y 0 si lo es (o no hay nadie asignado).
 *  Proyectos: cada actividad a cargo del CKU, de sus entregables de la Fase 3, vale 100 o 0 por sus
 *  fechas (ver calidadActividadCku); las que aún no se miden no son unidades. */
export function detalleCalidad(s: Scope & { cku: string }, reproceso: DelayMap, reprocesoOriginal: DelayMap = reproceso): DetalleMedicion {
  const unidades = buildReprocesoRows(s.req, [], s.projBoards, reproceso, s.ini).map((r): UnidadMedida => {
    const nota = notaCalidadCku(r.id, reproceso);
    return {
      id: r.id, fuente: fuenteDe(r.source), nombre: r.name, fase: r.fase,
      estado: nota === 100 ? "ok" : "atraso",
      cuenta: true, valor: nota / 100, nota,
      responsable: reprocesoOriginal[r.id]?.responsible ?? null,
    };
  });

  const proyectosCalidad = armarProyectosCalidad(entregablesDelCku(s.proj, s.cku));
  for (const proy of proyectosCalidad) {
    for (const it of proy.items) {
      for (const a of it.actividades) {
        if (a.nota === null) continue;
        unidades.push({
          id: a.id, fuente: "proj", nombre: a.nombre, fase: it.nombre, proyecto: proy.proyecto,
          estado: a.nota === 100 ? "ok" : "atraso", cuenta: true, valor: a.nota / 100, nota: a.nota, responsable: null,
        });
      }
    }
  }
  return { ...resumir(unidades, (u) => u.nota === 100), proyectosCalidad };
}
