"use client";

// Botón para poner un Proyecto (board) o un PML (item) en On Hold, o reactivarlo. Solo lo
// ve quien tiene la acción "edit_on_hold" (Admin siempre). Mientras algo está en On Hold no
// cuenta en ninguna métrica (ver lib/onHold.ts), así que al pausar se pide el MOTIVO (la
// justificación, obligatoria) y al reactivar una confirmación. Mismo patrón de persistencia
// optimista que AlcanceInlineEdit: actualiza el contexto y hace POST /api/on-hold; si falla,
// deshace el cambio y avisa. El motivo de algo ya pausado se ve y se edita con <OnHoldMotivo>.

import { useState } from "react";
import { useData } from "@/context/DataContext";
import { useMe } from "@/context/PermissionsContext";
import Modal from "@/components/Modal";
import { authedFetch } from "@/lib/api";
import { hasAction } from "@/lib/permissions";
import { MOTIVO_ON_HOLD_MAX, type OnHoldTipo } from "@/lib/onHold";

async function errorDe(res: Response): Promise<Error> {
  return new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
}

/** Diálogo que pide el motivo de un On Hold. Se monta solo mientras está abierto, así el texto
 *  arranca siempre desde `inicial`. */
function MotivoDialog({ titulo, ayuda, inicial, confirmar, onCancel, onConfirm }: {
  titulo: string; ayuda: string; inicial: string; confirmar: string;
  onCancel: () => void; onConfirm: (motivo: string) => void;
}) {
  const [texto, setTexto] = useState(inicial);
  const motivo = texto.trim();
  return (
    <Modal open onClose={onCancel} width={480} label={titulo}>
      <div className="border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div className="text-[0.68rem] uppercase tracking-widest text-[var(--text-muted)]">On Hold</div>
        <div className="mt-0.5 truncate text-[1rem] font-bold text-[var(--text-primary)]">{titulo}</div>
      </div>
      <div className="px-6 py-4">
        <label className="mb-1.5 block text-[0.78rem] text-[var(--text-secondary)]" htmlFor="on-hold-motivo">{ayuda}</label>
        <textarea
          id="on-hold-motivo"
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, MOTIVO_ON_HOLD_MAX))}
          rows={4}
          placeholder="¿Por qué está en On Hold?"
          className="w-full resize-none rounded-lg border bg-[var(--bg-hover)] px-3 py-2 text-[0.85rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          style={{ borderColor: "var(--border)" }}
        />
        <div className="mt-1 text-right text-[0.68rem] tabular-nums text-[var(--text-muted)]">{texto.length}/{MOTIVO_ON_HOLD_MAX}</div>
      </div>
      <div className="flex justify-end gap-2 border-t px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <button type="button" onClick={onCancel}
          className="rounded-lg border px-4 py-2 text-[0.85rem] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          style={{ borderColor: "var(--border)" }}>
          Cancelar
        </button>
        <button type="button" onClick={() => onConfirm(motivo)} disabled={!motivo}
          className="rounded-lg px-4 py-2 text-[0.85rem] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "var(--accent)" }}>
          {confirmar}
        </button>
      </div>
    </Modal>
  );
}

export default function OnHoldButton({ tipo, id, nombre, activo }: {
  tipo: OnHoldTipo; id: string; nombre: string;
  /** true = ya está en On Hold (el botón lo reactiva). */
  activo: boolean;
}) {
  const { me } = useMe();
  const { setOnHold } = useData();
  const [guardando, setGuardando] = useState(false);
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);

  if (!hasAction(me?.permissions, "edit_on_hold")) return null;

  const guardar = async (nuevoActivo: boolean, motivo: string) => {
    setGuardando(true);
    setOnHold(tipo, id, nuevoActivo, motivo); // optimista
    try {
      const res = await authedFetch("/api/on-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, id, activo: nuevoActivo, motivo }),
      });
      if (!res.ok) throw await errorDe(res);
    } catch (err) {
      setOnHold(tipo, id, activo); // revierte
      window.alert(`No se pudo ${activo ? "reactivar" : "poner en On Hold"} ${nombre}: ${err instanceof Error ? err.message : "error desconocido"}`);
    } finally {
      setGuardando(false);
    }
  };

  const cambiar = (e: React.MouseEvent) => {
    e.stopPropagation(); // vive dentro de encabezados/filas clicables
    if (!activo) { setPidiendoMotivo(true); return; }
    if (window.confirm(`¿Reactivar ${nombre}? Volverá a contar en todas las métricas.`)) void guardar(false, "");
  };

  return (
    // El diálogo vive dentro del mismo encabezado/fila clicable: sus clics no deben llegar a él.
    <span onClick={(e) => e.stopPropagation()}>
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
      {pidiendoMotivo && (
        <MotivoDialog
          titulo={`Poner ${nombre} en On Hold`}
          ayuda="Dejará de contar en todas las métricas hasta que lo reactives. Escribe el motivo:"
          inicial="" confirmar="Poner en On Hold"
          onCancel={() => setPidiendoMotivo(false)}
          onConfirm={(motivo) => { setPidiendoMotivo(false); void guardar(true, motivo); }}
        />
      )}
    </span>
  );
}

/** El motivo de algo que está en On Hold. Quien tiene la acción "edit_on_hold" puede editarlo
 *  (o agregarlo, en lo que se pausó antes de que existiera el motivo); el resto solo lo lee. */
export function OnHoldMotivo({ tipo, id, nombre, motivo }: {
  tipo: OnHoldTipo; id: string; nombre: string; motivo: string;
}) {
  const { me } = useMe();
  const { setMotivoOnHold } = useData();
  const [editando, setEditando] = useState(false);
  const puede = hasAction(me?.permissions, "edit_on_hold");

  const guardar = async (nuevo: string) => {
    setMotivoOnHold(tipo, id, nuevo); // optimista
    try {
      const res = await authedFetch("/api/on-hold", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, id, motivo: nuevo }),
      });
      if (!res.ok) throw await errorDe(res);
    } catch (err) {
      setMotivoOnHold(tipo, id, motivo); // revierte
      window.alert(`No se pudo guardar el motivo de ${nombre}: ${err instanceof Error ? err.message : "error desconocido"}`);
    }
  };

  return (
    <div className="flex items-start gap-2" onClick={(e) => e.stopPropagation()}>
      {motivo ? (
        <span className="line-clamp-2 min-w-0 flex-1 whitespace-pre-wrap text-[0.78rem] text-[var(--text-secondary)]" title={motivo}>{motivo}</span>
      ) : (
        <span className="flex-1 text-[0.78rem] italic text-[var(--text-muted)]">Sin motivo</span>
      )}
      {puede && (
        <button type="button" onClick={() => setEditando(true)}
          title={motivo ? "Editar el motivo" : "Agregar el motivo"}
          className="shrink-0 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[0.68rem] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)]"
          style={{ borderColor: "var(--border)" }}>
          {motivo ? "✎ Editar" : "+ Agregar"}
        </button>
      )}
      {editando && (
        <MotivoDialog
          titulo={`Motivo de ${nombre}`}
          ayuda="¿Por qué está en On Hold?"
          inicial={motivo} confirmar="Guardar"
          onCancel={() => setEditando(false)}
          onConfirm={(nuevo) => { setEditando(false); if (nuevo !== motivo) void guardar(nuevo); }}
        />
      )}
    </div>
  );
}

/** Etiqueta «On Hold» para marcar un Proyecto o PML pausado (con su motivo al pasar el cursor). */
export function OnHoldBadge({ motivo }: { motivo?: string }) {
  return (
    <span
      className="whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide"
      style={{ color: "var(--warn)", background: "color-mix(in srgb, var(--warn) 16%, transparent)" }}
      title={motivo ? `En On Hold — ${motivo}` : "En On Hold: no cuenta en ninguna métrica"}
    >
      ⏸ On Hold
    </span>
  );
}
