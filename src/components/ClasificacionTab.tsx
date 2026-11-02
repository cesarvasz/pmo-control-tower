"use client";

// Pestaña «Clasificación» de Calidad & Cumplimiento: todos los Proyectos y PML con su ID, nombre,
// PM, CKU y Sponsor (ver lib/clasificacion.ts), y un dropdown para clasificar cada uno como Clase
// A, B o C. Lee el dashboard COMPLETO (`dataTodo`): aquí va todo, también lo completo, cerrado o en
// On Hold. Primero los Proyectos y luego los PML; cada tipo lleva su color (los mismos de la
// pestaña On Hold). La clase se guarda con POST /api/clasificacion y solo la cambia quien tiene la
// acción "edit_clasificacion"; el resto la ve de solo lectura. Lo que nadie ha clasificado muestra
// su clase de siempre (ver lib/claseProyecto.ts) y la nueva la reemplaza.

import { useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { useMe } from "@/context/PermissionsContext";
import { authedFetch } from "@/lib/api";
import { CLASES_ASIGNABLES, type ClaseAsignable } from "@/lib/claseProyecto";
import { filasClasificacion, type FilaClasificacion, type TipoClasificacion } from "@/lib/clasificacion";
import { hasAction } from "@/lib/permissions";
import MultiSelect, { type MSOption } from "@/components/MultiSelect";
import { EmptyRow, FilterReset, StatCard } from "@/components/ui";
import type { DashboardData } from "@/types";

const COLOR_TIPO: Record<TipoClasificacion, string> = { proyecto: "#38bdf8", pml: "#a78bfa" };
const ETIQUETA_TIPO: Record<TipoClasificacion, string> = { proyecto: "Proyecto", pml: "PML" };

type FiltroTipo = "todos" | TipoClasificacion;
const FILTROS_TIPO: [FiltroTipo, string][] = [["todos", "Todos"], ["proyecto", "Proyectos"], ["pml", "PML"]];

type Dimension = "pm" | "cku" | "sponsor" | "clase";
const SIN_FILTROS: Record<Dimension, string[]> = { pm: [], cku: [], sponsor: [], clase: [] };

/** Fondo suave del color de un tipo, para la etiqueta. */
const tinte = (color: string) => `color-mix(in srgb, ${color} 18%, transparent)`;

const etiquetaClase = (c: string) => (c === "Sin clasificar" ? c : `Clase ${c}`);

const sinDato = <span className="text-[var(--text-disabled)]">—</span>;

export default function ClasificacionTab({ data }: { data: Pick<DashboardData, "projBoards" | "req" | "estrategiaMap" | "clases"> }) {
  const { me } = useMe();
  const { setClase, refresh } = useData();
  const puede = hasAction(me?.permissions, "edit_clasificacion");

  const [sel, setSel] = useState<Record<Dimension, string[]>>(SIN_FILTROS);
  const [tipo, setTipo] = useState<FiltroTipo>("todos");

  // La lista ya viene ordenada: Proyectos por ID y luego PML por PML ID.
  const filas = useMemo(() => filasClasificacion(data), [data]);

  // Los números de cada filtro cuentan lo que quedaría con los OTROS filtros puestos.
  const pasa = (f: FilaClasificacion, ignorar?: Dimension | "tipo") =>
    (ignorar === "tipo" || tipo === "todos" || f.tipo === tipo) &&
    (["pm", "cku", "sponsor", "clase"] as const).every((d) => ignorar === d || !sel[d].length || sel[d].includes(f[d]));

  const opciones = (d: Dimension): MSOption[] => {
    const base = filas.filter((f) => pasa(f, d));
    return [...new Set(filas.map((f) => f[d]).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "es"))
      .map((v) => ({ value: v, label: d === "clase" ? etiquetaClase(v) : v, count: base.filter((f) => f[d] === v).length }));
  };
  const toggle = (d: Dimension) => (v: string, ch: boolean) =>
    setSel((s) => ({ ...s, [d]: ch ? [...s[d].filter((y) => y !== v), v] : s[d].filter((y) => y !== v) }));
  const limpiar = (d: Dimension) => () => setSel((s) => ({ ...s, [d]: [] }));

  const baseTipo = filas.filter((f) => pasa(f, "tipo"));
  const cuenta = (t: FiltroTipo) => (t === "todos" ? baseTipo.length : baseTipo.filter((f) => f.tipo === t).length);

  const visibles = filas.filter((f) => pasa(f));
  const hayFiltro = tipo !== "todos" || Object.values(sel).some((v) => v.length > 0);

  // Optimista: la clase cambia al instante; si el servidor la rechaza, se vuelve a cargar lo real.
  const clasificar = async (f: FilaClasificacion, clase: ClaseAsignable) => {
    if (clase === f.clase) return;
    setClase(f.id, clase, me?.email);
    try {
      const res = await authedFetch("/api/clasificacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: f.id, clase }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      await refresh();
    }
  };

  return (
    <div>
      <p className="mb-4 text-[0.82rem] text-[var(--text-muted)]">
        Todos los Proyectos y PML con su PM, CKU y Sponsor.
        {puede ? " Clasifica cada uno como Clase A, B o C." : " Solo quien tiene el permiso puede cambiar la clase."}
      </p>

      <div className="mb-5 grid grid-cols-3 gap-4 sm:max-w-xl">
        <StatCard value={filas.filter((f) => f.tipo === "proyecto").length} label="Proyectos" color={COLOR_TIPO.proyecto} borderColor={COLOR_TIPO.proyecto} />
        <StatCard value={filas.filter((f) => f.tipo === "pml").length} label="PML" color={COLOR_TIPO.pml} borderColor={COLOR_TIPO.pml} />
        <StatCard value={filas.length} label="Total" />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3.5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Tipo</span>
          <div role="group" aria-label="Filtrar por tipo" className="inline-flex rounded-lg border p-0.5"
            style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}>
            {FILTROS_TIPO.map(([v, label]) => (
              <button key={v} type="button" onClick={() => setTipo(v)} aria-pressed={tipo === v}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                style={tipo === v ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}>
                {v !== "todos" && (
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR_TIPO[v] }} />
                )}
                {label}
                <span className="text-xs tabular-nums opacity-70">({cuenta(v)})</span>
              </button>
            ))}
          </div>
        </div>

        <MultiSelect label="Clase" options={opciones("clase")} selected={sel.clase} onToggle={toggle("clase")} onToggleAll={limpiar("clase")} />
        <MultiSelect label="PM" options={opciones("pm")} selected={sel.pm} onToggle={toggle("pm")} onToggleAll={limpiar("pm")} />
        <MultiSelect label="CKU" options={opciones("cku")} selected={sel.cku} onToggle={toggle("cku")} onToggleAll={limpiar("cku")} />
        <MultiSelect label="Sponsor" options={opciones("sponsor")} selected={sel.sponsor} onToggle={toggle("sponsor")} onToggleAll={limpiar("sponsor")} />

        {hayFiltro && <FilterReset onClick={() => { setSel(SIN_FILTROS); setTipo("todos"); }} />}
      </div>

      {visibles.length === 0 ? <EmptyRow /> : (
        <div className="table-wrap">
          <table className="pmo">
            <thead>
              <tr><th>Tipo</th><th>ID</th><th>Nombre</th><th>PM</th><th>CKU</th><th>Sponsor</th><th>Clase</th></tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const color = COLOR_TIPO[f.tipo];
                return (
                  <tr key={`${f.tipo}-${f.id}`}>
                    <td style={{ borderLeft: `3px solid ${color}` }}>
                      <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] font-semibold"
                        style={{ background: tinte(color), color }}>
                        {ETIQUETA_TIPO[f.tipo]}
                      </span>
                    </td>
                    <td className="ini-id" style={{ color, fontWeight: 600 }}>{f.codigo}</td>
                    <td className="max-w-[360px] truncate text-[var(--text-secondary)]" title={f.nombre}>{f.nombre || sinDato}</td>
                    <td className="pm-name">{f.pm || sinDato}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{f.cku || sinDato}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{f.sponsor || sinDato}</td>
                    <td>
                      {puede ? (
                        <select
                          value={f.clase} onChange={(e) => clasificar(f, e.target.value as ClaseAsignable)}
                          aria-label={`Clase de ${f.codigo}`}
                          className="rounded-lg border px-2 py-1 text-[0.78rem] font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                          style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}
                        >
                          {f.clase === "Sin clasificar" && <option value="Sin clasificar" disabled>Sin clasificar</option>}
                          {CLASES_ASIGNABLES.map((c) => <option key={c} value={c}>Clase {c}</option>)}
                        </select>
                      ) : (
                        <span className="whitespace-nowrap text-[0.8rem] font-semibold text-[var(--text-secondary)]">{etiquetaClase(f.clase)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
