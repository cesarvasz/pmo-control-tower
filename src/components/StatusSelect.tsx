"use client";

// Dropdown para cambiar el status de un item/hito de Proyectos DIRECTO EN
// MONDAY (mutación change_simple_column_value vía POST /api/proj-status).
// Editable solo por Admin o roles con la acción "edit_proj_status" (ver
// /roles); el resto ve el status como texto, igual que antes. Actualiza de
// forma optimista el contexto (setProjStatus, que recalcula Entrega — función
// pura de status+fechas) y persiste en Monday; al terminar (éxito O error)
// confirma con Monday el estado real de ESTE proyecto (refreshBoard, rápido —
// un solo board) en vez de refrescar TODO el dashboard. Necesario porque
// Monday a veces rechaza el cambio por una restricción/automatización de la
// columna (la mutación falla igual que cualquier otro error) — antes eso
// disparaba un refresh() completo de los 14 boards + Iniciativas/PML, que es
// lento y dejaba el dropdown deshabilitado ("trabado") mucho más de lo
// necesario, además de poder quedarse con el valor optimista si ese refresh
// completo fallaba a su vez.
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
  const { setProjStatus, refreshBoard } = useData();
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
      // Sigue al finally: el refreshBoard de ahí confirma qué quedó realmente
      // en Monday (aceptado o no) — no hace falta revertir nada a mano aquí.
    } finally {
      try {
        await refreshBoard(boardId);
      } catch {
        // Si ni el refresh del board responde, se queda el valor optimista;
        // el usuario puede reintentar con el botón "↻ Actualizar" del board.
      }
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
