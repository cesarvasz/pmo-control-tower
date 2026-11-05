"use client";

// Tabla de actividades (subitems) de un entregable de la Fase 3, para el Status Card en pantalla: se muestra al
// expandir la fila del entregable en la línea de tiempo (ver renderActividades en StatusReport).

import { fmtDate } from "@/lib/business";
import type { ProjItem } from "@/types";

const fecha = (d: Date | null | undefined) => (d ? fmtDate(d) : "—");

export default function ActividadesFase3({ item }: { item: ProjItem | undefined }) {
  const subs = item?.subitems ?? [];
  if (subs.length === 0) {
    return <div style={{ padding: "3px 10px 5px 40px", fontSize: "7pt", color: "#8a8a85" }}>Sin actividades.</div>;
  }
  const th: React.CSSProperties = { textAlign: "left", fontWeight: 700, fontSize: "6.2pt", textTransform: "uppercase", color: "#8a8a85", padding: "1px 6px" };
  const td: React.CSSProperties = { padding: "1.5px 6px", fontSize: "7pt", borderTop: "1px solid #f1f0ec" };
  return (
    <div style={{ padding: "2px 10px 5px 40px", background: "#faf9f6" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr><th style={th}>Actividad</th><th style={th}>Status</th><th style={th}>Límite</th><th style={th}>Nueva fecha</th><th style={th}>Cierre real</th><th style={th}>Responsable</th></tr>
        </thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.id}>
              <td style={td}>{s.name}</td><td style={td}>{s.status || "—"}</td><td style={td}>{fecha(s.deadline)}</td>
              <td style={td}>{fecha(s.newLimitDate)}</td><td style={td}>{fecha(s.actualEnd)}</td><td style={td}>{s.responsible || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
