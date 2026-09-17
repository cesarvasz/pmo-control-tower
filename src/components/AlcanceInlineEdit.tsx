"use client";

// Campo editable EN SITIO del "Alcance" de un proyecto — línea nueva del
// header del Status Card, debajo de PM/Sponsor/CKU/Estrategia (ver
// components/StatusReport.tsx). Una sola línea, sin autosize: el ancho lo da
// el flex del header (hasta el borde derecho), el alto es fijo. Mismo patrón
// de persistencia optimista que AtrasoInlineEdit.tsx: actualiza el contexto y
// hace POST /api/board-alcance; si falla, resincroniza con refresh().

import { useState } from "react";
import { useData } from "@/context/DataContext";
import { authedFetch } from "@/lib/api";

const MAX_LEN = 600;

export function AlcanceInput({ boardId }: { boardId: string }) {
  const { data, setBoardAlcance, refresh } = useData();
  const saved = data?.boardAlcance[boardId]?.alcance ?? "";
  const [value, setValue] = useState(saved);
  const [prev, setPrev] = useState(saved);
  if (saved !== prev) { // realinea si cambió por fuera (refresh / otro usuario)
    setPrev(saved);
    setValue(saved);
  }

  const commit = async () => {
    if (value === saved) return;
    setBoardAlcance(boardId, value); // optimista
    try {
      const res = await authedFetch("/api/board-alcance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, alcance: value }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      await refresh(); // revierte al estado real del servidor
    }
  };

  return (
    <input
      type="text"
      className="alcance-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        else if (e.key === "Escape") { setValue(saved); (e.target as HTMLInputElement).blur(); }
      }}
      onClick={(e) => e.stopPropagation()}
      placeholder="Describe en una línea el alcance de este proyecto…"
      maxLength={MAX_LEN}
      title="Alcance del proyecto — Enter: guardar · Esc: cancelar"
    />
  );
}
