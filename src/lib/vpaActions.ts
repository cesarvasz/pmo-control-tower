// src/lib/vpaActions.ts
// "VPA Actions" del Control Tower: las acciones que el VPA debe realizar o
// empujar, con visibilidad de su estado (a tiempo / hoy / atrasado / done).
// Junta pasos de Proyectos y REQ. Puro — sin React ni red; con test.

import { valorStageOf } from "@/lib/valorStepper";
import type { ProjItem, ReqItem } from "@/types";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Acción del VPA unificada (proyecto o REQ) para el resumen y el detalle. */
export interface VpaAction {
  id: string;
  source: "PM" | "REQ";
  title: string;
  subtitle: string;
  estado: string;
  deadline: Date | null;
  done: boolean;
}

/** Value Gate (BC) firmado — el nombre del step varía por board ("Firmado y
 *  aprobado" en Aprobación, "Actualizado y firmado" en Launch, etc.). */
export const isValueGateStep = (name: string) => {
  const n = norm(name);
  return n.includes("value gate") && n.includes("firmado");
};

/** "Plan de beneficios acordados con CFO" — el gate de Aprobación que negocia
 *  el VPA (fase 2, ver buildVpaActions). */
export const isCfoPlanStep = (name: string) => norm(name).includes("plan de beneficios acordados con cfo");

/** Pasos de Proyecto que son acción del VPA, identificados por nombre. */
const isVpaProjStep = (name: string) => {
  const n = norm(name);
  return n.includes("vpa valida business case")
    || n.includes("business case validado por vpa")
    || isCfoPlanStep(name)
    || n.includes("recopila datos a 30 dias")
    || n.includes("recopila datos a 60 dias")
    || n.includes("recopila datos a 90 dias")
    || n.includes("informe ejecutivo de valor al sponsor")
    || isValueGateStep(name);
};

/** ¿El grupo es la fase 2 (Aprobación / Value Gate)? El nombre del grupo en
 *  Monday varía por board — "Aprobación | Value Gate" y otras variantes —,
 *  valorStageOf las reconoce todas (etapa 1 = A de VALOR). */
const esFase2 = (grupo: string) => valorStageOf(grupo) === 1;

// REQ: la acción del VPA son los ítems en fase 2 (Aprobación) y fase 6
// (Revisión ROI). `r.grupo` ya viene con el label interno (ver REQ_GROUP_LABEL).
const REQ_VPA_FASE: Record<string, string> = {
  "Aprobación": "REQ · Aprobación (fase 2)",
  "Cierre ROI": "REQ · Revisión ROI (fase 6)",
};

/**
 * Construye la lista de acciones del VPA a partir de los steps de Proyectos y
 * los REQ activos.
 *
 * Proyectos: los steps que le tocan al VPA (ver isVpaProjStep) en "Working on
 * it" o "Done". EXCEPCIÓN: "Plan de beneficios acordados con CFO" en la fase 2
 * aparece SIEMPRE — aunque su status esté vacío/sin iniciar —, porque es justo
 * el gate que el VPA tiene que empujar para que el proyecto avance.
 */
export function buildVpaActions(proj: ProjItem[], req: ReqItem[]): VpaAction[] {
  const vpaProj: VpaAction[] = proj
    .filter((r) => {
      if (isCfoPlanStep(r.name) && esFase2(r.grupo)) return true;
      return isVpaProjStep(r.name) && (r.status === "Working on it" || r.status === "Done");
    })
    .map((r) => ({
      id: `pm-${r.id}`, source: "PM", title: r.boardName,
      subtitle: `${r.name} · ${r.grupo}`, estado: r.estado, deadline: r.deadline,
      done: r.status === "Done",
    }));

  const vpaReq: VpaAction[] = req
    .filter((r) => r.grupo in REQ_VPA_FASE)
    .map((r) => ({
      id: `req-${r.id}`, source: "REQ", title: r.name,
      subtitle: REQ_VPA_FASE[r.grupo], estado: r.estado, deadline: r.deadline,
      done: false,
    }));

  return [...vpaProj, ...vpaReq];
}
