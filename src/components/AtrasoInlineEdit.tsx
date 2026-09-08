"use client";

// Controles editables EN SITIO para la tabla "Causas de atraso" del Status
// Ejecutivo (ver components/StatusReport.tsx): un <select> con pinta de pill y
// el Motivo como texto editable. Misma persistencia optimista que
// AtrasoDetalleEditor (POST /api/atraso-detalle, revierte si falla).

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useData } from "@/context/DataContext";
import { authedFetch } from "@/lib/api";
import { DELAY_RESPONSIBLES } from "@/lib/delay";
import { respToneColor } from "@/components/StatusReport";

const MAX_LEN = 500;

function useSaveAtraso(itemId: string) {
  const { data, setAtrasoDetalle, refresh } = useData();
  const detalle = data?.atrasoDetalles[itemId];
  const save = async (responsable: string, motivo: string) => {
    setAtrasoDetalle(itemId, responsable, motivo); // optimista
    try {
      const res = await authedFetch("/api/atraso-detalle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, responsable, motivo }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      await refresh(); // revierte al estado real del servidor
    }
  };
  return { detalle, save };
}

/** Celda "Responsable": <select> disfrazado del pill `.pill-resp` — se ve
 *  idéntico al reporte pero cambia el rol al vuelo. `tone` es el slot/hex del
 *  color actual (viene de statusReportData). */
export function AtrasoRespSelect({ itemId, tone }: { itemId: string; tone: string }) {
  const { detalle, save } = useSaveAtraso(itemId);
  const value = detalle?.responsable ?? "";
  const c = respToneColor(tone);
  return (
    <select
      className="pill-resp"
      value={value}
      onChange={(e) => save(e.target.value, detalle?.motivo ?? "")}
      onClick={(e) => e.stopPropagation()}
      title="Responsable del atraso"
      style={{ background: `${c}15`, color: c, border: `1px solid ${c}55` }}
    >
      <option value="">Sin asignar</option>
      {DELAY_RESPONSIBLES.map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
  );
}

/** Celda "Motivo": <textarea> multilínea con la pinta de `.c-motivo` — crece
 *  solo para mostrar todo el texto, respeta saltos de línea (Enter). Ctrl/⌘+Enter
 *  guarda y sale; Esc revierte; también guarda al perder foco. */
export function AtrasoMotivoInput({ itemId }: { itemId: string }) {
  const { detalle, save } = useSaveAtraso(itemId);
  const [motivo, setMotivo] = useState(detalle?.motivo ?? "");
  const [prev, setPrev] = useState(detalle?.motivo ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  if ((detalle?.motivo ?? "") !== prev) { // realinea si cambió por fuera (refresh / otro usuario)
    setPrev(detalle?.motivo ?? "");
    setMotivo(detalle?.motivo ?? "");
  }
  const autosize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useLayoutEffect(autosize, [motivo, autosize]);
  const commit = () => { if (motivo !== (detalle?.motivo ?? "")) save(detalle?.responsable ?? "", motivo); };
  return (
    <textarea
      ref={ref}
      className="c-motivo-input"
      rows={1}
      value={motivo}
      onChange={(e) => setMotivo(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
        else if (e.key === "Escape") { setMotivo(detalle?.motivo ?? ""); (e.target as HTMLTextAreaElement).blur(); }
      }}
      onClick={(e) => e.stopPropagation()}
      placeholder="Motivo del atraso…"
      maxLength={MAX_LEN}
      title="Motivo del atraso — Enter: salto de línea · Ctrl+Enter: guardar"
    />
  );
}
