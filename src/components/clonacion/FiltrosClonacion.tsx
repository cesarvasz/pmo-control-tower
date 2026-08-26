"use client";

// C1 — Filtros de la pestaña Clonación de Files, con buscadores para Usuario
// (~80) y Cliente (~280), búsqueda de c807_file con debounce, y chips de
// filtros activos removibles.

import { useEffect, useState } from "react";
import { FilterReset } from "@/components/ui";
import MultiSelect from "@/components/MultiSelect";
import BuscableSelect from "@/components/tramites/BuscableSelect";
import {
  ANTIGUEDAD_LABEL, FILTROS_VACIOS, hayFiltros, etiquetaMes,
  type AntiguedadMax, type Filtros, type OpcionesFiltro,
} from "@/lib/clonaciones";

const ANTIGUEDADES: AntiguedadMax[] = ["sin_limite", "365", "90", "30"];

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem]"
      style={{ borderColor: "var(--accent)", background: "var(--bg-accent-soft)", color: "var(--accent-light)" }}>
      {children}
      <button onClick={onRemove} aria-label="Quitar filtro" className="opacity-70 hover:opacity-100">✕</button>
    </span>
  );
}

export default function FiltrosClonacion({
  opciones, f, onChange,
}: {
  opciones: OpcionesFiltro;
  f: Filtros;
  onChange: (p: Partial<Filtros>) => void;
}) {
  const [q, setQ] = useState(f.busqueda);
  // Si `f.busqueda` cambia por fuera (chip, "Limpiar todos"), el input local
  // se realinea durante el render — patrón recomendado para no encadenar un
  // setState dentro de otro efecto (ver "Adjusting state when a prop changes").
  const [busquedaPrevia, setBusquedaPrevia] = useState(f.busqueda);
  if (f.busqueda !== busquedaPrevia) {
    setBusquedaPrevia(f.busqueda);
    setQ(f.busqueda);
  }
  useEffect(() => {
    const t = setTimeout(() => { if (q !== f.busqueda) onChange({ busqueda: q }); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const conFiltros = hayFiltros(f);
  const limpiarTodos = () => onChange({ ...FILTROS_VACIOS, metrica: f.metrica });

  return (
    <div className="mb-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <MultiSelect
          label="Mes"
          options={opciones.meses}
          selected={f.meses}
          onToggle={(v, ch) => onChange({ meses: ch ? [...f.meses.filter((x) => x !== v), v] : f.meses.filter((x) => x !== v) })}
          onToggleAll={() => onChange({ meses: [] })}
        />
        <BuscableSelect label="Usuario" options={opciones.usuarios} selected={f.usuarios}
          onChange={(v) => onChange({ usuarios: v })} minWidth={190} />
        <BuscableSelect label="Cliente" options={opciones.clientes} selected={f.clientes}
          onChange={(v) => onChange({ clientes: v })} minWidth={200} />

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Archivo (c807_file)</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className="w-[190px] rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]" title="Días calendario entre Solicitud_fecha y Creacion_Fecha">
            Antigüedad máx. de la solicitud
          </span>
          <select value={f.antiguedadMax} onChange={(e) => onChange({ antiguedadMax: e.target.value as AntiguedadMax })}
            className="rounded-lg border px-3 py-2 text-[0.82rem] font-semibold outline-none"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            {ANTIGUEDADES.map((a) => <option key={a} value={a}>{ANTIGUEDAD_LABEL[a]}</option>)}
          </select>
        </label>

        <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[0.8rem]"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={f.incluirAnomalos}
            onChange={(e) => onChange({ incluirAnomalos: e.target.checked })}
            className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]" />
          Incluir registros anómalos
        </label>

        {conFiltros && <FilterReset onClick={limpiarTodos} />}
      </div>

      {conFiltros && (
        <div className="flex flex-wrap items-center gap-1.5">
          {f.meses.map((v) => (
            <Chip key={`m-${v}`} onRemove={() => onChange({ meses: f.meses.filter((x) => x !== v) })}>Mes: {etiquetaMes(v)}</Chip>
          ))}
          {f.usuarios.map((v) => (
            <Chip key={`u-${v}`} onRemove={() => onChange({ usuarios: f.usuarios.filter((x) => x !== v) })}>Usuario: {v}</Chip>
          ))}
          {f.clientes.map((v) => (
            <Chip key={`c-${v}`} onRemove={() => onChange({ clientes: f.clientes.filter((x) => x !== v) })}>Cliente: {v}</Chip>
          ))}
          {f.busqueda.trim() !== "" && (
            <Chip onRemove={() => { setQ(""); onChange({ busqueda: "" }); }}>Archivo: {f.busqueda}</Chip>
          )}
          {f.antiguedadMax !== "sin_limite" && (
            <Chip onRemove={() => onChange({ antiguedadMax: "sin_limite" })}>Antigüedad ≤ {ANTIGUEDAD_LABEL[f.antiguedadMax]}</Chip>
          )}
          {f.incluirAnomalos && (
            <Chip onRemove={() => onChange({ incluirAnomalos: false })}>Incluye anómalos</Chip>
          )}
          {f.rango && (
            <Chip onRemove={() => onChange({ rango: null })}>Rango de tiempo activo</Chip>
          )}
        </div>
      )}
    </div>
  );
}
