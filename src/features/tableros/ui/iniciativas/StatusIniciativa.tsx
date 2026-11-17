"use client";

// El Status de una iniciativa, a la vista: On Track (verde) u Off Track (rojo) mientras corre el embudo; ya fuera de él, lo que es:
// «Plan Futuro», «Sin Beneficio Definido» o «Aprobada · Clase X», con el color de su etapa. Sale de statusIni (la salud que calcula la app
// y la etapa); sin ninguno de los dos no hay status y se ve «—». Los colores salen del tema o de la etapa, oscurecidos para que el texto blanco se lea.

import { esStatusDeEtapa, statusIni, type StatusIni } from "../../dominio/nueva-iniciativa";

const oscuro = (color: string) => `color-mix(in srgb, ${color} 82%, black)`;

function fondo(s: StatusIni, colorEtapa?: string): string {
  if (s === "On Track") return oscuro("var(--ok)");
  if (s === "Off Track") return oscuro("var(--bad)");
  // De etapa: el color de su etiqueta del Status (los verdes claros de «PM C» se oscurecen para que se lea el texto blanco)
  if (colorEtapa) return oscuro(colorEtapa);
  return s === "Plan Futuro" ? "#5559df" : s === "Sin Beneficio Definido" ? "#c42a41" : "#037f4c";
}

function titulo(s: StatusIni): string {
  if (s === "On Track" || s === "Off Track") return "Según el plazo y la reunión agendada";
  if (s === "Plan Futuro") return "En Plan Futuro: se retoma en la fecha elegida";
  if (s === "Sin Beneficio Definido") return "Sin beneficio definido: recordatorios al CKU hasta que se apruebe o se cierre";
  return "Ya aprobada: sus acciones siguientes se definen aparte";
}

export default function StatusIniciativa({ salud, etapa }: {
  salud: unknown;
  /** La etapa (columna Status real): Plan Futuro, Sin Valor Def y las aprobadas (PM "X") se muestran por lo que son, con su color. */
  etapa?: { texto: string; color?: string } | null;
}) {
  const s = statusIni(salud, etapa?.texto);
  if (!s) return <span className="text-[var(--text-muted)]" title="Sin status: no aplica a esta etapa o falta el calendario">—</span>;
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold text-white"
      style={{ background: fondo(s, esStatusDeEtapa(s) ? etapa?.color : undefined) }} title={titulo(s)}
    >
      {s}
    </span>
  );
}
