"use client";

// Reporte de Clonación de Files (archivo "Clonacion files" → pestaña
// "clonacion", distinto al de la hoja ROI de 003). Se monta como pestaña
// dentro de la página ROI, hermana de 003 pero con un dominio propio
// (lib/clonaciones.ts) — no comparte código con 003 a propósito.
//
// Los registros se construyen UNA sola vez por carga; los filtros solo
// seleccionan subconjuntos, así que cambiar un filtro recalcula agregados
// sobre un arreglo ya normalizado. C4 (distribución por rangos) es la única
// sección que se calcula sin su propio filtro — ver distribucionRangos.

import { useMemo, useState } from "react";
import { SectionHeader } from "@/components/ui";
import { fmtHHMMSS } from "@/lib/horario";
import FiltrosClonacion from "@/components/clonacion/FiltrosClonacion";
import TimelineClonacion from "@/components/clonacion/TimelineClonacion";
import DistribucionRangos from "@/components/clonacion/DistribucionRangos";
import RankingPersonas from "@/components/clonacion/RankingPersonas";
import CostoClonacion from "@/components/clonacion/CostoClonacion";
import TablaDetalleClonacion from "@/components/clonacion/TablaDetalleClonacion";
import {
  construirRegistros, opcionesDeFiltro, aplicarFiltros, distribucionRangos,
  calcularKPIs, serieMensual, agruparPor, costoClonacion,
  FILTROS_VACIOS, METRICA_LABEL, TARIFA_CLONACION_DEFECTO,
  type Filtros, type Metrica, type RangoKey,
} from "@/lib/clonaciones";
import type { ClonacionRow } from "@/types";

const usd = (n: number) =>
  n >= 10_000 ? `$${Math.round(n / 1000).toLocaleString("es-GT")} K` : `$${Math.round(n).toLocaleString("es-GT")}`;

function KpiCard({ label, valor, sub, activo, onClick, color }: {
  label: string; valor: React.ReactNode; sub?: string; activo?: boolean; onClick?: () => void; color?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex flex-col rounded-xl border p-[18px] text-center transition-transform ${onClick ? "cursor-pointer hover:-translate-y-0.5" : ""}`}
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)", boxShadow: activo ? "0 0 0 2px var(--accent)" : undefined }}
    >
      <div className="text-[0.66rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 tabular-nums text-[1.4rem] font-extrabold leading-none" style={{ color: color ?? "var(--card-value-total)" }}>
        {valor}
      </div>
      {sub && <div className="mt-1 text-[0.68rem] text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}

export default function ReporteClonacion({ rows }: { rows: ClonacionRow[] }) {
  const [f, setF] = useState<Filtros>(FILTROS_VACIOS);
  const [tarifa, setTarifa] = useState(TARIFA_CLONACION_DEFECTO);

  const set = (p: Partial<Filtros>) => setF((x) => ({ ...x, ...p }));

  const todos = useMemo(() => construirRegistros(rows), [rows]);
  const opciones = useMemo(() => opcionesDeFiltro(todos), [todos]);
  const filtrados = useMemo(() => aplicarFiltros(todos, f), [todos, f]);
  const distribucion = useMemo(() => distribucionRangos(todos, f), [todos, f]);
  const serie = useMemo(() => serieMensual(filtrados), [filtrados]);
  const costo = useMemo(() => costoClonacion(filtrados, tarifa), [filtrados, tarifa]);
  const kpis = useMemo(() => calcularKPIs(todos, filtrados, f, costo.costoTotal), [todos, filtrados, f, costo.costoTotal]);
  const rankingUsuarios = useMemo(() => agruparPor(filtrados, "usuario", f.metrica), [filtrados, f.metrica]);
  const rankingClientes = useMemo(() => agruparPor(filtrados, "cliente", f.metrica), [filtrados, f.metrica]);

  const alternarMes = (clave: string) =>
    set({ meses: f.meses.includes(clave) ? f.meses.filter((v) => v !== clave) : [...f.meses, clave] });
  const alternarUsuario = (v: string) =>
    set({ usuarios: f.usuarios.includes(v) && f.usuarios.length === 1 ? [] : [v] });
  const alternarCliente = (v: string) =>
    set({ clientes: f.clientes.includes(v) && f.clientes.length === 1 ? [] : [v] });
  const alternarRango = (key: RangoKey) => set({ rango: f.rango === key ? null : key });

  return (
    <div>
      <SectionHeader
        title="Clonación de Files"
        badge={`${filtrados.length.toLocaleString("es-GT")} de ${todos.length.toLocaleString("es-GT")} clonaciones`}
      />

      <FiltrosClonacion opciones={opciones} f={f} onChange={set} />

      {/* Selector de medida — afecta KPIs, timeline y rankings a la vez. */}
      <div className="mb-4 flex flex-col gap-1.5">
        <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Medida</span>
        <div className="flex w-fit overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
          {(["mediana", "promedio", "p90"] as Metrica[]).map((m) => (
            <button key={m} onClick={() => set({ metrica: m })}
              className="px-4 py-1.5 text-sm font-medium transition-colors"
              style={{
                background: f.metrica === m ? "var(--accent)" : "var(--bg-surface)",
                color: f.metrica === m ? "#fff" : "var(--text-secondary)",
              }}>{METRICA_LABEL[m]}</button>
          ))}
        </div>
      </div>

      {/* ── C2 KPIs ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <KpiCard label="Files" valor={kpis.n.toLocaleString("es-GT")} />
        <KpiCard label="Mediana" valor={fmtHHMMSS(kpis.mediana)} activo={f.metrica === "mediana"} onClick={() => set({ metrica: "mediana" })} />
        <KpiCard label="Promedio" valor={fmtHHMMSS(kpis.promedio)} activo={f.metrica === "promedio"} onClick={() => set({ metrica: "promedio" })}
          color={kpis.promedioInflado ? "var(--warn)" : undefined}
          sub={kpis.promedioInflado ? `inflado por ${kpis.casosInflados} caso${kpis.casosInflados === 1 ? "" : "s"} > 1 año` : undefined} />
        <KpiCard label="P90" valor={fmtHHMMSS(kpis.p90)} activo={f.metrica === "p90"} onClick={() => set({ metrica: "p90" })} />
        <KpiCard label="≤ 9 h hábiles" valor={kpis.pctResueltos9h == null ? "—" : `${kpis.pctResueltos9h.toFixed(0)}%`} sub="resueltos" />
        <KpiCard label="Anómalos" valor={kpis.anomalos.toLocaleString("es-GT")} color={kpis.anomalos > 0 ? "var(--bad)" : undefined}
          sub="Solicitud > Creación" />
        <KpiCard label="Costo total" valor={usd(kpis.costoTotal)} />
      </div>

      {/* ── C3 Línea de tiempo mensual ── */}
      <div className="mb-5">
        <TimelineClonacion serie={serie} metrica={f.metrica} seleccion={f.meses} onSeleccionarMes={alternarMes} />
      </div>

      {/* ── C4 Distribución por rangos (filtro) ── */}
      <div className="mb-5">
        <DistribucionRangos filas={distribucion} seleccion={f.rango} onSeleccionar={alternarRango} />
      </div>

      {/* ── C5 Rankings ── */}
      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RankingPersonas titulo="Por usuario" filas={rankingUsuarios} metrica={f.metrica} seleccion={f.usuarios} onSeleccionar={alternarUsuario} />
        <RankingPersonas titulo="Por cliente" filas={rankingClientes} metrica={f.metrica} seleccion={f.clientes} onSeleccionar={alternarCliente} />
      </div>

      {/* ── C6 Costo del tiempo ── */}
      <section className="mt-7">
        <SectionHeader title="Costo del tiempo" badge={`$${tarifa}/h`} />
        <CostoClonacion costo={costo} tarifa={tarifa} onTarifa={setTarifa} onSeleccionarMes={alternarMes} />
      </section>

      {/* ── C7 Detalle ── */}
      <section className="mt-7">
        <SectionHeader title="Detalle" badge={`${filtrados.length.toLocaleString("es-GT")} clonaciones`} />
        <TablaDetalleClonacion regs={filtrados} />
      </section>
    </div>
  );
}
