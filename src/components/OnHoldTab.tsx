"use client";

// Pestaña «On Hold» de Calidad & Cumplimiento: la lista de TODOS los Proyectos y PML que aún
// no se completan, cada uno con su botón para pausarlo o reactivarlo (ver OnHoldButton). Lo que
// está en On Hold no cuenta en ninguna métrica (ver lib/onHold.ts), por eso esta lista lee el
// dashboard COMPLETO (`dataTodo`) y no el que usan las métricas. Sin la acción "edit_on_hold"
// la lista se ve igual pero sin botones. Primero van los Proyectos (por su ID) y luego los PML
// (por su PML ID); cada tipo lleva su color (los mismos de la campanita de notificaciones).

import { useMemo, useState } from "react";
import { useMe } from "@/context/PermissionsContext";
import { hasAction } from "@/lib/permissions";
import { filasOnHold, type FilaOnHold } from "@/lib/onHoldLista";
import type { OnHoldTipo } from "@/lib/onHold";
import MultiSelect, { type MSOption } from "@/components/MultiSelect";
import OnHoldButton, { OnHoldBadge } from "@/components/OnHoldButton";
import { EmptyRow, FilterReset, StatCard } from "@/components/ui";
import type { DashboardData } from "@/types";

const COLOR_TIPO: Record<OnHoldTipo, string> = { proyecto: "#38bdf8", pml: "#a78bfa" };
const ETIQUETA_TIPO: Record<OnHoldTipo, string> = { proyecto: "Proyecto", pml: "PML" };

type FiltroTipo = "todos" | OnHoldTipo;
const FILTROS_TIPO: [FiltroTipo, string][] = [["todos", "Todos"], ["proyecto", "Proyectos"], ["pml", "PML"]];

/** Fondo suave del color de un tipo, para la etiqueta. */
const tinte = (color: string) => `color-mix(in srgb, ${color} 18%, transparent)`;

export default function OnHoldTab({ data }: { data: DashboardData }) {
  const { me } = useMe();
  const puede = hasAction(me?.permissions, "edit_on_hold");

  const [pms, setPms] = useState<string[]>([]);
  const [tipo, setTipo] = useState<FiltroTipo>("todos");
  const [soloOnHold, setSoloOnHold] = useState(false);

  // La lista ya viene ordenada: Proyectos por ID y luego PML por PML ID.
  const filas = useMemo(() => filasOnHold(data), [data]);

  // Los números de cada filtro cuentan lo que quedaría con los OTROS filtros puestos.
  const pasa = (f: FilaOnHold, ignorar?: "pm" | "tipo") =>
    (ignorar === "pm" || !pms.length || pms.includes(f.pm)) &&
    (ignorar === "tipo" || tipo === "todos" || f.tipo === tipo) &&
    (!soloOnHold || f.enOnHold);

  const basePm = filas.filter((f) => pasa(f, "pm"));
  const pmOpts: MSOption[] = [...new Set(filas.map((f) => f.pm).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((pm) => ({ value: pm, label: pm, count: basePm.filter((f) => f.pm === pm).length }));

  const baseTipo = filas.filter((f) => pasa(f, "tipo"));
  const cuenta = (t: FiltroTipo) => (t === "todos" ? baseTipo.length : baseTipo.filter((f) => f.tipo === t).length);

  const visibles = filas.filter((f) => pasa(f));
  const nOnHold = filas.filter((f) => f.enOnHold).length;
  const hayFiltro = pms.length > 0 || tipo !== "todos" || soloOnHold;

  return (
    <div>
      <p className="mb-4 text-[0.82rem] text-[var(--text-muted)]">
        Proyectos y PML que aún no se completan. Lo que pongas en On Hold deja de contar en todas las métricas hasta que lo reactives.
        {!puede && " Solo quien tiene el permiso puede cambiarlo."}
      </p>

      <div className="mb-5 grid grid-cols-3 gap-4 sm:max-w-xl">
        <StatCard value={filas.length - nOnHold} label="Activos" color="#10b981" borderColor="#10b981" />
        <StatCard value={nOnHold} label="En On Hold" color="var(--warn)" borderColor="var(--warn)"
          active={soloOnHold} onClick={() => setSoloOnHold((v) => !v)} />
        <StatCard value={filas.length} label="Total" />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3.5">
        <MultiSelect label="PM" options={pmOpts} selected={pms}
          onToggle={(v, ch) => setPms((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))}
          onToggleAll={() => setPms([])} />

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

        {hayFiltro && <FilterReset onClick={() => { setPms([]); setTipo("todos"); setSoloOnHold(false); }} />}
      </div>

      {visibles.length === 0 ? <EmptyRow /> : (
        <div className="table-wrap">
          <table className="pmo">
            <thead>
              <tr>
                <th>Tipo</th><th>ID</th><th>Nombre</th><th>PM</th><th>Fase</th><th>Situación</th>
                {puede && <th />}
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const color = COLOR_TIPO[f.tipo];
                return (
                  <tr key={`${f.tipo}-${f.id}`} style={f.enOnHold ? { opacity: 0.75 } : undefined}>
                    <td style={{ borderLeft: `3px solid ${color}` }}>
                      <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] font-semibold"
                        style={{ background: tinte(color), color }}>
                        {ETIQUETA_TIPO[f.tipo]}
                      </span>
                    </td>
                    <td className="ini-id" style={{ color, fontWeight: 600 }}>{f.codigo}</td>
                    <td className="max-w-[360px] truncate text-[var(--text-secondary)]" title={f.nombre}>{f.nombre || "—"}</td>
                    <td className="pm-name">{f.pm || "—"}</td>
                    <td style={{ fontSize: ".78rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{f.fase}</td>
                    <td>
                      {f.enOnHold
                        ? <OnHoldBadge />
                        : <span className="text-[0.78rem] text-[var(--text-muted)]">Activo</span>}
                    </td>
                    {puede && (
                      <td style={{ textAlign: "right" }}>
                        <OnHoldButton tipo={f.tipo} id={f.id} nombre={f.codigo} activo={f.enOnHold} />
                      </td>
                    )}
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
