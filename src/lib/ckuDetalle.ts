// src/lib/ckuDetalle.ts
// Detalle de QUÉ se mide en Cumplimiento de Entrega y en Calidad de Entregas de un CKU
// (Players): las unidades que entran, el resultado de cada una y cómo pesa cada fuente
// (Iniciativas / PML / Proyectos, con los mismos pesos del EVM). Sale de los mismos
// constructores de filas que la página de auditoría, y su `pct` coincide con el del
// scoreboard (calcEntregaStatsPonderado / calcReprocesoStatsPonderado). Módulo PURO.

import { buildEntregaRows, buildReprocesoRows, projPhaseKey, proyectosFase3Nueva } from "@/lib/dashboard";
import { lateExcused, type DelayMap } from "@/lib/delay";
import { EVM_WEIGHTS, weightedEvm } from "@/lib/health";
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
   *  Calidad: ok = nota 100 · parcial = nota 50 · atraso = nota 0. */
  estado: "ok" | "parcial" | "excusado" | "atraso";
  /** ¿Entra en la nota? Un PML o Iniciativa con atraso excusado se EXCLUYE (no suma ni resta);
   *  una fase de Proyecto con atraso excusado sí entra, como a tiempo. */
  cuenta: boolean;
  /** 0–1 que aporta a su fuente (Cumplimiento: 1 a tiempo / 0 atraso · Calidad: nota ÷ 100). */
  valor: number;
  /** Solo Calidad: nota 0 / 50 / 100. */
  nota?: number;
  /** Responsable asignado, con la etiqueta original (sin el cambio PM ↔ CKU). */
  responsable: string | null;
  /** Solo Calidad de Proyectos: el item aún no cierra del todo (la nota es provisional). */
  enCurso?: boolean;
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
}

const ORDEN_ITEM: Record<ItemFase["estado"], number> = { atraso: 0, pendiente: 1, ok: 2 };

/** Resumen de un item de Fase 3 para mostrarlo. Su atraso sigue la misma regla que decide si la
 *  fase salió tarde (groupFaseEntrega): el item mismo o cualquiera de sus hitos con veredicto "late". */
function itemFase(p: ProjItem): ItemFase {
  const hitosEvaluados = p.subitems.filter((s) => s.entrega === "on-time" || s.entrega === "late").length;
  const hitosAtrasados = p.subitems.filter((s) => s.entrega === "late").length;
  // "ok" solo si el item mismo cerró a tiempo: uno sin cerrar (Working on it, Stuck…) con hitos
  // ya evaluados y sin atraso sigue "pendiente" — todavía no tiene su propio veredicto.
  const estado: ItemFase["estado"] = p.entrega === "late" || hitosAtrasados > 0 ? "atraso"
    : p.entrega === "on-time" ? "ok" : "pendiente";
  return {
    id: p.id, nombre: p.name, status: p.status, deadline: p.deadline, estado, hitosEvaluados, hitosAtrasados,
    responsable: p.responsible?.trim() || p.resp?.trim() || null,
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

interface Scope { ini: IniItem[]; req: ReqItem[]; proj: ProjItem[]; projBoards: ProjBoard[] }

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
    if (lista) lista.push(itemFase(p)); else itemsPorFase.set(k, [itemFase(p)]);
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

/** Detalle de Calidad de Entregas (misma convención de mapas que detalleCumplimiento). */
export function detalleCalidad(s: Scope, reproceso: DelayMap, reprocesoOriginal: DelayMap = reproceso): DetalleMedicion {
  const unidades = buildReprocesoRows(s.req, s.proj, s.projBoards, reproceso, s.ini).map((r): UnidadMedida => ({
    id: r.id, fuente: fuenteDe(r.source),
    nombre: r.source === "Proyecto" ? `${r.projName} · ${r.name}` : r.name,
    fase: r.fase,
    estado: r.nota === 100 ? "ok" : r.nota === 0 ? "atraso" : "parcial",
    cuenta: true, valor: r.nota / 100, nota: r.nota,
    responsable: reprocesoOriginal[r.id]?.responsible ?? null,
    enCurso: r.source === "Proyecto" && !r.allDone,
  }));
  return resumir(unidades, (u) => u.nota === 100);
}
