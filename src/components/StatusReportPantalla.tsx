"use client";

// El Status Card EN PANTALLA: la hoja (1122 px de ancho) se escala al ancho del panel y su alto es el que el contenido
// pida — con muchas actividades o causas de atraso la hoja crece hacia abajo en vez de achicar el texto (la impresión sí
// la ajusta a una sola A4: ver `ajustar` en StatusReport). Lo usan /resumen-ejecutivo y la pestaña Status Card.

import { useLayoutEffect, useRef, useState } from "react";
import StatusReport, { SHEET_H, SHEET_W, type StatusReportProps } from "@/components/StatusReport";

export default function StatusReportPantalla({ maxScale = 1, borderColor = "var(--border)", ...props }:
  Omit<StatusReportProps, "ajustar"> & { maxScale?: number; borderColor?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const hojaRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [alto, setAlto] = useState(SHEET_H);

  useLayoutEffect(() => {
    const box = boxRef.current, hoja = hojaRef.current;
    if (!box || !hoja) return;
    const medir = () => {
      const w = box.clientWidth;
      if (w > 0) setScale(Math.min(w / SHEET_W, maxScale));
      // offsetHeight es el alto de layout: el transform:scale no lo altera.
      setAlto(Math.max(hoja.offsetHeight, SHEET_H));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(box);
    ro.observe(hoja);
    return () => ro.disconnect();
  }, [maxScale]);

  return (
    <div
      ref={boxRef}
      className="overflow-hidden rounded-xl print:hidden"
      style={{ border: `1px solid ${borderColor}`, boxShadow: "0 2px 14px rgba(0,0,0,.10)", height: alto * scale }}
    >
      <div ref={hojaRef} style={{ width: SHEET_W, transformOrigin: "top left", transform: `scale(${scale})` }}>
        <StatusReport {...props} ajustar={false} />
      </div>
    </div>
  );
}
