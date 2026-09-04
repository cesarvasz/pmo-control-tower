"use client";

// Dropdown "Responsable atraso" (roles — mismo catálogo DELAY_RESPONSIBLES
// que usa ResponsibleSelect para Entrega/atraso y Reproceso, no nombres del
// Directorio RH) + campo de texto "Motivo de atraso", para la tabla Atrasos
// del Resumen Ejecutivo. Editable por cualquier usuario con acceso a la
// página (no requiere Admin — a diferencia de ResponsibleSelect). Actualiza
// de forma optimista el contexto y persiste vía POST /api/atraso-detalle; si
// falla, resincroniza.

import { useState } from "react";
import { useData } from "@/context/DataContext";
import { authedFetch } from "@/lib/api";
import { DELAY_RESPONSIBLES } from "@/lib/delay";

const MAX_LEN = 500;

export default function AtrasoDetalleEditor({ itemId }: { itemId: string }) {
  const { data, setAtrasoDetalle, refresh } = useData();
  const detalle = data?.atrasoDetalles[itemId];

  // El texto local se realinea durante el render si el detalle cambia por
  // fuera (refresh, otro usuario) — patrón "Adjusting state when a prop
  // changes", evita un setState encadenado dentro de un efecto.
  const [motivo, setMotivo] = useState(detalle?.motivo ?? "");
  const [motivoPrevio, setMotivoPrevio] = useState(detalle?.motivo ?? "");
  if ((detalle?.motivo ?? "") !== motivoPrevio) {
    setMotivoPrevio(detalle?.motivo ?? "");
    setMotivo(detalle?.motivo ?? "");
  }

  const guardar = async (responsable: string, motivoNuevo: string) => {
    setAtrasoDetalle(itemId, responsable, motivoNuevo); // optimista
    try {
      const res = await authedFetch("/api/atraso-detalle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, responsable, motivo: motivoNuevo }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      await refresh(); // revierte al estado real del servidor
    }
  };

  const onResponsableChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    guardar(e.target.value, motivo);
  };

  const commitMotivo = () => {
    if (motivo !== (detalle?.motivo ?? "")) guardar(detalle?.responsable ?? "", motivo);
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {/* Controles editables — no imprimen: un <select>/<input> no se ve bien
          en PDF y no es interactivo ahí. Ver el texto plano de abajo. */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select
          value={detalle?.responsable ?? ""}
          onChange={onResponsableChange}
          title="Responsable del atraso"
          className="cursor-pointer rounded border bg-transparent px-1.5 py-1 text-[0.68rem]"
          style={{ borderColor: "var(--border)", color: detalle?.responsable ? "var(--text-secondary)" : "var(--text-muted)", minWidth: 150 }}
        >
          <option value="">Responsable atraso…</option>
          {DELAY_RESPONSIBLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          onBlur={commitMotivo}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder="Motivo de atraso…"
          maxLength={MAX_LEN}
          title="Motivo de atraso"
          className="min-w-[180px] flex-1 rounded border bg-transparent px-1.5 py-1 text-[0.68rem]"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        />
      </div>
      {/* Solo en impresión: mismo dato, como texto — oculto en pantalla. */}
      {(detalle?.responsable || detalle?.motivo) && (
        <div className="hidden text-[0.7rem] text-[var(--text-secondary)] print:block">
          {detalle?.responsable && <>Responsable atraso: <strong>{detalle.responsable}</strong></>}
          {detalle?.responsable && detalle?.motivo && " · "}
          {detalle?.motivo && <>Motivo: {detalle.motivo}</>}
        </div>
      )}
    </div>
  );
}
