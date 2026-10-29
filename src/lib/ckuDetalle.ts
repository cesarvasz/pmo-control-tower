// src/lib/ckuDetalle.ts
// Detalle de QUÉ se mide en Cumplimiento de Entrega y en Calidad de Entregas de un CKU
// (Players): las unidades que entran, el resultado de cada una y cómo pesa cada fuente
// (Iniciativas / PML / Proyectos, con los mismos pesos del EVM). Sale de los mismos
// constructores de filas que la página de auditoría, y su `pct` coincide con el del
// scoreboard (calcEntregaStatsPonderado / calcReprocesoStatsPonderado). Módulo PURO.

import { buildEntregaRows, buildReprocesoRows, entregablesDelCku, notaCalidadCku, projPhaseKey, proyectosFase3Nueva } from "@/lib/dashboard";
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
   *  Calidad: ok = nota 100 (responsable distinto del CKU) · atraso = nota 0 (el CKU, o sin asignar). */
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
  /** Solo Calidad de Proyectos: el item aún no cierra del todo (todavía no se le puede asignar responsable). */
  enCurso?: boolean;
  /** Solo Proyectos: el proyecto (board) al que pertenece la unidad (el entregable en Calidad, la
   *  actividad en Cumplimiento), p. ej. "PM-013 · TDP ADU". */
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
const porFechaLimite = (a: ActividadCumplimiento, b: ActividadCumplimiento) =>
  (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) || a.nombre.localeCompare(b.nombre);

/** Los items con atrasos que penalizan primero, luego los de atraso excusado, luego el resto. */
const rangoItem = (it: ItemCumplimiento) =>
  it.actividades.some((a) => a.estado === "atraso") ? 0 : it.actividades.some((a) => a.estado === "excusado") ? 1 : 2;

/** Arma el árbol proyecto → item → actividad de la Fase 3 (ya recortada a plantilla nueva). `delays` es
 *  el mapa con PM ↔ CKU intercambiado (decide la excusa); `delaysOriginal`, solo para la etiqueta. */
function armarProyectos(fase3: ProjItem[], delays: DelayMap, delaysOriginal: DelayMap): ProyectoCumplimiento[] {
  const porBoard = new Map<string, ProyectoCumplimiento>();
  for (const p of fase3) {
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
      actividades: p.subitems.map((s): ActividadCumplimiento => ({
        id: s.id, nombre: s.name, status: s.status, deadline: s.deadline ?? null, cierre: s.actualEnd ?? null,
        estado: s.entrega === "on-time" ? "ok" : s.entrega === "late" ? (excusada ? "excusado" : "atraso") : "pendiente",
        responsable: s.responsible?.trim() || null,
      })).sort(porFechaLimite),
    });
  }
  const proyectos = [...porBoard.values()];
  for (const proy of proyectos) proy.items.sort((a, b) => rangoItem(a) - rangoItem(b) || a.nombre.localeCompare(b.nombre));
  const conAtraso = (proy: ProyectoCumplimiento) => (contarActividades(proy.items).atraso > 0 ? 0 : 1);
  return proyectos.sort((a, b) => conAtraso(a) - conAtraso(b) || a.proyecto.localeCompare(b.proyecto));
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
      pct: frac[f] === null ? null : Math.round((frac[f] as number) * 100),
      peso: EVM_WEIGHTS[f], pesoEfectivo: frac[f] === null || wSum === 0 ? null : EVM_WEIGHTS[f] / wSum,
    };
  });
  const ponderado = weightedEvm(frac);
  return { pct: ponderado === null ? null : Math.round(ponderado * 100), fuentes, unidades };
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
 *  Toda unidad vale 100 si su responsable no es el CKU y 0 si lo es (o no hay nadie asignado). */
export function detalleCalidad(s: Scope, reproceso: DelayMap, reprocesoOriginal: DelayMap = reproceso): DetalleMedicion {
  // Proyectos: solo los de plantilla nueva (mismo recorte que calcReprocesoStatsPonderado, el del scoreboard).
  const unidades = buildReprocesoRows(s.req, proyectosFase3Nueva(s.proj), s.projBoards, reproceso, s.ini).map((r): UnidadMedida => {
    const nota = notaCalidadCku(r.id, reproceso);
    return {
      id: r.id, fuente: fuenteDe(r.source),
      nombre: r.name,
      fase: r.fase,
      estado: nota === 100 ? "ok" : "atraso",
      cuenta: true, valor: nota / 100, nota,
      responsable: reprocesoOriginal[r.id]?.responsible ?? null,
      enCurso: r.source === "Proyecto" && !r.allDone,
      proyecto: r.source === "Proyecto" ? (r.projCode ? `${r.projCode} · ${r.projName}` : r.projName) : undefined,
    };
  });
  return resumir(unidades, (u) => u.nota === 100);
}

/** Los entregables de Calidad de un mismo proyecto. */
export interface GrupoProyecto {
  proyecto: string;
  /** Sus entregables, la nota más baja primero. */
  unidades: UnidadMedida[];
  /** Nota promedio del proyecto (0–100). */
  nota: number;
  /** Entregables con nota 100. */
  buenas: number;
  /** Entregables que aún no cierran del todo (nota provisional). */
  enCurso: number;
}

/** Agrupa por proyecto las unidades de Calidad de Proyectos (las que traen `proyecto`), con el
 *  proyecto de peor nota primero. Las demás unidades se ignoran. */
export function agruparPorProyecto(unidades: UnidadMedida[]): GrupoProyecto[] {
  const porProyecto = new Map<string, UnidadMedida[]>();
  for (const u of unidades) {
    if (!u.proyecto) continue;
    const lista = porProyecto.get(u.proyecto);
    if (lista) lista.push(u); else porProyecto.set(u.proyecto, [u]);
  }
  const porNota = (a: UnidadMedida, b: UnidadMedida) => (a.nota ?? 0) - (b.nota ?? 0) || a.nombre.localeCompare(b.nombre);
  return [...porProyecto].map(([proyecto, us]): GrupoProyecto => ({
    proyecto,
    unidades: [...us].sort(porNota),
    nota: Math.round(us.reduce((s, u) => s + (u.nota ?? 0), 0) / us.length),
    buenas: us.filter((u) => u.nota === 100).length,
    enCurso: us.filter((u) => u.enCurso).length,
  })).sort((a, b) => a.nota - b.nota || a.proyecto.localeCompare(b.proyecto));
}
