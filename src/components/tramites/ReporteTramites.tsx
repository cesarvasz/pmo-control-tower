"use client";

// Reporte de tiempos de trámites (hoja ROI → expedientes).
// Se monta como pestaña dentro de la página ROI; recibe las filas ya cargadas
// (la carga y el botón Actualizar viven en la página padre) y calcula todo con
// las funciones puras de lib/tramites.ts + lib/horario.ts.
//
// Los expedientes se construyen UNA sola vez por carga; los filtros solo
// seleccionan subconjuntos, así que cambiar un filtro recalcula agregados sobre
// un arreglo ya normalizado.

import { useMemo, useState } from "react";
import { FilterReset, SectionHeader } from "@/components/ui";
import MultiSelect from "@/components/MultiSelect";
import BuscableSelect from "@/components/tramites/BuscableSelect";
import BarraCiclo from "@/components/tramites/BarraCiclo";
import TimelineMeses from "@/components/tramites/TimelineMeses";
import TramitesSeries from "@/components/tramites/TramitesSeries";
import TramitesCarga from "@/components/tramites/TramitesCarga";
import { TablaDimension, TablaHitos } from "@/components/tramites/TramitesTablas";
import CostoTiempo from "@/components/tramites/CostoTiempo";
import CostoUnitario from "@/components/tramites/CostoUnitario";
import Informe from "@/components/tramites/Informe";
import { fmtHHMMSS, enDiasHabiles } from "@/lib/horario";
import {
  construirExpedientes, opcionesDeFiltro, filtrarExpedientes, hayFiltros,
  calcularIndicadores, composicionCiclo, serieTemporal, agruparPor, agruparPorPersona, coberturaHitos,
  costoTiempo, costoUnitario, proyectarAnio, TARIFA_HORA_DEFECTO, ALCANCE_UNITARIO,
  cargaYCapacidad, contarPersonas, exportarCSV,
  rangoEtapas, interseccionAlcance, etiquetaAlcance, recorridoAlcance,
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
  const [simultaneos, setSimultaneos] = useState(1);
  const [tarifa, setTarifa] = useState(TARIFA_HORA_DEFECTO);
  const [informe, setInforme] = useState(false);

  const todos = useMemo(() => construirExpedientes(rows), [rows]);
  const opciones = useMemo(() => opcionesDeFiltro(todos), [todos]);

  // Recorte filtrado — de aquí cuelgan TODAS las secciones, para que cuadren.
  const exps = useMemo(() => filtrarExpedientes(todos, f), [todos, f]);
  const conFiltros = hayFiltros(f);
  const porDia = f.meses.length === 1;

  // Filtro global de "Tiempo": tramo contiguo T_i→T_j que se quiere ver. Con
  // T1→T5 (por defecto) es "todas las etapas" y nada cambia. Reacciona en TODAS
  // las secciones de abajo — cada una recibe `alcance` y recorta a ese tramo.
  const alcance = useMemo(() => rangoEtapas(f.etapaDesde, f.etapaHasta), [f.etapaDesde, f.etapaHasta]);
  const tramoLabel = etiquetaAlcance(alcance); // "" si son todas

  const comp = useMemo(() => composicionCiclo(exps, f.metrica, alcance), [exps, f.metrica, alcance]);
  const indicadores = useMemo(() => calcularIndicadores(exps, f.metrica, alcance), [exps, f.metrica, alcance]);
  const globales = useMemo(() => calcularIndicadores(todos, f.metrica, alcance), [todos, f.metrica, alcance]);
  const serie = useMemo(() => serieTemporal(exps, f.metrica, porDia, alcance), [exps, f.metrica, porDia, alcance]);
  const hitos = useMemo(() => coberturaHitos(exps, alcance), [exps, alcance]);
  const porMesa = useMemo(() => agruparPor(exps, (e) => e.mesas, f.metrica, alcance), [exps, f.metrica, alcance]);
  const porCliente = useMemo(() => agruparPor(exps, (e) => e.clientes, f.metrica, alcance), [exps, f.metrica, alcance]);
  // Personas: el tiempo se atribuye por rol (Usuario T1–T4, Analista T5, ciclo
  // completo si son la misma persona). Ver agruparPorPersona en lib/tramites.ts.
  const porUsuario = useMemo(() => agruparPorPersona(exps, "usuario", f.metrica, alcance), [exps, f.metrica, alcance]);
  const porAnalista = useMemo(() => agruparPorPersona(exps, "analista", f.metrica, alcance), [exps, f.metrica, alcance]);
  const carga = useMemo(() => cargaYCapacidad(exps, simultaneos, porDia), [exps, simultaneos, porDia]);
  // Costo: cuelga del mismo recorte, así que la línea de tiempo responde a los filtros.
  const costo = useMemo(() => costoTiempo(exps, tarifa, porDia, false, alcance), [exps, tarifa, porDia, alcance]);
  // El costo por expediente se mide SOLO sobre Ducafast (T1–T3), intersecado con
  // el filtro global de "Tiempo": si éste se acota a T1–T2, aquí se mide T1–T2
  // (la parte de Ducafast que cae dentro del tramo elegido). Es un segundo pase
  // completo sobre el mismo recorte, no un recorte del anterior: las horas
  // reales salen de unir intervalos, y unir un tramo no se deduce de otro.
  const alcanceUnitario = useMemo(() => interseccionAlcance(alcance, ALCANCE_UNITARIO), [alcance]);
  const costoUnit = useMemo(
    () => costoTiempo(exps, tarifa, porDia, false, alcanceUnitario), [exps, tarifa, porDia, alcanceUnitario]);
  const unitario = useMemo(() => costoUnitario(costoUnit), [costoUnit]);
  // La proyección arranca de la última actividad medida, no de la fecha del
  // navegador: si los datos van atrasados, proyectar desde "hoy" mentiría.
  const proyeccion = useMemo(
    () => (porDia || costoUnit.ventana.fin === 0
      ? []
      : proyectarAnio(costoUnit.serie, new Date(costoUnit.ventana.fin))),
    [costoUnit.serie, costoUnit.ventana.fin, porDia],
  );
  // Plantilla del recorte: Usuario o Analista, sin duplicar a quien hace ambos.
  const personasFiltro = useMemo(
    () => contarPersonas(exps, (e) => [...e.usuarios, ...e.analistas]), [exps]);

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

  // El informe sustituye al tablero en lugar de abrirse encima: se presenta a
  // dirección y va sobre TODOS los expedientes del año, no sobre el recorte.
  if (informe) return <Informe exps={todos} onCerrar={() => setInforme(false)} />;

  return (
    <div>
      <SectionHeader
        title="Tiempos de trámites"
        badge={`${exps.length.toLocaleString("es-GT")} de ${todos.length.toLocaleString("es-GT")} expedientes`}
      >
        <button onClick={() => setInforme(true)}
          className="ml-auto rounded-lg border px-3.5 py-1.5 text-[0.78rem] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
          style={{ borderColor: "var(--accent)", color: "var(--accent-light)" }}>
          📄 Informe
        </button>
      </SectionHeader>

      {/* ── Filtros ── */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
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
        {msSelect("documentos", "Documento", opciones.documentos)}
        {msSelect("embarques", "Embarque", opciones.embarques)}

        <div className="flex flex-col gap-1.5">
          <label className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Ducafast</label>
          <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
            {([["todos", "Todos"], ["si", "Ducafast"], ["no", "No"]] as const).map(([v, l]) => (
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

        {/* Filtro global de "Tiempo": qué tramo de la cadena T1–T5 se quiere ver.
            Reacciona en TODO el reporte (barra del ciclo, indicadores, series,
            tablas por dimensión/persona, costo del tiempo y costo por expediente). */}
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
            <span className="text-[0.72rem] text-[var(--text-muted)]">a</span>
            <select value={f.etapaHasta} onChange={(e) => set({ etapaHasta: e.target.value as EtapaKey })}
              className="rounded-lg border px-2.5 py-2 text-[0.78rem] font-semibold outline-none"
              style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              {ETAPAS.map((e) => <option key={e.key} value={e.key}>{e.corto}</option>)}
            </select>
          </div>
          {tramoLabel && (
            <span className="text-[0.64rem] text-[var(--text-muted)]">{recorridoAlcance(alcance)}</span>
          )}
        </div>

        {conFiltros && <FilterReset onClick={() => setF({ ...FILTROS_VACIOS, metrica: f.metrica })} />}
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
        calcula por expediente y solo incluye los que recorrieron las {alcance.length} etapas — por eso su cobertura es menor.
      </p>

      {/* ── Costo por expediente (acordeón) ── */}
      <div className="mt-5">
        <CostoUnitario
          costo={costoUnit} unitario={unitario} proyeccion={proyeccion}
          onSeleccionarPeriodo={(clave) => { if (!porDia) alternar("meses", clave); }}
        />
      </div>

      {/* ── Costo del tiempo ── */}
      <Bloque titulo="Costo del tiempo" badge={tramoLabel ? `$${tarifa}/h · ${tramoLabel}` : `$${tarifa}/h`}>
        <CostoTiempo
          costo={costo} tarifa={tarifa} onTarifa={setTarifa}
          porDia={porDia}
          onSeleccionarPeriodo={(clave) => { if (!porDia) alternar("meses", clave); }}
        />
      </Bloque>

      {/* ── Series ── */}
      <Bloque titulo="Series de tiempo" badge={porDia ? "detalle diario" : "por mes"}>
        <TramitesSeries serie={serie} porDia={porDia} alcance={alcance}
          onSeleccionarPeriodo={(clave) => { if (!porDia) alternar("meses", clave); }} />
      </Bloque>

      {/* ── Cobertura de hitos ── */}
      <Bloque titulo="Cobertura de hitos"
        nota="Cuántos expedientes del recorte alcanzaron cada hito. Un tiempo bajo en una etapa puede ser un hito faltante, no rapidez.">
        <TablaHitos filas={hitos} />
      </Bloque>

      {/* ── Por mesa ── */}
      <Bloque titulo="Por mesa" badge={`${porMesa.length} mesas`}
        nota="Un expediente cuya Mesa difiere entre filas cuenta en cada mesa en la que aparece.">
        <TablaDimension filas={porMesa} etiqueta="Mesa" onFiltrar={(v) => alternar("mesas", v)} seleccion={f.mesas} alcance={alcance} />
      </Bloque>

      {/* ── Por cliente ── */}
      <Bloque titulo="Por cliente" badge={`${porCliente.length} clientes`}>
        <TablaDimension filas={porCliente} etiqueta="Cliente" onFiltrar={(v) => alternar("clientes", v)}
          seleccion={f.clientes} buscable alcance={alcance} />
      </Bloque>

      {/* ── Por analista / usuario ── */}
      <Bloque titulo="Por analista" badge={`${porAnalista.length}`}
        nota="Al Analista se le atribuye solo T5 (Revisión → Solicitar firma), que es el tramo del que responde. Cuando además es el Usuario del expediente, hizo el trámite de punta a punta y carga el ciclo completo — esos son los de la columna «Punta a punta». Las etapas que no le tocan van en «—».">
        <TablaDimension filas={porAnalista} etiqueta="Analista" onFiltrar={(v) => alternar("analistas", v)}
          seleccion={f.analistas} buscable marcarBots columnaCiclo alcance={alcance} />
      </Bloque>

      <Bloque titulo="Por usuario" badge={`${porUsuario.length}`}
        nota="Al Usuario se le atribuyen T1 a T4, hasta la Revisión del analista. Si él mismo fue el Analista, carga también T5 y con eso el ciclo completo.">
        <TablaDimension filas={porUsuario} etiqueta="Usuario" onFiltrar={(v) => alternar("usuarios", v)}
          seleccion={f.usuarios} buscable marcarBots columnaCiclo alcance={alcance} />
      </Bloque>

      {/* ── Plantilla y carga ── */}
      <Bloque titulo="Plantilla y carga" badge={`${personasFiltro} personas`}
        nota="La plantilla se cuenta, no se estima: personas distintas que aparecen como Usuario o Analista en cada periodo, sin duplicar a quien hace ambos papeles.">
        <TramitesCarga filas={carga} simultaneos={simultaneos} onSimultaneos={setSimultaneos} />
      </Bloque>

      {/* ── Detalle y exportación ── */}
      <Bloque titulo="Detalle" badge={`${exps.length.toLocaleString("es-GT")} expedientes`}>
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
                <th>Expediente</th>
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
            Se muestran los primeros 200 de {exps.length.toLocaleString("es-GT")}. La exportación incluye todos.
          </p>
        )}
        <p className="mt-1 text-[0.7rem] text-[var(--text-muted)]">
          Hitos disponibles en el origen: {HITOS.map((h) => h.label).join(" · ")}.
        </p>
      </Bloque>
    </div>
  );
}
