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

/** Diálogo del motivo de un On Hold: lo pide (al pausar), lo edita (Admin) o solo lo muestra
 *  (`soloLectura`). Se monta solo mientras está abierto, así el texto arranca siempre desde `inicial`. */
function MotivoDialog({ titulo, ayuda, inicial, confirmar, soloLectura, onCancel, onConfirm }: {
  titulo: string; ayuda: string; inicial: string; confirmar: string;
  /** Solo muestra el motivo, sin campo de texto ni botón de guardar. */
  soloLectura?: boolean;
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
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {soloLectura ? (
          <div className="whitespace-pre-wrap break-words text-[0.88rem] text-[var(--text-primary)]">{inicial}</div>
        ) : (
          <>
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
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <button type="button" onClick={onCancel}
          className="rounded-lg border px-4 py-2 text-[0.85rem] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          style={{ borderColor: "var(--border)" }}>
          {soloLectura ? "Cerrar" : "Cancelar"}
        </button>
        {!soloLectura && (
          <button type="button" onClick={() => onConfirm(motivo)} disabled={!motivo}
            className="rounded-lg px-4 py-2 text-[0.85rem] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--accent)" }}>
            {confirmar}
          </button>
        )}
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

/** El motivo de algo que está en On Hold, como una burbuja que al hacer clic abre el diálogo con
 *  el texto. Quien tiene la acción "edit_on_hold" (Admin) lo edita —o lo agrega, en lo que se
 *  pausó antes de que existiera el motivo—; el resto solo lo lee. */
export function OnHoldMotivo({ tipo, id, nombre, motivo }: {
  tipo: OnHoldTipo; id: string; nombre: string; motivo: string;
}) {
  const { me } = useMe();
  const { setMotivoOnHold } = useData();
  const [abierto, setAbierto] = useState(false);
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

  // Sin motivo y sin permiso para agregarlo no hay nada que abrir.
  if (!motivo && !puede) return <span className="text-[0.78rem] italic text-[var(--text-muted)]">Sin motivo</span>;

  return (
    // El diálogo vive dentro de una fila/encabezado que puede ser clicable: sus clics no deben llegar a ella.
    <span onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setAbierto(true)}
        aria-label={motivo ? `Ver el motivo de ${nombre}` : `Agregar el motivo de ${nombre}`}
        title={motivo ? (puede ? `${motivo}\n\nClic para leer o editar` : `${motivo}\n\nClic para leer`) : "Agregar el motivo"}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors hover:bg-[var(--bg-hover)]"
        style={motivo
          ? { borderColor: "var(--accent)", color: "var(--accent-light)", background: "color-mix(in srgb, var(--accent) 14%, transparent)" }
          : { borderColor: "var(--border)", color: "var(--text-muted)", borderStyle: "dashed" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.7 8.7 0 0 1-3.9-.9L3 21l1.9-5.6A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z" />
          {!motivo && <path d="M12.5 8.5v6M9.5 11.5h6" />}
        </svg>
      </button>
      {abierto && (
        <MotivoDialog
          titulo={`Motivo de ${nombre}`}
          ayuda="¿Por qué está en On Hold?"
          inicial={motivo} confirmar="Guardar" soloLectura={!puede}
          onCancel={() => setAbierto(false)}
          onConfirm={(nuevo) => { setAbierto(false); if (nuevo !== motivo) void guardar(nuevo); }}
        />
      )}
    </span>
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
