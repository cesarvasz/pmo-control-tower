"use client";

// Piezas chicas de la vista de tablero: texto editable en su lugar y la fila para agregar.

import { useState, type CSSProperties } from "react";

/** Texto que se edita con un clic; guarda con Enter o al salir, cancela con Escape. */
export function TextoEditable({ valor, editable, onGuardar, className = "", style, placeholder = "(sin nombre)", max = 255 }: {
  valor: string; editable: boolean; onGuardar(v: string): void; className?: string; style?: CSSProperties; placeholder?: string; max?: number;
}) {
  const [editando, setEditando] = useState(false);
  if (editando) {
    return (
      <input
        autoFocus defaultValue={valor} maxLength={max}
        className={`min-w-[120px] rounded border px-1.5 py-0.5 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] ${className}`}
        style={{ borderColor: "var(--border)", background: "var(--bg-base)", ...style }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditando(false); }}
        onBlur={(e) => { setEditando(false); const v = e.target.value.trim(); if (v !== valor) onGuardar(v); }}
      />
    );
  }
  if (!editable) return <span className={className} style={style}>{valor || placeholder}</span>;
  return (
    <button
      type="button" onClick={() => setEditando(true)} title="Clic para editar"
      className={`rounded px-1 text-left hover:bg-[var(--bg-hover)] ${className}`} style={style}
    >
      {valor || <span className="text-[var(--text-muted)]">{placeholder}</span>}
    </button>
  );
}

/** Campo "+ Agregar…" que crea un elemento con Enter. */
export function NuevoElemento({ etiqueta, onCrear }: { etiqueta: string; onCrear(nombre: string): void }) {
  const [texto, setTexto] = useState("");
  return (
    <input
      value={texto} placeholder={`+ ${etiqueta}`} maxLength={255} aria-label={etiqueta}
      onChange={(e) => setTexto(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && texto.trim()) { onCrear(texto.trim()); setTexto(""); }
        if (e.key === "Escape") setTexto("");
      }}
      className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-[0.82rem] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
    />
  );
}

export const botonMini = "rounded px-1.5 text-[0.8rem] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30";
