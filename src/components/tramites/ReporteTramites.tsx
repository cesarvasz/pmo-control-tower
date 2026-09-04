"use client";

// Reporte de tiempos de trámites (hoja ROI → files).
// Se monta como pestaña dentro de la página ROI; recibe las filas ya cargadas
// (la carga y el botón Actualizar viven en la página padre) y calcula todo con
// las funciones puras de lib/tramites.ts + lib/horario.ts.
//
// Los files se construyen UNA sola vez por carga; los filtros solo
// seleccionan subconjuntos, así que cambiar un filtro recalcula agregados sobre
// un arreglo ya normalizado.

import { useMemo, useState } from "react";
import { FilterReset, SectionHeader } from "@/components/ui";
import MultiSelect from "@/components/MultiSelect";
import BuscableSelect from "@/components/tramites/BuscableSelect";
import BarraCiclo from "@/components/tramites/BarraCiclo";
import TimelineMeses from "@/components/tramites/TimelineMeses";
import CostoUnitario from "@/components/tramites/CostoUnitario";
import CapacidadInstalada from "@/components/tramites/CapacidadInstalada";
import ReporteDucafast from "@/components/tramites/ReporteDucafast";
import { fmtHHMMSS, enDiasHabiles } from "@/lib/horario";
import {
  construirExpedientes, opcionesDeFiltro, filtrarExpedientes, hayFiltros,
  calcularIndicadores, composicionCiclo,
  costoTiempo, costoUnitario, costoPorPersona, ventanaDe,
  proyectarAnio, TARIFA_HORA_DEFECTO,
  exportarCSV,
  rangoEtapas, etiquetaAlcance, recorridoAlcance,
  METRICA_LABEL, FILTROS_VACIOS, ETAPAS, HITOS,
  type EtapaKey, type Filtros, type Metrica,
} from "@/lib/tramites";
import type { RoiRow } from "@/types";

type DimFiltro = "meses" | "usuarios" | "analistas" | "clientes" | "mesas" | "procesos" | "documentos" | "embarques";

function Bloque({ titulo, badge, children, nota }: {
  titulo: string; badge?: string; children: React.ReactNode; nota?: string;
}) {
  return (
    <section className="mt-7">
      <SectionHeader title={titulo} badge={badge} />
      {nota && <p className="mb-2.5 text-[0.72rem] text-[var(--text-muted)]">{nota}</p>}
      {children}
    </section>
  );
}

function IndicadorCard({ label, sub, valor, dias, variacion, cobertura, n }: {
  label: string; sub: string; valor: number | null; dias: number | null;
  variacion: number | null; cobertura: number; n: number;
}) {
  const cobColor = cobertura >= 0.9 ? "var(--ok)" : cobertura >= 0.7 ? "var(--warn)" : "var(--bad)";
  const varColor = variacion == null ? undefined : variacion > 0 ? "var(--bad)" : variacion < 0 ? "var(--ok)" : "var(--text-muted)";
  return (
    <div className="flex flex-col rounded-xl border p-[18px] text-center"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="text-[0.66rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 tabular-nums text-[1.4rem] font-extrabold leading-none text-[var(--card-value-total)]">
        {fmtHHMMSS(valor)}
      </div>
      <div className="mt-1 truncate text-[0.66rem] text-[var(--text-muted)]" title={sub}>{sub}</div>
      <div className="mt-0.5 text-[0.7rem] text-[var(--text-muted)]">
        {dias == null ? "—" : `${dias.toFixed(1)} días háb.`}
      </div>
      {variacion != null && (
        <div className="mt-1 text-[0.72rem] font-semibold" style={{ color: varColor }}>
          {variacion > 0 ? "▲" : variacion < 0 ? "▼" : "="} {Math.abs(Math.round(variacion * 100))}% vs. global
        </div>
      )}
      <div className="mt-auto pt-2 text-[0.68rem]" style={{ color: cobColor }}>
        cobertura {Math.round(cobertura * 100)}% · n={n.toLocaleString("es-GT")}
      </div>
    </div>
  );
}

export default function ReporteTramites({ rows }: { rows: RoiRow[] }) {
  const [f, setF] = useState<Filtros>(FILTROS_VACIOS);
  const [etapaActiva, setEtapaActiva] = useState<EtapaKey | null>(null);
  const [tarifa, setTarifa] = useState(TARIFA_HORA_DEFECTO);
  const [informe, setInforme] = useState(false);

  const todos = useMemo(() => construirExpedientes(rows), [rows]);
  const opciones = useMemo(() => opcionesDeFiltro(todos), [todos]);

  // Recorte filtrado — de aquí cuelgan TODAS las secciones, para que cuadren.
  const exps = useMemo(() => filtrarExpedientes(todos, f), [todos, f]);
  const conFiltros = hayFiltros(f);
  const porDia = f.meses.length === 1;

  // Filtro global de "Tiempo": tramo contiguo T_i→T_j que se quiere ver. Con
  // T1→T5 (por defecto) es "todas las etapas" y nada cambia. Reacciona en la
  // barra del ciclo, los indicadores, Capacidad instalada y Costo por
  // expediente — TODOS con el mismo `alcance`, para que cuadren entre sí (las
  // demás secciones que también lo usaban se quitaron temporalmente: Costo del
  // tiempo → Plantilla y carga, se recalculan con nuevas reglas).
  const alcance = useMemo(() => rangoEtapas(f.etapaDesde, f.etapaHasta), [f.etapaDesde, f.etapaHasta]);
  const tramoLabel = etiquetaAlcance(alcance); // "" si son todas

  const comp = useMemo(() => composicionCiclo(exps, f.metrica, alcance), [exps, f.metrica, alcance]);
  const indicadores = useMemo(() => calcularIndicadores(exps, f.metrica, alcance), [exps, f.metrica, alcance]);
  const globales = useMemo(() => calcularIndicadores(todos, f.metrica, alcance), [todos, f.metrica, alcance]);
  // Capacidad instalada: horas REALES por persona (unión de intervalos, sin
  // sumar traslapes — ver costoPorPersona en lib/tramites.ts) dentro del tramo
  // de "Tiempo" elegido, contra su disponibilidad de 44 h/semana escalada a la
  // ventana del recorte.
  const ventana = useMemo(() => ventanaDe(exps, alcance), [exps, alcance]);
  const personas = useMemo(() => costoPorPersona(exps, tarifa, ventana, alcance), [exps, tarifa, ventana, alcance]);
  // Costo por File: MISMO alcance que Capacidad instalada (antes estaba
  // fijo a Ducafast T1–T3; ahora sigue el filtro global de "Tiempo" completo),
  // para que "personas que hoy participan" cuadre exactamente con el tile
  // "Personas" de Capacidad instalada. Sigue siendo un segundo pase completo
  // sobre el mismo recorte, no un recorte del anterior: las horas reales salen
  // de unir intervalos, y unir un tramo no se deduce de otro.
  const costoUnit = useMemo(
    () => costoTiempo(exps, tarifa, porDia, false, alcance), [exps, tarifa, porDia, alcance]);
  const unitario = useMemo(() => costoUnitario(costoUnit), [costoUnit]);
  // La proyección arranca de la última actividad medida, no de la fecha del
  // navegador: si los datos van atrasados, proyectar desde "hoy" mentiría.
  const proyeccion = useMemo(
    () => (porDia || costoUnit.ventana.fin === 0
      ? []
      : proyectarAnio(costoUnit.serie, new Date(costoUnit.ventana.fin))),
    [costoUnit.serie, costoUnit.ventana.fin, porDia],
  );

  const set = (p: Partial<Filtros>) => setF((x) => ({ ...x, ...p }));
  const alternar = (k: DimFiltro, v: string) =>
    setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));

  const descargarCSV = () => {
    const url = URL.createObjectURL(new Blob(["﻿" + exportarCSV(exps)], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tramites-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const msSelect = (k: DimFiltro, label: string, opts: { value: string; label: string; count: number }[]) => (
    <MultiSelect
      label={label}
      options={opts}
      selected={f[k]}
      onToggle={(v, ch) => setF((x) => ({ ...x, [k]: ch ? [...x[k].filter((y) => y !== v), v] : x[k].filter((y) => y !== v) }))}
      onToggleAll={() => set({ [k]: [] } as Partial<Filtros>)}
    />
  );

  // El reporte sustituye al tablero en lugar de abrirse encima: se presenta a
  // dirección y va sobre TODOS los Files (Mesa 2), no sobre el recorte de filtros.
  if (informe) return <ReporteDucafast exps={todos} onCerrar={() => setInforme(false)} />;

  return (
    <div>
      <SectionHeader
        title="Tiempos de trámites"
        badge={`${exps.length.toLocaleString("es-GT")} de ${todos.length.toLocaleString("es-GT")} Files`}
      >
        <button onClick={() => setInforme(true)}
          className="ml-auto rounded-lg border px-3.5 py-1.5 text-[0.78rem] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
          style={{ borderColor: "var(--accent)", color: "var(--accent-light)" }}>
          📄 Reporte Ducafast
        </button>
      </SectionHeader>

      {/* ── Filtros ── */}
      <div className="mb-6">
        {/* Fila 1: Filtros principales */}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <BuscableSelect label="Cliente" options={opciones.clientes} selected={f.clientes}
            onChange={(v) => set({ clientes: v })} minWidth={200} />
          <BuscableSelect label="Usuario"
            options={opciones.usuarios.map((p) => ({ ...p, marca: p.automatizado ? "⚙" : undefined }))}
            selected={f.usuarios} onChange={(v) => set({ usuarios: v })} minWidth={190} />
          <BuscableSelect label="Analista"
            options={opciones.analistas.map((p) => ({ ...p, marca: p.automatizado ? "⚙" : undefined }))}
            selected={f.analistas} onChange={(v) => set({ analistas: v })} minWidth={190} />
          {msSelect("mesas", "Mesa", opciones.mesas)}
          {msSelect("procesos", "Proceso", opciones.procesos)}
        </div>

        {/* Fila 2: Filtros secundarios y configuración */}
        <div className="flex flex-wrap items-end gap-3">
          {msSelect("documentos", "Documento", opciones.documentos)}
          {msSelect("embarques", "Embarque", opciones.embarques)}

          <div className="flex flex-col gap-1.5">
            <label className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Ducafast</label>
            <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
              {([["todos", "Todos"], ["si", "Sí"], ["no", "No"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => set({ ducafast: v })}
                  className="px-3 py-2 text-[0.78rem] font-semibold transition-colors"
                  style={{
                    background: f.ducafast === v ? "var(--bg-accent-soft)" : "var(--bg-surface)",
                    color: f.ducafast === v ? "var(--accent-light)" : "var(--text-secondary)",
                  }}>{l}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Métrica</label>
            <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
              {(["mediana", "promedio", "p90"] as Metrica[]).map((m) => (
                <button key={m} onClick={() => set({ metrica: m })}
                  className="px-3 py-2 text-[0.78rem] font-semibold transition-colors"
                  style={{
                    background: f.metrica === m ? "var(--bg-accent-soft)" : "var(--bg-surface)",
                    color: f.metrica === m ? "var(--accent-light)" : "var(--text-secondary)",
                  }}>{METRICA_LABEL[m]}</button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Tarifa (USD/h)</span>
            <input
              type="number" min={0} step={0.5} value={tarifa}
              onChange={(e) => setTarifa(Math.max(0, Number(e.target.value) || 0))}
              className="w-24 rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <label className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]" title="Tramo de la cadena Creado→Firma que se quiere medir">
              Tiempo
            </label>
            <div className="flex items-center gap-1.5">
              <select value={f.etapaDesde} onChange={(e) => set({ etapaDesde: e.target.value as EtapaKey })}
                className="rounded-lg border px-2.5 py-2 text-[0.78rem] font-semibold outline-none"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                {ETAPAS.map((e) => <option key={e.key} value={e.key}>{e.corto}</option>)}
              </select>
              <span className="text-[0.72rem] text-[var(--text-muted)]">→</span>
              <select value={f.etapaHasta} onChange={(e) => set({ etapaHasta: e.target.value as EtapaKey })}
                className="rounded-lg border px-2.5 py-2 text-[0.78rem] font-semibold outline-none"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                {ETAPAS.map((e) => <option key={e.key} value={e.key}>{e.corto}</option>)}
              </select>
            </div>
          </div>

          {conFiltros && <FilterReset onClick={() => setF({ ...FILTROS_VACIOS, metrica: f.metrica })} />}
        </div>

        {tramoLabel && (
          <p className="mt-2 text-[0.68rem] text-[var(--text-muted)]">
            Tramo: {recorridoAlcance(alcance)}
          </p>
        )}
      </div>

      {/* Línea de tiempo (slicer de periodo).
          SIN envoltorio: `position: sticky` no puede salir de su contenedor
          padre, así que un div del alto del propio timeline lo despegaría de
          inmediato. Su padre tiene que ser el contenedor del reporte entero. */}
      <TimelineMeses meses={opciones.meses} seleccion={f.meses} onChange={(v) => set({ meses: v })} />

      {f.metrica === "promedio" && (
        <div className="mb-4 rounded-lg border px-4 py-2.5 text-[0.78rem]"
          style={{ background: "var(--pill-parahoy-bg)", borderColor: "var(--pill-parahoy-br)", color: "var(--pill-parahoy-fg)" }}>
          Las distribuciones están muy sesgadas: la mediana del ciclo ronda las 3 h y el promedio supera las 18 h.
          El promedio por sí solo no describe el comportamiento típico — contrástalo con la mediana y el P90.
        </div>
      )}

      {/* ── Barra del ciclo ── */}
      <BarraCiclo comp={comp} metricaLabel={METRICA_LABEL[f.metrica]} activa={etapaActiva} onActivar={setEtapaActiva} tramo={tramoLabel} />

      {/* ── Indicadores por etapa ── */}
      {/* Una tarjeta por etapa (solo las del tramo elegido) + el Total */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {indicadores.map((i) => {
          const g = globales.find((x) => x.key === i.key)?.valor ?? null;
          const variacion = conFiltros && g != null && g > 0 && i.valor != null ? (i.valor - g) / g : null;
          return (
            <IndicadorCard key={i.key} label={i.corto} sub={i.label} valor={i.valor}
              dias={enDiasHabiles(i.valor)} variacion={variacion} cobertura={i.cobertura} n={i.n} />
          );
        })}
      </div>
      <p className="mt-2 text-[0.72rem] text-[var(--text-muted)]">
        {METRICA_LABEL[f.metrica]} en horario hábil (L–J 08:00–13:00 y 14:00–18:00 · V hasta 17:00; almuerzo y
        fin de semana no cuentan). Cadena{tramoLabel ? ` (tramo ${tramoLabel})` : ""}: {ETAPAS.filter((e) => alcance.includes(e.key)).map((e) => `${e.corto} ${e.label}`).join(" · ")}. El Total se
        calcula por File y solo incluye los que recorrieron las {alcance.length} etapas — por eso su cobertura es menor.
      </p>

      {/* ── Costo por File (acordeón) ── */}
      <div className="mt-5">
        <CostoUnitario
          costo={costoUnit} unitario={unitario} proyeccion={proyeccion}
          onSeleccionarPeriodo={(clave) => { if (!porDia) alternar("meses", clave); }}
        />
      </div>

      {/* ── Capacidad instalada ── */}
      <Bloque titulo="Capacidad instalada" badge={tramoLabel ? `$${tarifa}/h · ${tramoLabel}` : `$${tarifa}/h`}>
        <CapacidadInstalada
          personas={personas}
          ventana={ventana}
          tarifa={tarifa}
          tramo={tramoLabel}
          onFiltrarPersona={(clave, rol) => {
            if (rol === "usuario") set({ usuarios: [clave] });
            else set({ analistas: [clave] });
          }}
        />
      </Bloque>

      {/* ── Detalle y exportación ── */}
      <Bloque titulo="Detalle" badge={`${exps.length.toLocaleString("es-GT")} Files`}>
        <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
          <button onClick={descargarCSV}
            className="rounded-lg border px-3.5 py-2 text-[0.78rem] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
            style={{ borderColor: "var(--accent)", color: "var(--accent-light)" }}>
            ↓ Exportar CSV
          </button>
          <span className="text-[0.72rem] text-[var(--text-muted)]">
            Exporta el recorte filtrado completo, con los tiempos en hh:mm:ss y también en segundos.
          </span>
        </div>
        <div className="table-wrap">
          <table className="pmo">
            <thead>
              <tr>
                <th>File</th>
                <th>Creado</th>
                <th>Cliente</th>
                <th>Analista</th>
                <th>Mesa</th>
                {ETAPAS.map((e) => <th key={e.key} style={{ textAlign: "center" }}>{e.corto}</th>)}
                <th style={{ textAlign: "center" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {exps.slice(0, 200).map((e) => (
                <tr key={e.file}>
                  <td className="ini-id">{e.file}</td>
                  <td className="text-[var(--text-secondary)]">
                    {e.creado ? e.creado.toLocaleString("es-GT", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </td>
                  <td className="max-w-[220px] truncate text-[var(--text-secondary)]" title={e.clientes.join(" · ")}>
                    {e.clientes.join(" · ")}
                  </td>
                  <td className="max-w-[180px] truncate text-[var(--text-secondary)]" title={e.analistas.join(" · ")}>
                    {e.analistas.join(" · ")}
                  </td>
                  <td className="text-[var(--text-secondary)]">{e.mesas.join(" · ")}</td>
                  {ETAPAS.map((et) => (
                    <td key={et.key} className="tabular-nums text-center"
                      style={{ color: e.etapas[et.key] == null ? "var(--text-disabled)" : "var(--text-secondary)" }}>
                      {e.etapas[et.key] == null ? "—" : fmtHHMMSS(e.etapas[et.key])}
                    </td>
                  ))}
                  <td className="tabular-nums text-center font-semibold"
                    style={{ color: e.total == null ? "var(--text-disabled)" : undefined }}>
                    {e.total == null ? "—" : fmtHHMMSS(e.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {exps.length > 200 && (
          <p className="mt-2 text-[0.72rem] text-[var(--text-muted)]">
            Se muestran los primeros 200 de {exps.length.toLocaleString("es-GT")} Files. La exportación incluye todos.
          </p>
        )}
        <p className="mt-1 text-[0.7rem] text-[var(--text-muted)]">
          Hitos disponibles en el origen: {HITOS.map((h) => h.label).join(" · ")}.
        </p>
      </Bloque>
    </div>
  );
}
