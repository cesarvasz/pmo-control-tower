"use client";

// Botón para poner un Proyecto (board) o un PML (item) en On Hold, o reactivarlo. Solo lo
// ve quien tiene la acción "edit_on_hold" (Admin siempre). Mientras algo está en On Hold no
// cuenta en ninguna métrica (ver lib/onHold.ts), así que se pide confirmación. Mismo patrón
// de persistencia optimista que AlcanceInlineEdit: actualiza el contexto y hace POST
// /api/on-hold; si falla, deshace el cambio y avisa.

import { useState } from "react";
import { useData } from "@/context/DataContext";
import { useMe } from "@/context/PermissionsContext";
import { authedFetch } from "@/lib/api";
import { hasAction } from "@/lib/permissions";
import type { OnHoldTipo } from "@/lib/onHold";

export default function OnHoldButton({ tipo, id, nombre, activo }: {
  tipo: OnHoldTipo; id: string; nombre: string;
  /** true = ya está en On Hold (el botón lo reactiva). */
  activo: boolean;
}) {
  const { me } = useMe();
  const { setOnHold } = useData();
  const [guardando, setGuardando] = useState(false);

  if (!hasAction(me?.permissions, "edit_on_hold")) return null;

  const cambiar = async (e: React.MouseEvent) => {
    e.stopPropagation(); // vive dentro de encabezados/filas clicables
    const msg = activo
      ? `¿Reactivar ${nombre}? Volverá a contar en todas las métricas.`
      : `¿Poner ${nombre} en On Hold? Dejará de contar en todas las métricas hasta que lo reactives.`;
    if (!window.confirm(msg)) return;

    setGuardando(true);
    setOnHold(tipo, id, !activo); // optimista
    try {
      const res = await authedFetch("/api/on-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, id, activo: !activo }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    } catch (err) {
      setOnHold(tipo, id, activo); // revierte
      window.alert(`No se pudo ${activo ? "reactivar" : "poner en On Hold"} ${nombre}: ${err instanceof Error ? err.message : "error desconocido"}`);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <button
      type="button"
      onClick={cambiar}
      disabled={guardando}
      title={activo ? "Reactivar: vuelve a contar en las métricas" : "Poner en On Hold: deja de contar en todas las métricas"}
      className="whitespace-nowrap rounded-md border px-2 py-0.5 text-[0.72rem] font-semibold transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
      style={{ borderColor: activo ? "var(--accent)" : "var(--border)", color: activo ? "var(--accent-light)" : "var(--text-muted)" }}
    >
      {activo ? "▶ Reactivar" : "⏸ On Hold"}
    </button>
  );
}

/** Etiqueta «On Hold» para marcar un Proyecto o PML pausado. */
export function OnHoldBadge() {
  return (
    <span
      className="whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide"
      style={{ color: "var(--warn)", background: "color-mix(in srgb, var(--warn) 16%, transparent)" }}
      title="En On Hold: no cuenta en ninguna métrica"
    >
      ⏸ On Hold
    </span>
  );
}
