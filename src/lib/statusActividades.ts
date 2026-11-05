// src/lib/statusActividades.ts
// Las actividades (subitems) de un entregable de la Fase 3 como filas del Gantt del Status Card (indent 2), para
// mostrarlas al expandir el entregable en pantalla: nombre, su estado (Completada · En curso · Atrasada · A futuro)
// y su propia barra de tiempo. Módulo PURO.

import type { StatusPhase } from "@/lib/statusReportData";
import type { ProjItem, ProjSubitem } from "@/types";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Atrasada = Stuck, o con fecha límite vencida sin haber cerrado; En curso = Working on it; el resto, A futuro. */
export function estadoActividad(s: ProjSubitem, now: number): Pick<StatusPhase, "status" | "state"> {
  if (s.status === "Done") return { status: "done", state: "Completada" };
  if (s.status === "Stuck" || (s.deadline && s.deadline.getTime() < now)) return { status: "late", state: "Atrasada" };
  if (s.status === "Working on it") return { status: "current", state: "En curso" };
  return { status: "future", state: "A futuro" };
}

/** Una fila por actividad. Con inicio y límite (inicio < límite) lleva barra; con solo límite, un rombo; sin fechas,
 *  solo su nombre y estado. */
export function actividadesComoFases(item: ProjItem | undefined, now: number): StatusPhase[] {
  return (item?.subitems ?? []).map((s): StatusPhase => {
    const base: StatusPhase = { name: s.name, ...estadoActividad(s, now), indent: 2, bold: false };
    const fin = s.deadline;
    if (fin && s.startDate && s.startDate.getTime() < fin.getTime()) {
      return { ...base, start: ymd(s.startDate), due: ymd(fin), progress: s.status === "Done" ? 1 : 0 };
    }
    return fin ? { ...base, milestone: ymd(fin) } : base;
  });
}
