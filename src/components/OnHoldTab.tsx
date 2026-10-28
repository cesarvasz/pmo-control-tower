"use client";

// Pestaña «On Hold» de Calidad & Cumplimiento: la lista de TODOS los Proyectos y PML que aún
// no se completan, cada uno con su botón para pausarlo o reactivarlo (ver OnHoldButton). Lo que
// está en On Hold no cuenta en ninguna métrica (ver lib/onHold.ts), por eso esta lista lee el
// dashboard COMPLETO (`dataTodo`) y no el que usan las métricas. Sin la acción "edit_on_hold"
// la lista se ve igual pero sin botones.

import { useMemo, useState } from "react";
import { useMe } from "@/context/PermissionsContext";
import { hasAction } from "@/lib/permissions";
import { filasOnHold, type FilaOnHold } from "@/lib/onHoldLista";
import MultiSelect, { type MSOption } from "@/components/MultiSelect";
import OnHoldButton, { OnHoldBadge } from "@/components/OnHoldButton";
import { EmptyRow, FilterReset, StatCard } from "@/components/ui";
import type { DashboardData } from "@/types";

export default function OnHoldTab({ data }: { data: DashboardData }) {
  const { me } = useMe();
  const puede = hasAction(me?.permissions, "edit_on_hold");

  const [pms, setPms] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [soloOnHold, setSoloOnHold] = useState(false);

  const filas = useMemo(() => filasOnHold(data), [data]);

  // Cada filtro cuenta lo que quedaría con los OTROS filtros puestos (como en las demás pestañas).
  const filtrar = (f: FilaOnHold, ign?: "pm" | "tipo") =>
    (ign === "pm" || !pms.length || pms.includes(f.pm)) &&
    (ign === "tipo" || !tipos.length || tipos.includes(f.tipo)) &&
    (!soloOnHold || f.enOnHold);

  const basePm = filas.filter((f) => filtrar(f, "pm"));
  const pmOpts: MSOption[] = [...new Set(filas.map((f) => f.pm).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((pm) => ({ value: pm, label: pm, count: basePm.filter((f) => f.pm === pm).length }));

  const baseTipo = filas.filter((f) => filtrar(f, "tipo"));
  const tipoOpts: MSOption[] = (["proyecto", "pml"] as const).map((t) => ({
    value: t, label: t === "proyecto" ? "Proyecto" : "PML", count: baseTipo.filter((f) => f.tipo === t).length,
  }));

  const visibles = filas.filter((f) => filtrar(f));
  const nOnHold = filas.filter((f) => f.enOnHold).length;
  const hayFiltro = pms.length > 0 || tipos.length > 0 || soloOnHold;

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
        <MultiSelect label="Tipo" options={tipoOpts} selected={tipos}
          onToggle={(v, ch) => setTipos((x) => (ch ? [...x.filter((y) => y !== v), v] : x.filter((y) => y !== v)))}
          onToggleAll={() => setTipos([])} />
        {hayFiltro && <FilterReset onClick={() => { setPms([]); setTipos([]); setSoloOnHold(false); }} />}
      </div>

      {visibles.length === 0 ? <EmptyRow /> : (
        <div className="table-wrap">
          <table className="pmo">
            <thead>
              <tr>
                <th>Tipo</th><th>Código</th><th>Nombre</th><th>PM</th><th>Fase</th><th>Situación</th>
                {puede && <th />}
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={`${f.tipo}-${f.id}`} style={f.enOnHold ? { opacity: 0.75 } : undefined}>
                  <td>
                    <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] font-semibold"
                      style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                      {f.tipo === "proyecto" ? "Proyecto" : "PML"}
                    </span>
                  </td>
                  <td className="ini-id">{f.codigo}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
