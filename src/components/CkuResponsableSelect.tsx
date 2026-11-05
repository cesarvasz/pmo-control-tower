"use client";

// Responsable de un INCUMPLIDO en la medición de un CKU (Players, detalle bajo la tabla). Un Admin elige
// quién fue el responsable; solo cuando es el CKU el Incumplido sigue afectando a su Player, con cualquier
// otro se excusa y sale de la nota. Sin elegir, manda lo de siempre: el responsable del Control Tower (el
// «heredado») y, si tampoco hay, penaliza.
//   · "delay-cku"     → Cumplimiento de Entrega (PML, Iniciativa o actividad de un Proyecto).
//   · "reproceso-cku" → Calidad de Entregas.
// Se guarda aparte de la atribución de los PM (no la toca). Solo un Admin ("manage_users") lo cambia; el CKU, el
// Sponsor y los demás ven el responsable como texto. Actualiza el contexto de forma optimista y persiste vía
// POST /api/attribution; si falla, resincroniza.

import { useState } from "react";
import { useData } from "@/context/DataContext";
import { useMe } from "@/context/PermissionsContext";
import { authedFetch } from "@/lib/api";
import { hasAction } from "@/lib/permissions";
import { DELAY_RESPONSIBLES } from "@/lib/delay";
import type { DelayResponsible } from "@/types";

export type KindCku = "delay-cku" | "reproceso-cku";

export default function CkuResponsableSelect({ itemId, kind, heredado, incumplido }: {
  /** Id de la unidad: el PML, la Iniciativa o la actividad. */
  itemId: string;
  kind: KindCku;
  /** El responsable que ya tiene en el Control Tower (o en su fase), con su etiqueta original; null si no hay. */
  heredado: string | null;
  /** ¿Es un Incumplido (o un atraso excusado)? Si no, solo se muestra el responsable, sin dropdown, salvo que ya
   *  tenga uno elegido (así el Admin siempre puede quitarlo). */
  incumplido: boolean;
}) {
  const { me } = useMe();
  const { data, setAttribution, refresh } = useData();
  const [saving, setSaving] = useState(false);

  const canEdit = hasAction(me?.permissions, "manage_users");
  const map = kind === "delay-cku" ? data?.ckuDelayAttributions : data?.ckuReprocesoAttributions;
  const elegido = map?.[itemId]?.responsible ?? "";
  const efectivo = elegido || heredado || "";

  // Sin Incumplido ni elección no hay nada que decidir: solo la etiqueta de siempre.
  if (!incumplido && !elegido) {
    return <span className="block text-[0.62rem] text-[var(--text-muted)]">{heredado ? `Resp.: ${heredado}` : "sin responsable"}</span>;
  }

  // Solo el CKU (o nadie) penaliza; con cualquier otro responsable el Incumplido se excusa.
  const penaliza = efectivo === "" || efectivo === "CKU";
  const tone = efectivo === "" ? "var(--warn)" : efectivo === "CKU" ? "var(--bad)" : "var(--text-muted)";
  const title = efectivo === ""
    ? "Sin responsable — este Incumplido afecta al Player. Elige un responsable distinto de CKU para excusarlo."
    : efectivo === "CKU"
      ? "Responsable: CKU — este Incumplido afecta al Player."
      : `Responsable: ${efectivo} — este Incumplido no afecta al Player del CKU.`;
  const origen = elegido ? "" : heredado ? " (tomado del Control Tower)" : "";

  if (!canEdit) {
    return (
      <span title={title + origen} className="block max-w-[150px] truncate text-[0.62rem] font-semibold" style={{ color: tone }}>
        {efectivo ? `Resp.: ${efectivo}` : "Sin responsable"}
      </span>
    );
  }

  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const responsible = (e.target.value || null) as DelayResponsible | null;
    setSaving(true);
    setAttribution(kind, itemId, responsible);   // optimista
    try {
      const res = await authedFetch("/api/attribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, itemId, responsible }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      await refresh();   // revierte al estado real del servidor
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      value={elegido}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      disabled={saving}
      title={title + origen}
      aria-label="Responsable del Incumplido"
      className="mt-0.5 w-full max-w-[150px] cursor-pointer rounded border bg-transparent px-1 py-0.5 text-[0.62rem] font-semibold"
      style={{ borderColor: penaliza ? tone : "var(--border)", color: tone }}
    >
      <option value="">{heredado ? `— ${heredado} (Control Tower)` : "— Responsable"}</option>
      {DELAY_RESPONSIBLES.map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
  );
}
