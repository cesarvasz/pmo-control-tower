"use client";

// Dropdown para asignar el responsable de una atribución (kind):
//   · "delay"     → responsable del atraso de una entrega.
//   · "reproceso" → responsable de un reproceso.
// Editable solo por Admin (acción "manage_users"); los no-admin ven el responsable
// asignado como texto de solo lectura. Actualiza de forma optimista el contexto y
// persiste vía POST /api/attribution; si falla, resincroniza.
// En ambos casos, solo el responsable "PM" penaliza la métrica asociada.

import { useState } from "react";
import { useData } from "@/context/DataContext";
import { useMe } from "@/context/PermissionsContext";
import { authedFetch } from "@/lib/api";
import { hasAction } from "@/lib/permissions";
import { DELAY_RESPONSIBLES, REPROCESO_RESPONSIBLES } from "@/lib/delay";
import type { AttributionKind, DelayResponsible } from "@/types";

export default function ResponsibleSelect({ itemId, kind, emptyPenalizes, readOnly }: {
  itemId: string;
  kind: AttributionKind;
  /** ¿Un valor vacío penaliza la métrica de ESTE ítem? (delay: siempre; reproceso: solo REQ cerrados) */
  emptyPenalizes?: boolean;
  /** Fuerza la vista de solo lectura sin importar el permiso — para páginas donde
   *  esta atribución se muestra como información pero solo se califica en otra
   *  pantalla (ej. Reproceso en /proyectos: solo lectura; se califica en
   *  /calidad-cumplimiento). */
  readOnly?: boolean;
}) {
  const { me } = useMe();
  const { data, setAttribution, refresh } = useData();
  const [saving, setSaving] = useState(false);

  // Ambos dropdowns (Entrega/atraso y Reproceso) solo los EDITA un Admin. Los
  // no-admin no ven el dropdown; ven el responsable asignado como texto (abajo).
  const canEdit = !readOnly && hasAction(me?.permissions, "manage_users");

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

  // No-admin: solo lectura. Tanto Compromiso de Entregas (delay) como Reproceso
  // muestran el responsable asignado por el admin como texto (misma lógica y color).
  if (!canEdit) {
    const label = current || (penalizesEmpty ? "Sin asignar" : "—");
    return (
      <span
        title={title}
        className="inline-block max-w-[130px] truncate text-[0.62rem] font-semibold"
        style={{ color: tone ?? "var(--text-muted)" }}
      >
        {label}
      </span>
    );
  }

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
