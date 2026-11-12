"use client";

// Editores de celda que eligen de una lista: status, lista (dropdown) y persona.

import { useMemo, useState } from "react";
import { etiquetaStatus, type ConfigStatus } from "../../dominio/tipos-columna/status";
import type { ConfigDropdown } from "../../dominio/tipos-columna/dropdown";
import type { ConfigPersona } from "../../dominio/tipos-columna/persona";
import { claveNombre } from "../../dominio/personas";
import { anclaDe, BotonCelda, Popover, vacio, type PropsCelda } from "./comun";

export function CeldaStatus({ valor, config, editable, onCambiar }: PropsCelda<string, ConfigStatus>) {
  const [ancla, setAncla] = useState<DOMRect | null>(null);
  const setAbierto = (v: false) => setAncla(v || null);
  const actual = valor ? etiquetaStatus(config, valor) : undefined;
  return (
    <div>
      <button
        type="button" disabled={!editable} onClick={(e) => setAncla(anclaDe(e))}
        className="block min-h-[30px] w-full truncate px-2 py-1 text-center text-[0.8rem] font-semibold disabled:cursor-default"
        style={actual ? { background: actual.color, color: "#fff" } : { color: "var(--text-muted)" }}
      >
        {actual?.texto ?? ""}
      </button>
      {ancla && (
        <Popover ancla={ancla} onCerrar={() => setAbierto(false)} ancho={200}>
          <div className="flex flex-col gap-1">
            {config.etiquetas.map((e) => (
              <button
                key={e.id} type="button" onClick={() => { setAbierto(false); if (e.id !== valor) onCambiar(e.id); }}
                className="rounded px-2 py-1 text-[0.8rem] font-semibold text-white" style={{ background: e.color }}
              >
                {e.texto}
              </button>
            ))}
            {config.etiquetas.length === 0 && <span className="text-[0.75rem] text-[var(--text-muted)]">Sin etiquetas: agrégalas en la columna.</span>}
            {valor && (
              <button type="button" className="mt-1 text-[0.75rem] text-[var(--text-muted)] hover:underline" onClick={() => { setAbierto(false); onCambiar(null); }}>
                Vaciar
              </button>
            )}
          </div>
        </Popover>
      )}
    </div>
  );
}

/** Lista con casillas para elegir uno o varios. */
function Seleccion({ opciones, elegidos, multiple, onCambiar, buscar }: {
  opciones: { id: string; texto: string; tenue?: boolean }[]; elegidos: string[]; multiple: boolean; onCambiar(ids: string[]): void; buscar?: boolean;
}) {
  const [q, setQ] = useState("");
  const visibles = q ? opciones.filter((o) => claveNombre(o.texto).includes(claveNombre(q))) : opciones;
  const alternar = (id: string) => {
    if (!multiple) return onCambiar(elegidos[0] === id ? [] : [id]);
    onCambiar(elegidos.includes(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id]);
  };
  return (
    <div>
      {buscar && (
        <input
          autoFocus placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)}
          className="mb-1.5 w-full rounded border px-2 py-1 text-[0.8rem] text-[var(--text-primary)] outline-none"
          style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}
        />
      )}
      <div className="max-h-56 overflow-y-auto">
        {visibles.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[0.8rem] hover:bg-[var(--bg-hover)]" style={o.tenue ? { opacity: 0.55 } : undefined}>
            <input type={multiple ? "checkbox" : "radio"} checked={elegidos.includes(o.id)} onChange={() => alternar(o.id)} />
            <span className="truncate text-[var(--text-primary)]">{o.texto}</span>
          </label>
        ))}
        {visibles.length === 0 && <div className="px-1.5 py-1 text-[0.75rem] text-[var(--text-muted)]">Sin opciones.</div>}
      </div>
    </div>
  );
}

export function CeldaDropdown({ valor, config, editable, onCambiar }: PropsCelda<string[], ConfigDropdown>) {
  const [ancla, setAncla] = useState<DOMRect | null>(null);
  const setAbierto = (v: false) => setAncla(v || null);
  const elegidos = valor ?? [];
  const texto = elegidos.map((id) => config.opciones.find((o) => o.id === id)?.texto).filter(Boolean).join(", ");
  return (
    <div>
      <BotonCelda editable={editable} onClick={(e) => setAncla(anclaDe(e))} title={texto}>{texto || vacio}</BotonCelda>
      {ancla && (
        <Popover ancla={ancla} onCerrar={() => setAbierto(false)}>
          <Seleccion
            opciones={config.opciones} elegidos={elegidos} multiple={config.multiple} buscar={config.opciones.length > 8}
            onCambiar={(ids) => { onCambiar(ids.length ? ids : null); if (!config.multiple) setAbierto(false); }}
          />
        </Popover>
      )}
    </div>
  );
}

export function CeldaPersona({ valor, config, editable, personas, onCambiar }: PropsCelda<string[], ConfigPersona>) {
  const [ancla, setAncla] = useState<DOMRect | null>(null);
  const setAbierto = (v: false) => setAncla(v || null);
  const elegidos = useMemo(() => valor ?? [], [valor]);
  const nombre = useMemo(() => new Map(personas.map((p) => [p.id, p.nombre])), [personas]);
  const texto = elegidos.map((id) => nombre.get(id) ?? "¿?").join(", ");
  // Activas primero; las inactivas solo si ya están elegidas.
  const opciones = useMemo(() => personas
    .filter((p) => p.activo || elegidos.includes(p.id))
    .map((p) => ({ id: p.id, texto: p.nombre, tenue: !p.activo })), [personas, elegidos]);
  return (
    <div>
      <BotonCelda editable={editable} onClick={(e) => setAncla(anclaDe(e))} title={texto}>
        {texto ? <span>👤 {texto}</span> : vacio}
      </BotonCelda>
      {ancla && (
        <Popover ancla={ancla} onCerrar={() => setAbierto(false)} ancho={260}>
          <Seleccion
            opciones={opciones} elegidos={elegidos} multiple={config.multiple} buscar
            onCambiar={(ids) => { onCambiar(ids.length ? ids : null); if (!config.multiple) setAbierto(false); }}
          />
        </Popover>
      )}
    </div>
  );
}
