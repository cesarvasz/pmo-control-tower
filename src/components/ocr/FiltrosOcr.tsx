"use client";

// Filtros del reporte "Digitalización OCR". Todos GLOBALES: afectan KPIs,
// gráfica y tablas por igual.

import { FilterReset } from "@/components/ui";
import MultiSelect from "@/components/MultiSelect";
import type { Filtros, Opcion, Agrupacion, MaxHoras } from "@/lib/digitalizacion";

function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</label>
      <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
        {options.map(([v, l]) => (
          <button key={v} onClick={() => onChange(v)}
            className="px-3 py-2 text-[0.78rem] font-semibold transition-colors"
            style={{
              background: value === v ? "var(--bg-accent-soft)" : "var(--bg-surface)",
              color: value === v ? "var(--accent-light)" : "var(--text-secondary)",
            }}>{l}</button>
        ))}
      </div>
    </div>
  );
}

const AGRUPAR: readonly (readonly [Agrupacion, string])[] = [["mes", "Mes"], ["semana", "Semana"], ["dia", "Día"]];
const MAX_HORAS: readonly (readonly [MaxHoras, string])[] = [
  ["todos", "Todos"], ["8h", "T1 ≤ 8 h"], ["4h", "≤ 4 h"], ["2h", "≤ 2 h"], ["1h", "≤ 1 h"],
];

export default function FiltrosOcr({
  opciones, f, setF, rango, hayFiltros, onLimpiar,
}: {
  opciones: { clientes: Opcion[] };
  f: Filtros;
  setF: (p: Partial<Filtros>) => void;
  rango: { desde: string; hasta: string };
  hayFiltros: boolean;
  onLimpiar: () => void;
}) {
  const dateInput = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      <input
        type="date" value={value || ""} min={rango.desde || undefined} max={rango.hasta || undefined}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
      />
    </label>
  );

  return (
    <div className="mb-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <MultiSelect
          label="Cliente"
          options={opciones.clientes}
          selected={f.clientes}
          onToggle={(v, ch) => setF({ clientes: ch ? [...f.clientes.filter((x) => x !== v), v] : f.clientes.filter((x) => x !== v) })}
          onToggleAll={() => setF({ clientes: [] })}
        />
        {dateInput("Desde (Creación)", f.desde, (v) => setF({ desde: v }))}
        {dateInput("Hasta (Creación)", f.hasta, (v) => setF({ hasta: v }))}
        <Segmented label="Agrupar por" value={f.agrupar} options={AGRUPAR} onChange={(v) => setF({ agrupar: v })} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Segmented label="Casos extremos" value={f.maxHoras} options={MAX_HORAS} onChange={(v) => setF({ maxHoras: v })} />
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[0.8rem] font-semibold"
          style={{
            borderColor: f.soloCompletos ? "var(--accent)" : "var(--border)",
            background: f.soloCompletos ? "var(--bg-accent-soft)" : "var(--bg-surface)",
            color: f.soloCompletos ? "var(--accent-light)" : "var(--text-secondary)",
          }}
          title="Deja solo los files que ya tienen digitalización de documentos Y de carta de licencia (T1 y T2 calculables).">
          <input type="checkbox" checked={f.soloCompletos}
            onChange={(e) => setF({ soloCompletos: e.target.checked })}
            className="h-4 w-4 cursor-pointer" style={{ accentColor: "var(--accent)" }} />
          Solo files completos (T1 y T2)
        </label>
        {hayFiltros && <FilterReset onClick={onLimpiar} />}
      </div>

      <p className="mt-2 text-[0.68rem] text-[var(--text-muted)]">
        &quot;Casos extremos&quot; descarta los files cuya <strong>T1</strong> (Creación→documentos)
        supere ese tiempo hábil — sirve para ver el comportamiento normal sin los pendientes de
        varios días. El rango de fechas filtra por <strong>Creación</strong>.
      </p>
    </div>
  );
}
