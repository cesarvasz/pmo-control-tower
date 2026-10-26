// src/lib/ckuDetalle.ts
// Detalle de QUÉ se mide en Cumplimiento de Entrega y en Calidad de Entregas de un CKU
// (Players): las unidades que entran, el resultado de cada una y cómo pesa cada fuente
// (Iniciativas / PML / Proyectos, con los mismos pesos del EVM). Sale de los mismos
// constructores de filas que la página de auditoría, y su `pct` coincide con el del
// scoreboard (calcEntregaStatsPonderado / calcReprocesoStatsPonderado). Módulo PURO.

import { buildEntregaRows, buildReprocesoRows, notaCalidadCku, projPhaseKey, proyectosFase3Nueva } from "@/lib/dashboard";
import { lateExcused, type DelayMap } from "@/lib/delay";
import { EVM_WEIGHTS, weightedEvm } from "@/lib/health";
import { sameCku } from "@/lib/players";
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
  /** ¿Entra en la nota? Un PML o Iniciativa con atraso excusado se EXCLUYE (no suma ni resta);
   *  una fase de Proyecto con atraso excusado sí entra, como a tiempo. */
  cuenta: boolean;
  /** 0–1 que aporta a su fuente (Cumplimiento: 1 a tiempo / 0 atraso · Calidad: nota ÷ 100). */
  valor: number;
  /** Solo Calidad: nota 0 / 100. */
  nota?: number;
  /** Responsable asignado, con la etiqueta original (sin el cambio PM ↔ CKU). */
  responsable: string | null;
  /** Solo Calidad de Proyectos: el item aún no cierra del todo (todavía no se le puede asignar responsable). */
  enCurso?: boolean;
  /** Solo Calidad de Proyectos: el proyecto (board) al que pertenece el entregable, p. ej. "PM-013 · TDP ADU". */
  proyecto?: string;
  /** Dato extra breve para mostrar al lado (p. ej. "2 de 5 con atraso"). */
  extra?: string;
  /** Solo Cumplimiento de Proyectos: los items de la Fase 3 que componen esta unidad. */
  items?: ItemFase[];
}

/** Un item (entregable) de la Fase 3 de un proyecto con plantilla nueva. */
export interface ItemFase {
  id: string;
  nombre: string;
  status: string;
  deadline: Date | null;
  /** atraso = el item o alguno de sus hitos salió tarde · ok = el item cerró a tiempo y ningún hito
   *  salió tarde · pendiente = el item todavía no cierra (aunque algún hito ya esté evaluado). */
  estado: "ok" | "atraso" | "pendiente";
  hitosEvaluados: number;
  hitosAtrasados: number;
  /** Persona responsable del item en Monday (columna "Responsible"; "Resp" si esa viene vacía). */
  responsable: string | null;
  /** Los hitos (subitems) del item cuyo responsable es el CKU, por fecha límite. */
  hitos: HitoFase[];
  /** Cuántos hitos tiene el item en total (con cualquier responsable). */
  hitosTotal: number;
}

/** Un hito (subitem) de un item de Fase 3. `estado` sigue el veredicto de entrega del hito
 *  (Actual End vs. Limit Date); sin veredicto (Working on it, Future Steps…) queda "pendiente". */
export interface HitoFase {
  id: string;
  nombre: string;
  status: string;
  deadline: Date | null;
  /** "Actual End": cuándo cerró en realidad. */
  cierre: Date | null;
  estado: ItemFase["estado"];
  /** Persona responsable del hito en Monday (columna "Responsible"). */
  responsable: string | null;
}

const ORDEN_ITEM: Record<ItemFase["estado"], number> = { atraso: 0, pendiente: 1, ok: 2 };

const hitoFase = (s: ProjItem["subitems"][number]): HitoFase => ({
  id: s.id, nombre: s.name, status: s.status, deadline: s.deadline ?? null, cierre: s.actualEnd ?? null,
  estado: s.entrega === "late" ? "atraso" : s.entrega === "on-time" ? "ok" : "pendiente",
  responsable: s.responsible?.trim() || null,
});

/** Cronológico: sin fecha límite al final. */
const porFechaLimite = (a: HitoFase, b: HitoFase) =>
  (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) || a.nombre.localeCompare(b.nombre);

/** Resumen de un item de Fase 3 para mostrarlo. Su atraso sigue la misma regla que decide si la
 *  fase salió tarde (groupFaseEntrega): el item mismo o cualquiera de sus hitos con veredicto "late". */
function itemFase(p: ProjItem, cku?: string): ItemFase {
  const hitosEvaluados = p.subitems.filter((s) => s.entrega === "on-time" || s.entrega === "late").length;
  const hitosAtrasados = p.subitems.filter((s) => s.entrega === "late").length;
  // "ok" solo si el item mismo cerró a tiempo: uno sin cerrar (Working on it, Stuck…) con hitos
  // ya evaluados y sin atraso sigue "pendiente" — todavía no tiene su propio veredicto.
  const estado: ItemFase["estado"] = p.entrega === "late" || hitosAtrasados > 0 ? "atraso"
    : p.entrega === "on-time" ? "ok" : "pendiente";
  return {
    id: p.id, nombre: p.name, status: p.status, deadline: p.deadline, estado, hitosEvaluados, hitosAtrasados,
    responsable: p.responsible?.trim() || p.resp?.trim() || null,
    // Solo los hitos a cargo del CKU. Los números de arriba (evaluados / atrasados) siguen contando
    // todos: son los que deciden si la fase salió tarde.
    hitos: p.subitems.map(hitoFase).filter((h) => !cku || sameCku(h.responsable ?? undefined, cku)).sort(porFechaLimite),
    hitosTotal: p.subitems.length,
  };
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
}

interface Scope {
  ini: IniItem[]; req: ReqItem[]; proj: ProjItem[]; projBoards: ProjBoard[];
  /** CKU dueño del detalle: de los hitos de cada item solo se listan los que están a su cargo. */
  cku?: string;
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

/** Detalle de Cumplimiento de Entrega. `delays` es el mapa con PM ↔ CKU ya intercambiado (el
 *  que decide qué penaliza, igual que el scoreboard); `delaysOriginal`, el de Firestore tal
 *  cual, solo para mostrar el responsable con su etiqueta real. */
export function detalleCumplimiento(s: Scope, delays: DelayMap, delaysOriginal: DelayMap = delays): DetalleMedicion {
  // Proyectos: solo la Fase 3 de los boards con plantilla nueva (mismo recorte que
  // calcEntregaStatsCku, el número del scoreboard).
  const proj = proyectosFase3Nueva(s.proj);
  const itemsPorFase = new Map<string, ItemFase[]>();
  for (const p of proj) {
    const k = projPhaseKey(p.boardId, p.grupo);
    const lista = itemsPorFase.get(k);
    if (lista) lista.push(itemFase(p, s.cku)); else itemsPorFase.set(k, [itemFase(p, s.cku)]);
  }
  for (const lista of itemsPorFase.values()) {
    lista.sort((a, b) => ORDEN_ITEM[a.estado] - ORDEN_ITEM[b.estado] || a.nombre.localeCompare(b.nombre));
  }
  const unidades = buildEntregaRows(s.req, proj, s.projBoards, s.ini).map((r): UnidadMedida => {
    const fuente = fuenteDe(r.source);
    const tarde = r.verdict === "late";
    const excusada = tarde && lateExcused(r.id, delays);
    const responsable = delaysOriginal[r.id]?.responsible ?? null;
    const base = {
      id: r.id, fuente, nombre: r.name, fase: r.source === "Proyecto" ? "" : r.fase, responsable,
      extra: r.source === "Proyecto" && tarde ? `${r.totalAtrasados} de ${r.totalEvaluados} con atraso` : undefined,
      items: r.source === "Proyecto" ? itemsPorFase.get(r.id) ?? [] : undefined,
    };
    if (!tarde) return { ...base, estado: "ok", cuenta: true, valor: 1 };
    if (excusada) {
      // Fase de Proyecto: cuenta como a tiempo. PML / Iniciativa: sale de la cuenta (ver calcEntregaStats).
      return r.source === "Proyecto"
        ? { ...base, estado: "excusado", cuenta: true, valor: 1 }
        : { ...base, estado: "excusado", cuenta: false, valor: 0 };
    }
    return { ...base, estado: "atraso", cuenta: true, valor: 0 };
  });
  return resumir(unidades, (u) => u.estado !== "atraso");
}

/** Detalle de Calidad de Entregas de un CKU (misma convención de mapas que detalleCumplimiento).
 *  Toda unidad vale 100 si su responsable no es el CKU y 0 si lo es (o no hay nadie asignado). */
export function detalleCalidad(s: Scope, reproceso: DelayMap, reprocesoOriginal: DelayMap = reproceso): DetalleMedicion {
  const unidades = buildReprocesoRows(s.req, s.proj, s.projBoards, reproceso, s.ini).map((r): UnidadMedida => {
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
