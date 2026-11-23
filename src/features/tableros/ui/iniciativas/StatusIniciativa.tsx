"use client";

// El Status de una iniciativa, a la vista: On Track (verde) u Off Track (rojo) mientras corre el embudo; ya fuera de él, lo que es:
// «Plan Futuro», «Sin Beneficio Definido» o «Aprobada · Clase X», con el color de su etapa. Sale de statusIni (la salud que calcula la app
// y la etapa); sin ninguno de los dos no hay status y se ve «—». Los colores salen del tema o de la etapa, en versión suave (fondo tenue y punto).

import { esStatusDeEtapa, statusIni, type StatusIni } from "../../dominio/nueva-iniciativa";

/** El color propio de cada status (el de la etapa, si lo trae). La píldora lo usa suave: fondo tenue, punto y texto de ese color. */
function colorDe(s: StatusIni, colorEtapa?: string): string {
  if (s === "On Track") return "var(--ok)";
  if (s === "Off Track") return "var(--bad)";
  if (colorEtapa) return colorEtapa;
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
  const c = colorDe(s, esStatusDeEtapa(s) ? etapa?.color : undefined);
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.75rem] font-semibold"
      style={{
        background: `color-mix(in srgb, ${c} 13%, transparent)`, borderColor: `color-mix(in srgb, ${c} 35%, transparent)`,
        color: `color-mix(in srgb, ${c} 70%, var(--text-primary))`,
      }}
      title={titulo(s)}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {s}
    </span>
  );
}
