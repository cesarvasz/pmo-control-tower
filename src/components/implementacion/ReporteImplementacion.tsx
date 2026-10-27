"use client";

// Reporte de Implementación (archivo "Clonacion files" → pestaña
// "implementacion"). Se monta como pestaña dentro de la página ROI, hermana de
// 003 y de Clonación pero con su propio dominio (lib/implementaciones.ts) — no
// comparte código con ellas a propósito.
//
// Vista principal: Clientes en filas y, por mes de cierre, Volumen (cantidad de
// files) y Profit (suma). El filtro de mes (línea de tiempo + selector) recorta
// las filas ANTES de agrupar, así que KPIs, matriz y detalle siempre cuadran.

import { useMemo, useState } from "react";
import { FilterReset, SectionHeader } from "@/components/ui";
import MultiSelect, { type MSOption } from "@/components/MultiSelect";
import TimelineImplementacion from "@/components/implementacion/TimelineImplementacion";
import TablaClienteMes from "@/components/implementacion/TablaClienteMes";
import TablaDetalleImplementacion from "@/components/implementacion/TablaDetalleImplementacion";
import {
  agruparPorClienteYMes, filtrarPorMeses, fmtImporte, serieMensual, totalesImplementacion,
} from "@/lib/implementaciones";
import type { ImplementacionRow } from "@/types";

function KpiCard({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div className="flex flex-col rounded-xl border p-[18px] text-center"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="text-[0.85rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 tabular-nums text-[1.9rem] font-extrabold leading-none"
        style={{ color: color ?? "var(--card-value-total)" }}>
        {valor}
      </div>
    </div>
  );
}

export default function ReporteImplementacion({ rows }: { rows: ImplementacionRow[] }) {
  const [elegidos, setElegidos] = useState<string[]>([]);

  const serie = useMemo(() => serieMensual(rows), [rows]);
  // Si al recargar desaparece un mes que estaba elegido, se descarta: dejarlo
  // vaciaría la vista sin que haya nada que el usuario pueda quitar.
  const meses = useMemo(() => elegidos.filter((m) => serie.some((p) => p.clave === m)), [elegidos, serie]);
  const filtradas = useMemo(() => filtrarPorMeses(rows, meses), [rows, meses]);
  const matriz = useMemo(() => agruparPorClienteYMes(filtradas), [filtradas]);
  const totales = useMemo(() => totalesImplementacion(filtradas), [filtradas]);
  const opcionesMes = useMemo<MSOption[]>(
    () => serie.map((p) => ({ value: p.clave, label: p.label, count: p.volumen })), [serie]);

  const alternarMes = (clave: string) =>
    setElegidos(meses.includes(clave) ? meses.filter((m) => m !== clave) : [...meses, clave]);

  return (
    <div>
      <SectionHeader
        title="Implementación"
        badge={`${filtradas.length.toLocaleString("es-GT")} de ${rows.length.toLocaleString("es-GT")} registros`}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <MultiSelect
          label="Mes de cierre"
          options={opcionesMes}
          selected={meses}
          onToggle={(v, ch) => setElegidos(ch ? [...meses.filter((m) => m !== v), v] : meses.filter((m) => m !== v))}
          onToggleAll={() => setElegidos([])}
        />
        {meses.length > 0 && <FilterReset onClick={() => setElegidos([])} />}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Volumen" valor={filtradas.length.toLocaleString("es-GT")} />
        <KpiCard label="Ingresos facturados" valor={fmtImporte(totales.ingresos)} />
        <KpiCard label="Egresos liquidados" valor={fmtImporte(totales.egresos)} />
        <KpiCard label="Profit" valor={fmtImporte(totales.profit)}
          color={totales.profit < 0 ? "var(--bad)" : "var(--ok)"} />
      </div>

      <div className="mb-5">
        <TimelineImplementacion serie={serie} seleccion={meses} onAlternarMes={alternarMes} />
      </div>

      <section className="mt-7">
        <SectionHeader title="Por cliente y mes" badge={`${matriz.clientes.length.toLocaleString("es-GT")} clientes`} />
        <TablaClienteMes matriz={matriz} />
      </section>

      <section className="mt-7">
        <SectionHeader title="Detalle" badge={`${filtradas.length.toLocaleString("es-GT")} registros`} />
        <TablaDetalleImplementacion rows={filtradas} />
      </section>
    </div>
  );
}
