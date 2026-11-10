"use client";

// Editores de celda de fórmula y espejo (solo lectura: se calculan), relación (elige elementos de
// otro tablero) y archivo (subir, descargar, quitar).

import { useRef, useState } from "react";
import { formula, type ConfigFormula } from "../../dominio/tipos-columna/formula";
import type { ConfigRelacion } from "../../dominio/tipos-columna/relacion";
import { claveNombre } from "../../dominio/personas";
import { anclaDe, BotonCelda, claseCelda, Popover, vacio, type PropsCelda } from "./comun";

export function CeldaFormula({ valor, config, columna, entorno }: PropsCelda<number | string, ConfigFormula>) {
  const error = entorno?.errores.get(columna.id);
  if (error) return <span className={`${claseCelda} text-[#e2445c]`} title={error}>⚠ Error</span>;
  const texto = valor === null ? "" : formula.valor.texto(valor, config);
  return (
    <span className={`${claseCelda} ${config.formato === "numero" ? "text-right" : ""}`} title={texto}>
      {texto || vacio}
    </span>
  );
}

export function CeldaEspejo({ valor }: PropsCelda<string | number>) {
  return <span className={claseCelda} title={valor === null ? undefined : String(valor)}>{valor === null ? vacio : String(valor)}</span>;
}

export function CeldaRelacion({ valor, config, editable, entorno, onCambiar }: PropsCelda<string[], ConfigRelacion>) {
  const [ancla, setAncla] = useState<DOMRect | null>(null);
  const [q, setQ] = useState("");
  const ligado = entorno?.ligados[config.tableroId];
  const elegidos = valor ?? [];
  const nombre = (id: string) => ligado?.elementos.find((x) => x.id === id)?.nombre ?? "¿?";
  const texto = elegidos.map(nombre).join(", ");
  const opciones = (ligado?.elementos ?? []).filter((x) => !q || claveNombre(x.nombre).includes(claveNombre(q)));
  const alternar = (id: string) => {
    const ids = !config.multiple ? (elegidos[0] === id ? [] : [id]) : elegidos.includes(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id];
    onCambiar(ids.length ? ids : null);
    if (!config.multiple) setAncla(null);
  };
  return (
    <div>
      <BotonCelda editable={editable} onClick={(e) => setAncla(anclaDe(e))} title={texto}>{texto ? <span>🔗 {texto}</span> : vacio}</BotonCelda>
      {ancla && (
        <Popover ancla={ancla} onCerrar={() => setAncla(null)} ancho={280}>
          {!ligado ? <div className="text-[0.75rem] text-[var(--text-muted)]">No puedes ver el tablero ligado.</div> : (
            <>
              <div className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{ligado.nombre}</div>
              <input
                autoFocus placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)}
                className="mb-1.5 w-full rounded border px-2 py-1 text-[0.8rem] text-[var(--text-primary)] outline-none"
                style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}
              />
              <div className="max-h-56 overflow-y-auto">
                {opciones.map((o) => (
                  <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[0.8rem] hover:bg-[var(--bg-hover)]">
                    <input type={config.multiple ? "checkbox" : "radio"} checked={elegidos.includes(o.id)} onChange={() => alternar(o.id)} />
                    <span className="truncate text-[var(--text-primary)]">{o.nombre || "(sin nombre)"}</span>
                  </label>
                ))}
                {opciones.length === 0 && <div className="px-1.5 py-1 text-[0.75rem] text-[var(--text-muted)]">Sin elementos.</div>}
              </div>
            </>
          )}
        </Popover>
      )}
    </div>
  );
}

const fmtTamano = (b: number | null) => (b === null ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

export function CeldaArchivo({ columna, editable, entorno, elementoId }: PropsCelda<string[]>) {
  const [ancla, setAncla] = useState<DOMRect | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const lista = (entorno?.archivos ?? []).filter((a) => a.elementoId === elementoId && a.columnaId === columna.id);

  async function subir(files: FileList | null) {
    if (!files?.length || !entorno || !elementoId) return;
    setSubiendo(true); setFallo(null);
    try {
      for (const f of Array.from(files)) await entorno.subir(elementoId, columna.id, f);
    } catch (e) {
      setFallo(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <button type="button" onClick={(e) => setAncla(anclaDe(e))} className={`${claseCelda} rounded hover:bg-[var(--bg-hover)]`}>
        {lista.length ? <span>📎 {lista.length === 1 ? lista[0].nombre : `${lista.length} archivos`}</span> : vacio}
      </button>
      {ancla && (
        <Popover ancla={ancla} onCerrar={() => setAncla(null)} ancho={300}>
          <div className="flex flex-col gap-1">
            {lista.map((a) => (
              <div key={a.id} className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[0.8rem] hover:bg-[var(--bg-hover)]">
                <button type="button" className="flex-1 truncate text-left text-[var(--accent)] hover:underline" title={a.nombre} onClick={() => entorno?.descargar(a.id)}>
                  {a.nombre}
                </button>
                <span className="text-[0.7rem] text-[var(--text-muted)]">{fmtTamano(a.tamano)}</span>
                {editable && (
                  <button type="button" className="px-1 text-[var(--text-muted)] hover:text-[#ef4444]" aria-label={`Quitar ${a.nombre}`}
                    onClick={() => { if (confirm(`¿Quitar «${a.nombre}»?`)) void entorno?.borrarArchivo(a.id); }}>✕</button>
                )}
              </div>
            ))}
            {lista.length === 0 && <div className="text-[0.75rem] text-[var(--text-muted)]">Sin archivos.</div>}
            {editable && (
              <>
                <input ref={input} type="file" multiple className="hidden" onChange={(e) => void subir(e.target.files)} />
                <button
                  type="button" disabled={subiendo} onClick={() => input.current?.click()}
                  className="mt-1 rounded border px-2 py-1 text-[0.78rem] font-semibold text-[var(--accent)] disabled:opacity-50" style={{ borderColor: "var(--border)" }}
                >
                  {subiendo ? "Subiendo…" : "+ Subir archivo"}
                </button>
                <span className="text-[0.68rem] text-[var(--text-muted)]">Hasta 50 MB por archivo.</span>
              </>
            )}
            {fallo && <span className="text-[0.72rem] text-[#e2445c]">{fallo}</span>}
          </div>
        </Popover>
      )}
    </div>
  );
}
