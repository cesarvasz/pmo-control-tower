"use client";

// Dropdown para asignar el responsable de una atribución (kind):
//   · "delay"     → responsable del atraso de una entrega.
//   · "reproceso" → responsable de un reproceso.
// Solo visible/editable para Admin (acción "manage_users"). Actualiza de forma
// optimista el contexto y persiste vía POST /api/attribution; si falla, resincroniza.
// En ambos casos, solo el responsable "PM" penaliza la métrica asociada.

import { useState } from "react";
import { useData } from "@/context/DataContext";
import { useMe } from "@/context/PermissionsContext";
import { authedFetch } from "@/lib/api";
import { hasAction } from "@/lib/permissions";
import { DELAY_RESPONSIBLES, REPROCESO_RESPONSIBLES } from "@/lib/delay";
import type { AttributionKind, DelayResponsible } from "@/types";

export default function ResponsibleSelect({ itemId, kind, emptyPenalizes }: {
  itemId: string;
  kind: AttributionKind;
  /** ¿Un valor vacío penaliza la métrica de ESTE ítem? (delay: siempre; reproceso: solo REQ cerrados) */
  emptyPenalizes?: boolean;
}) {
  const { me } = useMe();
  const { data, setAttribution, refresh } = useData();
  const [saving, setSaving] = useState(false);

  // Delay (atraso) solo lo edita un Admin; Reproceso lo puede editar cualquier usuario.
  const canEdit = kind === "reproceso" || hasAction(me?.permissions, "manage_users");
  if (!canEdit) return null;

  const map = kind === "delay" ? data?.delayAttributions : data?.reprocesoAttributions;
  const current = map?.[itemId]?.responsible ?? "";

  const isDelay = kind === "delay";
  const noun = isDelay ? "atraso" : "reproceso";
  const metric = isDelay ? "% de entregas" : "% de reproceso del KPI";

  // Un ítem se excusa solo con un responsable ≠ PM. Sin asignar penaliza cuando
  // está "en scope" (delay: cualquier atraso; reproceso: REQ cerrados).
  const penalizesEmpty = emptyPenalizes ?? isDelay;
  const needsAssign = current === "" && penalizesEmpty;    // sin asignar en scope → aviso ámbar
  const tone = current === "PM" ? "var(--bad)" : needsAssign ? "var(--warn)" : null;
  const title = current === "PM"
    ? `Responsable: PM — este ${noun} cuenta en el ${metric}`
    : current === "Sin reproceso"
      ? `Sin reproceso — no cuenta en el ${metric}`
      : current
        ? `Responsable: ${current} — ${noun} excusado, excluido del ${metric}`
        : penalizesEmpty
          ? `Sin asignar — cuenta en el ${metric}. Asigna un responsable ≠ PM (o "Sin reproceso") para excusarlo.`
          : `Sin asignar — no cuenta en el ${metric}`;

  const options = isDelay ? DELAY_RESPONSIBLES : REPROCESO_RESPONSIBLES;

  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const responsible = (e.target.value || null) as DelayResponsible | null;
    setSaving(true);
    setAttribution(kind, itemId, responsible); // optimista
    try {
      const res = await authedFetch("/api/attribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, itemId, responsible }),
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
      title={title}
      className="w-full max-w-[130px] cursor-pointer rounded border bg-transparent px-1 py-0.5 text-[0.62rem] font-semibold"
      style={{
        borderColor: tone ?? "var(--border)",
        color: tone ?? "var(--text-muted)",
      }}
    >
      <option value="">— Responsable</option>
      {options.map((r) => (
        <option key={r} value={r}>{r}</option>
      ))}
    </select>
  );
}
