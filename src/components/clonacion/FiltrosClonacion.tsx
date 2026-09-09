"use client";

// C1 — Filtros de la pestaña Clonación de Files, con buscadores para Usuario
// (~80) y Cliente (~280), búsqueda de c807_file con debounce, y chips de
// filtros activos removibles.

import { useEffect, useState } from "react";
import { FilterReset } from "@/components/ui";
import MultiSelect from "@/components/MultiSelect";
import BuscableSelect from "@/components/tramites/BuscableSelect";
import {
  ANTIGUEDAD_LABEL, FILTROS_VACIOS, hayFiltros, etiquetaMes, HERRAMIENTA_LABEL,
  type AntiguedadMax, type Filtros, type OpcionesFiltro, type Herramienta,
} from "@/lib/clonaciones";

const ANTIGUEDADES: AntiguedadMax[] = ["sin_limite", "365", "90", "30"];

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.92rem]"
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
  const limpiarTodos = () => onChange(FILTROS_VACIOS);

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
        <BuscableSelect label="Mesa" options={opciones.mesas} selected={f.mesas}
          onChange={(v) => onChange({ mesas: v })} minWidth={170} />
        <BuscableSelect label="Proceso" options={opciones.procesos} selected={f.procesos}
          onChange={(v) => onChange({ procesos: v })} minWidth={170} />
        <MultiSelect
          label="Herramienta"
          options={opciones.herramienta}
          selected={f.herramienta}
          onToggle={(v, ch) => onChange({
            herramienta: ch
              ? [...f.herramienta.filter((x) => x !== v), v as Herramienta]
              : f.herramienta.filter((x) => x !== v),
          })}
          onToggleAll={() => onChange({ herramienta: [] })}
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.9rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Archivo (c807_file)</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className="w-[190px] rounded-lg border px-3 py-2 text-base outline-none"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[0.9rem] font-medium uppercase tracking-wide text-[var(--text-muted)]" title="Días calendario entre Solicitud_fecha y Creacion_fecha">
            Antigüedad máx. de la solicitud
          </span>
          <select value={f.antiguedadMax} onChange={(e) => onChange({ antiguedadMax: e.target.value as AntiguedadMax })}
            className="rounded-lg border px-3 py-2 text-[1.05rem] font-semibold outline-none"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            {ANTIGUEDADES.map((a) => <option key={a} value={a}>{ANTIGUEDAD_LABEL[a]}</option>)}
          </select>
        </label>

        <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[1.02rem]"
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
          {f.mesas.map((v) => (
            <Chip key={`ms-${v}`} onRemove={() => onChange({ mesas: f.mesas.filter((x) => x !== v) })}>Mesa: {v}</Chip>
          ))}
          {f.procesos.map((v) => (
            <Chip key={`p-${v}`} onRemove={() => onChange({ procesos: f.procesos.filter((x) => x !== v) })}>Proceso: {v}</Chip>
          ))}
          {f.herramienta.map((v) => (
            <Chip key={`h-${v}`} onRemove={() => onChange({ herramienta: f.herramienta.filter((x) => x !== v) })}>{HERRAMIENTA_LABEL[v]}</Chip>
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
        </div>
      )}
    </div>
  );
}
