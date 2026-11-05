"use client";

// Actividades (subitems) de un entregable de la Fase 3, para el Status Card en pantalla: se muestran al expandir
// la fila del entregable en la línea de tiempo (ver renderActividades en StatusReport). Solo el nombre y su
// estado: Completada, En curso, Atrasada o A futuro (mismas etiquetas de la línea de tiempo).

import { useState } from "react";
import type { ProjItem, ProjSubitem } from "@/types";

type Estado = { texto: string; clase: string };

/** Atrasada = Stuck, o con fecha límite vencida sin haber cerrado; En curso = Working on it; el resto, A futuro. */
function estadoDe(s: ProjSubitem, hoy: number): Estado {
  if (s.status === "Done") return { texto: "Completada", clase: "state-done" };
  if (s.status === "Stuck" || (s.deadline && s.deadline.getTime() < hoy)) return { texto: "Atrasada", clase: "state-late" };
  if (s.status === "Working on it") return { texto: "En curso", clase: "state-current" };
  return { texto: "A futuro", clase: "state-future" };
}

export default function ActividadesFase3({ item }: { item: ProjItem | undefined }) {
  const subs = item?.subitems ?? [];
  const [hoy] = useState(() => Date.now());
  if (subs.length === 0) {
    return <div style={{ padding: "3px 10px 5px 40px", fontSize: "7pt", color: "#8a8a85" }}>Sin actividades.</div>;
  }
  return (
    <div style={{ padding: "2px 10px 5px 40px", background: "#faf9f6" }}>
      {subs.map((s) => {
        const e = estadoDe(s, hoy);
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "1.5px 0", borderTop: "1px solid #f1f0ec", fontSize: "7pt" }}>
            <span>{s.name}</span>
            <span className={`g-state ${e.clase}`}>{e.texto}</span>
          </div>
        );
      })}
    </div>
  );
}
