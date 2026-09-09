"use client";

// Reporte de Clonación de Files (archivo "Clonacion files" → pestaña
// "clonacion", distinto al de la hoja ROI de 003). Se monta como pestaña
// dentro de la página ROI, hermana de 003 pero con un dominio propio
// (lib/clonaciones.ts) — no comparte código con 003 a propósito.
//
// Los registros se construyen UNA sola vez por carga; los filtros solo
// seleccionan subconjuntos, así que cambiar un filtro recalcula agregados
// sobre un arreglo ya normalizado.

import { useMemo, useState } from "react";
import { SectionHeader } from "@/components/ui";
import { fmtHHMMSS } from "@/lib/horario";
import FiltrosClonacion from "@/components/clonacion/FiltrosClonacion";
import TimelineOrigenClonacion from "@/components/clonacion/TimelineOrigenClonacion";
import RankingPersonas from "@/components/clonacion/RankingPersonas";
import CostoClonacion from "@/components/clonacion/CostoClonacion";
import TablaDetalleClonacion from "@/components/clonacion/TablaDetalleClonacion";
import {
  construirRegistros, opcionesDeFiltro, aplicarFiltros,
  calcularKPIs, serieMensual, agruparPor, costoClonacionPorOrigen, promedio,
  FILTROS_VACIOS, TARIFA_CLONACION_DEFECTO,
  type Filtros,
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
      <div className="text-[0.85rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 tabular-nums text-[1.9rem] font-extrabold leading-none" style={{ color: color ?? "var(--card-value-total)" }}>
        {valor}
      </div>
      {sub && <div className="mt-1 text-[0.87rem] text-[var(--text-muted)]">{sub}</div>}
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
  const serieOrigen = useMemo(() => ({
    padreSv: serieMensual(filtrados.filter((r) => r.origenTipo !== "v")),
    v: serieMensual(filtrados.filter((r) => r.origenTipo === "v")),
  }), [filtrados]);
  const costoPorOrigen = useMemo(() => costoClonacionPorOrigen(filtrados, tarifa), [filtrados, tarifa]);
  // Promedio de tiempo hábil partido por Origen — responde a los filtros.
  const promedios = useMemo(() => {
    const seg = (rs: typeof filtrados) => rs.filter((r) => r.segHabiles != null).map((r) => r.segHabiles as number);
    return {
      padreSv: promedio(seg(filtrados.filter((r) => r.origenTipo !== "v"))),
      v: promedio(seg(filtrados.filter((r) => r.origenTipo === "v"))),
    };
  }, [filtrados]);
  // El "Ahorro $" es una cifra ACUMULADA del valor de la herramienta: se calcula
  // siempre sobre todos los registros, no sobre el recorte filtrado.
  const ahorroTotal = useMemo(() => costoClonacionPorOrigen(todos, tarifa).contrafactual, [todos, tarifa]);
  const kpis = useMemo(() => calcularKPIs(todos, filtrados, f, costoPorOrigen.costoTotal), [todos, filtrados, f, costoPorOrigen.costoTotal]);
  const rankingUsuarios = useMemo(() => agruparPor(filtrados, "usuario", "promedio"), [filtrados]);
  const rankingClientes = useMemo(() => agruparPor(filtrados, "cliente", "promedio"), [filtrados]);
  const rankingMesas = useMemo(() => agruparPor(filtrados, "mesa", "promedio"), [filtrados]);
  const rankingProcesos = useMemo(() => agruparPor(filtrados, "proceso", "promedio"), [filtrados]);

  const alternarMes = (clave: string) =>
    set({ meses: f.meses.includes(clave) ? f.meses.filter((v) => v !== clave) : [...f.meses, clave] });
  const alternarUsuario = (v: string) =>
    set({ usuarios: f.usuarios.includes(v) && f.usuarios.length === 1 ? [] : [v] });
  const alternarCliente = (v: string) =>
    set({ clientes: f.clientes.includes(v) && f.clientes.length === 1 ? [] : [v] });
  const alternarMesa = (v: string) =>
    set({ mesas: f.mesas.includes(v) && f.mesas.length === 1 ? [] : [v] });
  const alternarProceso = (v: string) =>
    set({ procesos: f.procesos.includes(v) && f.procesos.length === 1 ? [] : [v] });

  return (
    <div className="clonacion-report">
      <SectionHeader
        title="Clonación de Files"
        badge={`${filtrados.length.toLocaleString("es-GT")} de ${todos.length.toLocaleString("es-GT")} clonaciones`}
      />

      <FiltrosClonacion opciones={opciones} f={f} onChange={set} />

      {/* Todas las cifras de tiempo son PROMEDIO en horario hábil. */}
      <p className="mb-4 text-[0.87rem] leading-relaxed text-[var(--text-muted)]">
        Todas las cifras de tiempo son el <strong>promedio</strong> en horario hábil.{" "}
        <strong>Con herramienta</strong> = réplicas con file padre localizado; su tiempo se mide desde
        la creación del file padre. <strong>Sin herramienta</strong> = el resto; se mide desde la
        Solicitud. Siempre hasta la Creación de la fila. El filtro de antigüedad se queda con Solicitud → Creación.
      </p>

      {/* ── C2 KPIs ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Files" valor={kpis.n.toLocaleString("es-GT")} />
        <KpiCard label="Promedio sin herramienta" valor={fmtHHMMSS(promedios.padreSv)}
          sub={`${costoPorOrigen.padreSv.nFiles.toLocaleString("es-GT")} files sin herramienta`} />
        <KpiCard label="Promedio con herramienta" valor={fmtHHMMSS(promedios.v)}
          sub={`${costoPorOrigen.contrafactual.nFilesV.toLocaleString("es-GT")} files con herramienta`} />
        <KpiCard label="Costo sin herramienta" valor={usd(costoPorOrigen.padreSv.costoTotal)}
          sub={`$${costoPorOrigen.padreSv.costoPorFile.toFixed(2)}/file`} />
        <KpiCard label="Costo con herramienta" valor={usd(costoPorOrigen.v.costoTotal)}
          sub={`${costoPorOrigen.contrafactual.nFilesV.toLocaleString("es-GT")} files`} />
        <KpiCard label="Ahorro $" valor={usd(ahorroTotal.ahorro)} color="var(--ok)"
          sub={`acumulado · ${ahorroTotal.nFilesV.toLocaleString("es-GT")} files con herramienta · no cambia con filtros`} />
      </div>

      {/* ── C3 Línea de tiempo: Padres+SV vs Réplicas V ── */}
      <div className="mb-5">
        <TimelineOrigenClonacion
          padreSv={serieOrigen.padreSv}
          v={serieOrigen.v}
          seleccion={f.meses}
          onSeleccionarMes={alternarMes}
        />
      </div>

      {/* ── C5 Rankings — promedio y mismo recorte filtrado en las 4 dimensiones ── */}
      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RankingPersonas titulo="Por usuario" filas={rankingUsuarios} seleccion={f.usuarios} onSeleccionar={alternarUsuario} />
        <RankingPersonas titulo="Por cliente" filas={rankingClientes} seleccion={f.clientes} onSeleccionar={alternarCliente} />
        <RankingPersonas titulo="Por mesa" filas={rankingMesas} seleccion={f.mesas} onSeleccionar={alternarMesa} />
        <RankingPersonas titulo="Por proceso" filas={rankingProcesos} seleccion={f.procesos} onSeleccionar={alternarProceso} />
      </div>

      {/* ── C6 Costo del tiempo — partido Padres+SV vs V ── */}
      <section className="mt-7">
        <SectionHeader title="Costo del tiempo" badge={`$${tarifa}/h`} />
        <CostoClonacion costoPorOrigen={costoPorOrigen} tarifa={tarifa} onTarifa={setTarifa} onSeleccionarMes={alternarMes} />
      </section>

      {/* ── C7 Detalle ── */}
      <section className="mt-7">
        <SectionHeader title="Detalle" badge={`${filtrados.length.toLocaleString("es-GT")} clonaciones`} />
        <TablaDetalleClonacion regs={filtrados} />
      </section>
    </div>
  );
}
