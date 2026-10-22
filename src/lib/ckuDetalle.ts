// src/lib/ckuDetalle.ts
// Detalle de QUÉ se mide en Cumplimiento de Entrega y en Calidad de Entregas de un CKU
// (Players): las unidades que entran, el resultado de cada una y cómo pesa cada fuente
// (Iniciativas / PML / Proyectos, con los mismos pesos del EVM). Sale de los mismos
// constructores de filas que la página de auditoría, y su `pct` coincide con el del
// scoreboard (calcEntregaStatsPonderado / calcReprocesoStatsPonderado). Módulo PURO.

import { buildEntregaRows, buildReprocesoRows } from "@/lib/dashboard";
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
  const unidades = buildEntregaRows(s.req, s.proj, s.projBoards, s.ini).map((r): UnidadMedida => {
    const fuente = fuenteDe(r.source);
    const tarde = r.verdict === "late";
    const excusada = tarde && lateExcused(r.id, delays);
    const responsable = delaysOriginal[r.id]?.responsible ?? null;
    const base = {
      id: r.id, fuente, nombre: r.name, fase: r.source === "Proyecto" ? "" : r.fase, responsable,
      extra: r.source === "Proyecto" && tarde ? `${r.totalAtrasados} de ${r.totalEvaluados} con atraso` : undefined,
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
