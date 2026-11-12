"use client";

// Editores de celda de los tipos simples: texto, número, fecha, plan (timeline) y casilla.

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { numero, type ConfigNumero } from "../../dominio/tipos-columna/numero";
import { fecha } from "../../dominio/tipos-columna/fecha";
import { timeline, type Rango } from "../../dominio/tipos-columna/timeline";
import type { ConfigTexto } from "../../dominio/tipos-columna/texto";
import { anclaDe, BotonCelda, Popover, vacio, type PropsCelda } from "./comun";

const claseInput = "w-full rounded border px-2 py-1 text-[0.82rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const estiloInput = { borderColor: "var(--border)", background: "var(--bg-base)" };

/** Editor de una línea que guarda al salir o con Enter, y cancela con Escape. */
function EnLinea({ inicial, tipo, onGuardar, onCancelar }: {
  inicial: string; tipo: "text" | "number"; onGuardar(s: string): void; onCancelar(): void;
}) {
  const [borrador, setBorrador] = useState(inicial);
  const tecla = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") onCancelar();
  };
  return (
    <input
      autoFocus type={tipo} value={borrador} step="any"
      onChange={(e) => setBorrador(e.target.value)} onBlur={() => onGuardar(borrador)} onKeyDown={tecla}
      className={claseInput} style={estiloInput}
    />
  );
}

export function CeldaTexto({ valor, config, editable, onCambiar }: PropsCelda<string, ConfigTexto>) {
  const [editando, setEditando] = useState(false);
  const [ancla, setAncla] = useState<DOMRect | null>(null);
  if (config.multilinea) {
    return (
      <>
        <BotonCelda editable={editable} onClick={(e) => setAncla(anclaDe(e))} title={valor ?? undefined}>{valor || vacio}</BotonCelda>
        {ancla && (
          <Popover ancla={ancla} onCerrar={() => setAncla(null)} ancho={320}>
            <textarea
              autoFocus defaultValue={valor ?? ""} rows={5} className={claseInput} style={estiloInput}
              onBlur={(e) => { const s = e.target.value.trim() || null; setAncla(null); if (s !== valor) onCambiar(s); }}
            />
          </Popover>
        )}
      </>
    );
  }
  if (editando) {
    return (
      <EnLinea
        inicial={valor ?? ""} tipo="text" onCancelar={() => setEditando(false)}
        onGuardar={(s) => { setEditando(false); if ((s.trim() || null) !== valor) onCambiar(s.trim() || null); }}
      />
    );
  }
  return <BotonCelda editable={editable} onClick={() => setEditando(true)} title={valor ?? undefined}>{valor || vacio}</BotonCelda>;
}

export function CeldaNumero({ valor, config, editable, onCambiar }: PropsCelda<number, ConfigNumero>) {
  const [editando, setEditando] = useState(false);
  if (editando) {
    return (
      <EnLinea
        inicial={valor === null ? "" : String(valor)} tipo="number" onCancelar={() => setEditando(false)}
        onGuardar={(s) => {
          setEditando(false);
          const n = numero.valor.validar(s, config);
          if (n !== valor) onCambiar(n);
        }}
      />
    );
  }
  return (
    <BotonCelda editable={editable} onClick={() => setEditando(true)}>
      <span className="block text-right">{valor === null ? vacio : numero.valor.texto(valor, config)}</span>
    </BotonCelda>
  );
}

export function CeldaFecha({ valor, editable, onCambiar }: PropsCelda<string>) {
  const [editando, setEditando] = useState(false);
  if (editando) {
    return (
      <input
        autoFocus type="date" defaultValue={valor ?? ""} className={claseInput} style={estiloInput}
        onKeyDown={(e) => { if (e.key === "Escape") setEditando(false); }}
        onBlur={(e) => { setEditando(false); const v = fecha.valor.validar(e.target.value, {}); if (v !== valor) onCambiar(v); }}
      />
    );
  }
  return <BotonCelda editable={editable} onClick={() => setEditando(true)}>{valor ? fecha.valor.texto(valor, {}) : vacio}</BotonCelda>;
}

export function CeldaTimeline({ valor, editable, onCambiar }: PropsCelda<Rango>) {
  const [ancla, setAncla] = useState<DOMRect | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const setAbierto = (v: false) => setAncla(v || null);
  const abrir = (e: MouseEvent<HTMLElement>) => { setDesde(valor?.desde ?? ""); setHasta(valor?.hasta ?? ""); setAncla(anclaDe(e)); };
  const guardar = () => {
    setAbierto(false);
    const v = timeline.valor.validar({ desde, hasta: hasta || desde }, {});
    if (JSON.stringify(v) !== JSON.stringify(valor)) onCambiar(v);
  };
  return (
    <div>
      <BotonCelda editable={editable} onClick={abrir}>{valor ? timeline.valor.texto(valor, {}) : vacio}</BotonCelda>
      {ancla && (
        <Popover ancla={ancla} onCerrar={() => setAbierto(false)}>
          <label className="mb-1 block text-[0.72rem] text-[var(--text-secondary)]">Desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={claseInput} style={estiloInput} />
          </label>
          <label className="mb-2 block text-[0.72rem] text-[var(--text-secondary)]">Hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={claseInput} style={estiloInput} />
          </label>
          <div className="flex justify-between">
            <button type="button" className="text-[0.75rem] text-[var(--text-muted)] hover:underline" onClick={() => { setAbierto(false); if (valor) onCambiar(null); }}>Vaciar</button>
            <button type="button" className="rounded px-2 py-0.5 text-[0.75rem] font-semibold text-white" style={{ background: "var(--accent)" }} onClick={guardar}>Listo</button>
          </div>
        </Popover>
      )}
    </div>
  );
}

export function CeldaCheckbox({ valor, editable, onCambiar }: PropsCelda<boolean>) {
  return (
    <span className="flex min-h-[30px] items-center justify-center">
      <input type="checkbox" checked={valor === true} disabled={!editable} onChange={(e) => onCambiar(e.target.checked ? true : null)} aria-label="Marcar" />
    </span>
  );
}
