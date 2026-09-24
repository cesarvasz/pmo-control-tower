"use client";

// Dropdown para cambiar el status de un item/hito de Proyectos DIRECTO EN
// MONDAY (mutación change_simple_column_value vía POST /api/proj-status).
// Editable solo por Admin o roles con la acción "edit_proj_status" (ver
// /roles); el resto ve el status como texto, igual que antes. Actualiza de
// forma optimista el contexto (setProjStatus, que recalcula Entrega — función
// pura de status+fechas) y persiste en Monday; si la mutación falla, resincroniza.

import { useState } from "react";
import { useData } from "@/context/DataContext";
import { useMe } from "@/context/PermissionsContext";
import { authedFetch } from "@/lib/api";
import { hasAction } from "@/lib/permissions";

export default function StatusSelect({ boardId, itemId, columnId, options, current }: {
  boardId: string;
  itemId: string;
  columnId?: string;
  options?: string[];
  current: string;
}) {
  const { me } = useMe();
  const { setProjStatus, refresh } = useData();
  const [saving, setSaving] = useState(false);

  const canEdit =
    hasAction(me?.permissions, "edit_proj_status") &&
    !!boardId && !!columnId && !!options?.length;

  if (!canEdit) return <>{current || "—"}</>;

  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const label = e.target.value;
    if (!label || label === current) return;
    setSaving(true);
    setProjStatus(boardId, itemId, label); // optimista
    try {
      const res = await authedFetch("/api/proj-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, itemId, columnId, label }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      await refresh(); // revierte al estado real del servidor
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      value={current}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      disabled={saving}
      title="Cambiar status en Monday"
      className="w-full max-w-[130px] cursor-pointer rounded border bg-transparent px-1 py-0.5 text-inherit"
      style={{ borderColor: "var(--border)" }}
    >
      {!options!.includes(current) && current && <option value={current}>{current}</option>}
      {options!.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
