"use client";

// Pestaña "Status Card" de ProjectReportModal — el MISMO Status Ejecutivo PMO
// que /resumen-ejecutivo (StatusReport + buildStatusReportDataForBoard), acá
// en modo solo lectura (sin los render props editables de Alcance/Responsable/
// Motivo — esos se editan desde /resumen-ejecutivo, no se duplica esa UI acá).

import { useState } from "react";
import { useData } from "@/context/DataContext";
import { actividadesComoFases } from "@/lib/statusActividades";
import StatusReportPantalla from "@/components/StatusReportPantalla";
import { buildStatusReportDataForBoard } from "@/lib/statusReportData";
import type { ProjBoard, ProjItem } from "@/types";

export default function StatusCardTab({ board, items }: { board: ProjBoard; items: ProjItem[] }) {
  const { data } = useData();
  const [now] = useState(() => Date.now());

  const reportData = buildStatusReportDataForBoard({
    board, items,
    baselines: data?.projItemBaselines,
    atrasoDetalles: data?.atrasoDetalles,
    alcance: data?.boardAlcance[board.id]?.alcance ?? "",
    now,
  });

  return (
    <div>
      <p className="mb-3 text-[0.78rem] text-[var(--text-muted)]">
        El mismo Status Card de /resumen-ejecutivo — acá en solo lectura. Para editar Alcance, Responsable
        o Plan de Acción de un atraso, hazlo desde ahí.
      </p>
      <StatusReportPantalla data={reportData} actividadesDe={(id) => actividadesComoFases(items.find((p) => p.id === id), now)} />
    </div>
  );
}
