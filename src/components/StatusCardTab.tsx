"use client";

// Pestaña "Status Card" de ProjectReportModal — el MISMO Status Ejecutivo PMO
// que /resumen-ejecutivo (StatusReport + buildStatusReportDataForBoard), acá
// en modo solo lectura (sin los render props editables de Alcance/Responsable/
// Motivo — esos se editan desde /resumen-ejecutivo, no se duplica esa UI acá).

import { useLayoutEffect, useRef, useState } from "react";
import { useData } from "@/context/DataContext";
import StatusReport, { SHEET_H, SHEET_W } from "@/components/StatusReport";
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

  // Misma mecánica de escala que /resumen-ejecutivo: la hoja (1122×794 px)
  // se ajusta al ancho disponible del panel del modal.
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const compute = () => {
      const w = box.clientWidth;
      if (w > 0) setScale(Math.min(w / SHEET_W, 1));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  return (
    <div>
      <p className="mb-3 text-[0.78rem] text-[var(--text-muted)]">
        El mismo Status Card de /resumen-ejecutivo — acá en solo lectura. Para editar Alcance, Responsable
        o Motivo de un atraso, hazlo desde ahí.
      </p>
      <div
        ref={boxRef}
        className="overflow-hidden rounded-xl"
        style={{ border: "1px solid var(--border)", boxShadow: "0 2px 14px rgba(0,0,0,.10)", height: SHEET_H * scale }}
      >
        <div style={{ width: SHEET_W, height: SHEET_H, transformOrigin: "top left", transform: `scale(${scale})` }}>
          <StatusReport data={reportData} />
        </div>
      </div>
    </div>
  );
}
