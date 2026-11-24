"use client";

// La hoja A4 de la Status Card, tal cual (ajustada a una sola hoja, como al imprimir), sobre fondo blanco y en tema
// claro. Cuando terminó de acomodarse marca data-lista="1": Chrome espera esa marca antes de tomar la foto.

import { useEffect, useState } from "react";
import StatusReport, { SHEET_H, SHEET_W } from "@/components/StatusReport";
import type { StatusReportData } from "@/lib/statusReportData";

export default function HojaStatusCard({ data }: { data: StatusReportData }) {
  const [lista, setLista] = useState(false);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    document.body.style.background = "#ffffff";
    document.body.style.margin = "0";
    // Fuentes cargadas + dos cuadros: el auto-ajuste de StatusReport ya midió y aplicó su escala.
    let cancelado = false;
    void document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => { if (!cancelado) setLista(true); })));
    return () => { cancelado = true; };
  }, []);
  return (
    <div id="hoja-status-card" data-lista={lista ? "1" : "0"} style={{ width: SHEET_W, height: SHEET_H, background: "#ffffff", overflow: "hidden" }}>
      <StatusReport data={data} ajustar />
    </div>
  );
}
