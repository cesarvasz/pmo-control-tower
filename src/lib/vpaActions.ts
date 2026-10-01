// src/lib/vpaActions.ts
// "VPA Actions" del Control Tower: las acciones que el VPA debe realizar o
// empujar, con visibilidad de su estado (a tiempo / hoy / atrasado / done).
// Junta pasos de Proyectos y REQ. Puro — sin React ni red; con test.

import { valorStageOf } from "@/lib/valorStepper";
import { isFase1, isFase2, isFase5 } from "@/lib/dashboard";
import { classifyDev } from "@/lib/devTimeline";
import type { ProjItem, ReqItem } from "@/types";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Fase 1, 2 o 5 (Valuación/Aprobación/Revisión) — el alcance del VPA como
 *  Responsible directo de un item (ver isCesarVpa abajo), no solo de los
 *  steps con nombre conocido (isVpaProjStep). */
const isFaseVpa125 = (grupo: string) => isFase1(grupo) || isFase2(grupo) || isFase5(grupo);

/** El VPA (César Vásquez) como Responsible directo de un item — cualquier
 *  item de fase 1/2/5 que tenga su nombre en la columna "Responsible" es
 *  una acción suya, sin importar el nombre del step (a diferencia de
 *  isVpaProjStep, que depende de una lista fija de nombres conocidos). */
const isCesarVpa = (responsible: string) => norm(responsible).includes(norm("César Vásquez"));

/** "Future Steps" que TODAVÍA no urge: no ha iniciado (classifyDev === "future"
 *  — esto incluye tanto el texto literal "Future Steps" como un status VACÍO,
 *  que Monday también pinta como "Future Steps" aunque el texto crudo de la
 *  columna venga "") y su Limit Date no está vencido ni es hoy (estado "EN
 *  TIEMPO"). No es una acción real del VPA todavía, así que no debe contar —
 *  a diferencia de uno ya vencido/para hoy, que sí es una acción pendiente
 *  (ver buildVpaActions). */
const isFutureStepsNotDue = (status: string, estado: string) =>
  classifyDev(status) === "future" && estado === "EN TIEMPO";

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
  "Aprobación": "PML · Aprobación (fase 2)",
  "Cierre ROI": "PML · Revisión ROI (fase 6)",
};

/**
 * Construye la lista de acciones del VPA a partir de los steps de Proyectos y
 * los REQ activos.
 *
 * Proyectos: (a) CUALQUIER item de fase 1/2/5 con "César Vásquez" como
 * Responsible (ver isCesarVpa) — esa es la fuente principal, ya no depende de
 * una lista fija de nombres de step; (b) por compatibilidad, los steps con
 * nombre conocido (ver isVpaProjStep) en "Working on it" o "Done", por si
 * alguno quedara con otro Responsible; (c) "Plan de beneficios acordados con
 * CFO" en la fase 2, aunque su status esté vacío/sin iniciar, porque es el
 * gate que el VPA tiene que empujar para que el proyecto avance — pero, igual
 * que (a) y (b), sujeto a la regla de "Future Steps sin urgencia" de abajo:
 * si todavía falta mucho para su Limit Date, tampoco cuenta todavía.
 *
 * El status de Monday decide si cuenta en los números o solo en el
 * historial: "Done" → `done: true` (no se cuenta como pendiente, pero sigue
 * en la lista para el detalle); "Working on it" / "Stuck" / "Future steps"
 * → `done: false` (se muestra y cuenta como pendiente, bajo su `estado`
 * calculado a partir de Limit Date: En Tiempo / Hoy / Atrasado). EXCEPCIÓN:
 * un "Future steps" (o status vacío, que Monday también pinta como "Future
 * Steps") cuyo Limit Date todavía no vence ni es hoy (estado "EN TIEMPO") NO
 * cuenta — no ha iniciado y no hay urgencia real, así que todavía no es una
 * acción del VPA (ver isFutureStepsNotDue). Sin excepciones: ni siquiera el
 * gate del CFO se muestra antes de que sea urgente.
 */
export function buildVpaActions(proj: ProjItem[], req: ReqItem[]): VpaAction[] {
  const vpaProj: VpaAction[] = proj
    .filter((r) => {
      if (isFutureStepsNotDue(r.status, r.estado)) return false;
      if (isFaseVpa125(r.grupo) && isCesarVpa(r.responsible)) return true;
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
