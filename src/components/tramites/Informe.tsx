"use client";

// Informe de beneficio DUCAFAST — fase Operación de la metodología VALOR.
//
// Reproduce, sobre los datos vivos, el informe que se presenta a dirección:
// tiempo, costo, capacidad y scorecard de ROI, mes a mes del año elegido.
//
// A diferencia del resto del tablero NO responde a los filtros: un informe
// anual con un filtro de mes puesto sería una contradicción, y el número que
// se presenta tiene que ser reproducible sin saber cómo quedó el tablero.
// La única palanca es el año, más los tres parámetros económicos.

import { useMemo, useState } from "react";
import {
  construirInforme, PRECIO_LICENCIA_BASE, META_LICENCIAS_ANUAL, TARIFA_INFORME,
  type MesInforme,
} from "@/lib/informe";
import type { Expediente } from "@/lib/tramites";
import { construirHtmlInforme } from "@/lib/informe-html";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Sin abreviar a «K»: el titular es la cifra que la gente cita, y «$63 K»
// junto a un detalle de $62,571.42 se lee como un descuadre.
const usdCorto = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)} M`
    : `$${Math.round(n).toLocaleString("en-US")}`;
const num = (n: number) => Math.round(n).toLocaleString("es-GT");
const pct = (n: number | null, d = 0) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);
const dur = (seg: number | null) => {
  if (seg == null) return "—";
  const h = seg / 3600;
  return h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`;
};

function Kpi({ valor, label, nota, fuerte }: { valor: string; label: string; nota?: string; fuerte?: boolean }) {
  return (
    <div className="rounded-xl px-4 py-3.5"
      style={{ background: fuerte ? "var(--bg-accent-soft)" : "var(--bg-hover)" }}>
      <div className="tabular-nums text-[1.75rem] font-extrabold leading-none"
        style={{ color: fuerte ? "var(--accent-light)" : "var(--text-primary)" }}>{valor}</div>
      <div className="mt-1.5 text-[0.74rem] leading-snug text-[var(--text-secondary)]">{label}</div>
      {nota && <div className="mt-0.5 text-[0.66rem] text-[var(--text-muted)]">{nota}</div>}
    </div>
  );
}

function Seccion({ n, titulo, sub, children }: {
  n: string; titulo: string; sub: string; children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-xl border p-4"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-3.5 flex items-baseline gap-2.5">
        <span className="rounded-md px-2 py-0.5 text-[0.64rem] font-bold uppercase tracking-wider"
          style={{ background: "var(--bg-accent-soft)", color: "var(--accent-light)" }}>{n}</span>
        <h3 className="text-[1.02rem] font-bold text-[var(--text-primary)]">{titulo}</h3>
      </div>
      <p className="-mt-2.5 mb-3.5 text-[0.74rem] text-[var(--text-muted)]">{sub}</p>
      {children}
    </section>
  );
}

/** Par de barras por mes (con / sin DUCAFAST) sobre una escala común. */
function BarrasPareadas({ meses, valor, formato, nota }: {
  meses: MesInforme[];
  valor: (g: MesInforme["con"]) => number;
  formato: (n: number) => string;
  /** Aclaración de lectura, p. ej. «menos es mejor». */
  nota?: string;
}) {
  const max = Math.max(1, ...meses.flatMap((m) => [valor(m.con), valor(m.sin)]));
  return (
    <div className="table-wrap pb-1">
      <div className="flex min-w-max items-end gap-3" style={{ height: 190 }}>
        {meses.map((m) => (
          <div key={m.clave} className="flex flex-col items-center" style={{ width: 78 }}>
            <div className="flex h-[150px] w-full items-end justify-center gap-1">
              {([["sin", m.sin, "var(--text-muted)"], ["con", m.con, "var(--accent)"]] as const)
                .map(([k, g, color]) => {
                  const v = valor(g);
                  return (
                    <div key={k} className="flex flex-1 flex-col items-center justify-end">
                      <span className="mb-0.5 whitespace-nowrap tabular-nums text-[0.58rem] font-bold"
                        style={{ color: k === "con" ? "var(--accent-light)" : "var(--text-muted)" }}>
                        {formato(v)}
                      </span>
                      <div className="w-full rounded-t-sm"
                        style={{
                          height: Math.max(2, (v / max) * 118),
                          background: color,
                          opacity: k === "con" ? 0.9 : 0.45,
                        }} />
                    </div>
                  );
                })}
            </div>
            <span className="mt-1 whitespace-nowrap text-[0.62rem] text-[var(--text-muted)]">
              {m.label}{m.parcial ? "*" : ""}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-center gap-4 text-[0.68rem] text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--text-muted)", opacity: 0.45 }} />
          Sin DUCAFAST
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--accent)", opacity: 0.9 }} />
          Con DUCAFAST
        </span>
        {nota && <span>· {nota}</span>}
      </div>
    </div>
  );
}

export default function Informe({ exps, onCerrar }: { exps: Expediente[]; onCerrar: () => void }) {
  const anios = useMemo(() => {
    const s = new Set<number>();
    for (const e of exps) if (e.mes) s.add(Number(e.mes.slice(0, 4)));
    return [...s].sort((a, b) => b - a);
  }, [exps]);

  const [anio, setAnio] = useState(() => anios[0] ?? new Date().getFullYear());
  const [tarifa, setTarifa] = useState(TARIFA_INFORME);
  const [precioLicencia, setPrecioLicencia] = useState(PRECIO_LICENCIA_BASE);
  const [meta, setMeta] = useState(META_LICENCIAS_ANUAL);

  const inf = useMemo(
    () => construirInforme(exps, { anio, tarifa, precioLicencia, metaLicenciasAnual: meta }),
    [exps, anio, tarifa, precioLicencia, meta],
  );

  const { scorecard: sc, escala } = inf;
  const hayParcial = inf.meses.some((m) => m.parcial);
  const rango = inf.meses.length > 0
    ? `${inf.meses[0].label} – ${inf.meses[inf.meses.length - 1].label}`
    : "sin datos";
  // Mes de referencia de los acumulados. Lo resuelve la librería —incluida la
  // salvaguarda de cuando el año entero va a medias— y aquí solo se busca.
  const ultimo = inf.meses.find((m) => m.clave === inf.ultimoCompleto) ?? null;

  // PDF por la vía del navegador: ventana aparte con un HTML autocontenido y
  // diálogo de impresión. Da texto seleccionable en vez de una captura, y no
  // arrastra ninguna dependencia. Mismo camino que el reporte NPS.
  const [bloqueado, setBloqueado] = useState(false);
  const descargarPdf = () => {
    const w = window.open("", "_blank", "width=980,height=760");
    if (!w) { setBloqueado(true); return; }
    setBloqueado(false);
    w.document.write(construirHtmlInforme(inf));
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* el usuario cerró la ventana */ } }, 300);
  };

  const campo = (label: string, valor: number, set: (n: number) => void, step: number, ancho = "w-24") => (
    <label className="block">
      <span className="mb-1 block text-[0.64rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      <input type="number" min={0} step={step} value={valor}
        onChange={(e) => set(Math.max(0, Number(e.target.value) || 0))}
        className={`${ancho} rounded-lg border px-2.5 py-1.5 text-sm tabular-nums outline-none`}
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
    </label>
  );

  return (
    <div>
      {/* ── Portada ── */}
      <div className="rounded-xl p-5" style={{ background: "var(--bg-sidebar)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[0.66rem] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--accent-light)" }}>
              Seguimiento · Fase Operación
            </div>
            <h2 className="mt-1 text-[1.5rem] font-extrabold leading-tight text-[var(--text-primary)]">
              DUCAFAST GT — resultados {inf.anio}
            </h2>
            <p className="mt-1 text-[0.8rem] text-[var(--text-secondary)]">
              Autoautomatización de generación de DUCAs · medición continua de beneficio, {rango}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {inf.meses.length > 0 && (
              <button onClick={descargarPdf}
                title="Abre el diálogo de impresión — elige «Guardar como PDF»"
                className="rounded-lg border px-3.5 py-2 text-[0.78rem] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
                style={{ borderColor: "var(--accent)", color: "var(--accent-light)" }}>
                ⬇ Descargar PDF
              </button>
            )}
            <button onClick={onCerrar}
              className="rounded-lg border px-3.5 py-2 text-[0.78rem] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              ← Volver al tablero
            </button>
          </div>
        </div>

        {/* Parámetros del informe */}
        <div className="mt-4 flex flex-wrap items-end gap-4 border-t pt-3.5" style={{ borderColor: "var(--border)" }}>
          <label className="block">
            <span className="mb-1 block text-[0.64rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">Año</span>
            <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
              {anios.map((a) => (
                <button key={a} onClick={() => setAnio(a)}
                  className="px-3 py-1.5 text-[0.78rem] font-semibold transition-colors"
                  style={{
                    background: a === anio ? "var(--bg-accent-soft)" : "var(--bg-surface)",
                    color: a === anio ? "var(--accent-light)" : "var(--text-secondary)",
                  }}>{a}</button>
              ))}
            </div>
          </label>
          {campo("Tarifa $/h", tarifa, setTarifa, 0.5)}
          {campo("$ / licencia", precioLicencia, setPrecioLicencia, 0.05)}
          {campo("Meta licencias/año", meta, setMeta, 1000, "w-32")}
          <p className="max-w-md text-[0.68rem] leading-relaxed text-[var(--text-muted)]">
            Valores del Business Case. El tablero calcula a su propia tarifa; este informe usa la
            suya para que las cifras sean comparables con lo ya presentado.
          </p>
        </div>

        {bloqueado && (
          <p className="mt-3 rounded-lg px-3 py-2 text-[0.74rem] leading-relaxed"
            style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>
            El navegador bloqueó la ventana emergente. Permítela para este sitio y vuelve a pulsar
            «Descargar PDF».
          </p>
        )}
      </div>

      {inf.meses.length === 0 ? (
        <p className="mt-6 text-[0.85rem] text-[var(--text-muted)]">No hay Files en {inf.anio}.</p>
      ) : (
        <>
          {/* ── Resumen ── */}
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi fuerte valor={usdCorto(inf.ahorro)} label="Ahorro acumulado en costo operativo"
              nota={`${num(inf.filesCon)} files procesados con DUCAFAST`} />
            <Kpi valor={pct(inf.reduccionPromedio)} label="Reducción promedio del tiempo de ciclo"
              nota="Creación → Pre-DUCA (T1+T2+T3)" />
            <Kpi valor={pct(sc.roi)} label="ROI real sobre la inversión en licencias"
              nota={`ejecutada a la fecha (${sc.multiplo.toFixed(1)}x)`} />
            <Kpi valor={pct(ultimo?.reduccionPersonal ?? null, 1)}
              label="Menos personal necesario por file"
              nota={ultimo ? `en ${ultimo.label}, sobre T1–T3` : undefined} />
          </div>

          {hayParcial && (
            <p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--text-muted)]">
              * El último mes va a medias y se marca con asterisco. Los acumulados y el ROI llegan
              hasta {ultimo?.label ?? "—"}: sumar un
              mes incompleto al beneficio mientras la meta de licencias lo cuenta entero hundiría el
              ROI por un artefacto del calendario.
            </p>
          )}

          {/* ── 1 · Tiempo ── */}
          <Seccion n="Indicador 1" titulo="Reducción del tiempo de ciclo"
            sub="Tiempo promedio por file de T1+T2+T3 (Creación → Pre-DUCA): proceso manual contra DUCAFAST. Es el tramo que la automatización toca.">
            <BarrasPareadas meses={inf.meses} valor={(g) => (g.segTramo ?? 0) / 3600} formato={(h) => dur(h * 3600)} />
            <div className="table-wrap mt-3">
              <table className="pmo">
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th style={{ textAlign: "center" }}>Con DUCAFAST</th>
                    <th style={{ textAlign: "center" }}>Sin DUCAFAST</th>
                    <th style={{ textAlign: "center" }}>Reducción</th>
                    <th style={{ textAlign: "center" }}>Mediana con / sin</th>
                    <th style={{ textAlign: "center" }}>Files comparados</th>
                  </tr>
                </thead>
                <tbody>
                  {inf.meses.map((m) => (
                    <tr key={m.clave}>
                      <td>{m.label}{m.parcial && <span className="text-[var(--text-muted)]"> *</span>}</td>
                      <td className="tabular-nums text-center font-bold" style={{ color: "var(--accent-light)" }}>{dur(m.con.segTramo)}</td>
                      <td className="tabular-nums text-center">{dur(m.sin.segTramo)}</td>
                      <td className="tabular-nums text-center font-bold" style={{ color: "var(--ok)" }}>{pct(m.reduccionTiempo)}</td>
                      <td className="tabular-nums text-center text-[var(--text-muted)]">
                        {dur(m.con.segTramoMediana)} / {dur(m.sin.segTramoMediana)}
                      </td>
                      <td className="tabular-nums text-center text-[var(--text-muted)]">
                        {num(m.con.filesTramo)} / {num(m.sin.filesTramo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--text-muted)]">
              Solo entran los files con los tres tiempos presentes: a uno al que le falta un hito no
              se le puede decir que «tardó menos». La mediana va aparte a propósito — el promedio
              carga una cola larga y queda muy por encima del file típico.
            </p>

            {/* El contrapeso. Va aquí y no en una nota al pie porque es lo
                primero que preguntará quien revise el informe. */}
            {ultimo?.con.segCola != null && ultimo.sin.segCola != null && (
              <div className="mt-3 rounded-lg border-l-[3px] px-3.5 py-2.5 text-[0.74rem] leading-relaxed"
                style={{
                  borderColor: "var(--pill-parahoy-br)",
                  background: "var(--pill-parahoy-bg)",
                  color: "var(--pill-parahoy-fg)",
                }}>
                <strong>Parte del tiempo ganado se devuelve después.</strong>{" "}
                El informe mide T1–T3, pero el tramo siguiente no es gratis: en {ultimo.label} los
                files de DUCAFAST pasaron <strong>{dur(ultimo.con.segCola)}</strong> en revisión y
                firma contra <strong>{dur(ultimo.sin.segCola)}</strong> de los manuales
                {ultimo.con.segCola > ultimo.sin.segCola && (
                  <> — {(ultimo.con.segCola / ultimo.sin.segCola).toFixed(1)}× más</>
                )}. Medido de punta a punta el ahorro del año sería{" "}
                <strong>{usdCorto(inf.ahorroCiclo)}</strong> en vez de {usdCorto(inf.ahorro)}:{" "}
                {usdCorto(inf.ahorro - inf.ahorroCiclo)} se devuelven en la revisión. No se
                descuenta aquí a propósito — este informe mide el tramo automatizado.
              </div>
            )}
          </Seccion>

          {/* ── 2 · Costo ── */}
          <Seccion n="Indicador 2" titulo="Costo operativo por file"
            sub={`Tiempo humano de T1–T3 a ${usd(inf.tarifa)}/hora, más las licencias de digitalización a ${usd(inf.precioLicencia)} cada una. El robot no cobra por hora: su costo entra como licencia.`}>
            <BarrasPareadas meses={inf.meses} valor={(g) => g.costoFile} formato={(v) => usd(v)}
              nota="menos es mejor" />
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
              <div className="table-wrap">
                <table className="pmo">
                  <thead>
                    <tr>
                      <th>Mes</th>
                      <th style={{ textAlign: "center" }}>Con DUCAFAST</th>
                      <th style={{ textAlign: "center" }}>· operativo</th>
                      <th style={{ textAlign: "center" }}>· licencias</th>
                      <th style={{ textAlign: "center" }}>Sin DUCAFAST</th>
                      <th style={{ textAlign: "center" }}>Files con</th>
                      <th style={{ textAlign: "center" }}>Ahorro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inf.meses.map((m) => (
                      <tr key={m.clave}>
                        <td>{m.label}{m.parcial && <span className="text-[var(--text-muted)]"> *</span>}</td>
                        <td className="tabular-nums text-center font-bold" style={{ color: "var(--accent-light)" }}>{usd(m.con.costoFile)}</td>
                        <td className="tabular-nums text-center text-[var(--text-muted)]">{usd(m.con.costoOperativoFile)}</td>
                        <td className="tabular-nums text-center text-[var(--text-muted)]">{usd(m.con.costoLicenciasFile)}</td>
                        <td className="tabular-nums text-center">{usd(m.sin.costoFile)}</td>
                        <td className="tabular-nums text-center text-[var(--text-muted)]">{num(m.con.files)}</td>
                        <td className="tabular-nums text-center font-bold" style={{ color: m.parcial ? "var(--text-muted)" : "var(--ok)" }}>
                          {usd(m.ahorro)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-xl p-4" style={{ background: "var(--bg-accent-soft)" }}>
                <div className="text-[0.64rem] font-bold uppercase tracking-wider" style={{ color: "var(--accent-light)" }}>
                  Ahorro acumulado {inf.anio}
                </div>
                <div className="mt-1.5 tabular-nums text-[1.85rem] font-extrabold leading-none"
                  style={{ color: "var(--accent-light)" }}>{usd(inf.ahorro)}</div>
                <p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--text-secondary)]">
                  Contra el costo del proceso manual sobre el mismo volumen de files: la diferencia
                  de costo unitario multiplicada por los {num(inf.filesCon)} files que sí pasaron por
                  DUCAFAST.
                </p>
              </div>
            </div>
          </Seccion>

          {/* ── 3 · Capacidad ── */}
          <Seccion n="Indicador 3" titulo="Productividad y capacidad instalada"
            sub="Personas a tiempo completo que consume cada 1,000 files en T1–T3, al 95% de ocupación. Menos es mejor: es cuánta gente hay que poner para sacar el mismo volumen.">
            <BarrasPareadas meses={inf.meses} valor={(g) => g.personasPorMil} formato={(v) => v.toFixed(2)}
              nota="menos es mejor" />
            <div className="table-wrap mt-3">
              <table className="pmo">
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th style={{ textAlign: "center" }}>Personas/1,000 files con</th>
                    <th style={{ textAlign: "center" }}>… sin</th>
                    <th style={{ textAlign: "center" }}>Reducción</th>
                    <th style={{ textAlign: "center" }}>Personas DUCAFAST</th>
                    <th style={{ textAlign: "center" }}>Personas manual</th>
                  </tr>
                </thead>
                <tbody>
                  {inf.meses.map((m) => (
                    <tr key={m.clave}>
                      <td>{m.label}{m.parcial && <span className="text-[var(--text-muted)]"> *</span>}</td>
                      <td className="tabular-nums text-center font-bold" style={{ color: "var(--accent-light)" }}>{m.con.personasPorMil.toFixed(2)}</td>
                      <td className="tabular-nums text-center">{m.sin.personasPorMil.toFixed(2)}</td>
                      <td className="tabular-nums text-center font-bold" style={{ color: "var(--ok)" }}>
                        {pct(m.reduccionPersonal, 1)}
                      </td>
                      <td className="tabular-nums text-center text-[var(--text-muted)]">
                        {m.con.personasNecesarias.toFixed(1)} de {m.con.personasPresentes}
                      </td>
                      <td className="tabular-nums text-center text-[var(--text-muted)]">
                        {m.sin.personasNecesarias.toFixed(1)} de {m.sin.personasPresentes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--text-muted)]">
              La tasa va por cada 1,000 files y no como «files por persona» porque en T1–T3 el
              tiempo humano de DUCAFAST tiende a cero: dividir entre eso daba múltiplos que
              saltaban entre 16x y 2,600x de un mes a otro sin que la operación cambiara. Esta forma
              está acotada y dice lo mismo. «Personas» son equivalentes a tiempo completo, sin
              redondear; la última columna de cada proceso es la plantilla que realmente aparece,
              mayor que la necesaria porque nadie está ocupado el 95% del tiempo ni trabaja un solo
              tipo de trámite.
            </p>
          </Seccion>

          {/* ── Scorecard ── */}
          <Seccion n="Fase Revisión / ROI" titulo="Scorecard: retorno real contra línea base"
            sub={`Business Case: ${usd(inf.precioLicencia)} por licencia × ${num(meta)} licencias/año, prorrateado a los ${sc.meses} meses completos medidos.`}>
            <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
              <div className="table-wrap">
                <table className="pmo">
                  <thead>
                    <tr>
                      <th>Métrica</th>
                      <th style={{ textAlign: "center" }}>Proyectado (línea base)</th>
                      <th style={{ textAlign: "center" }}>Real ejecutado</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="font-semibold">Inversión en licencias</td>
                      <td className="tabular-nums text-center text-[var(--text-muted)]">{usd(sc.inversionBase)}</td>
                      <td className="tabular-nums text-center font-bold">{usd(sc.inversionReal)}</td>
                    </tr>
                    <tr>
                      <td className="font-semibold">Licencias consumidas</td>
                      <td className="tabular-nums text-center text-[var(--text-muted)]">{num(sc.metaMensual * sc.meses)}</td>
                      <td className="tabular-nums text-center font-bold">{num(sc.licencias)}</td>
                    </tr>
                    <tr>
                      <td className="font-semibold">Beneficio (ahorro en costo)</td>
                      <td className="text-center text-[var(--text-muted)]">—</td>
                      <td className="tabular-nums text-center font-bold" style={{ color: "var(--ok)" }}>{usd(sc.beneficio)}</td>
                    </tr>
                    <tr>
                      <td className="font-semibold">ROI</td>
                      <td className="text-center text-[var(--text-muted)]">—</td>
                      <td className="tabular-nums text-center font-bold" style={{ color: "var(--accent-light)" }}>
                        {pct(sc.roi, 1)} ({sc.multiplo.toFixed(1)}x)
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--text-muted)]">
                  La inversión real quedó por debajo de la línea base porque el consumo de licencias
                  sigue en ramp-up: {num(sc.licenciasUltimoMes)} de {num(sc.metaMensual)} licencias
                  al mes en {ultimo?.label ?? "—"}.
                  {sc.licencias > 0 && (
                    <> Al precio que trae la hoja ({usd(sc.inversionHoja / sc.licencias)} por licencia,
                      contra los {usd(inf.precioLicencia)} del Business Case) la inversión real
                      sería {usd(sc.inversionHoja)} y el ROI {pct((sc.beneficio - sc.inversionHoja) / sc.inversionHoja, 1)}.</>
                  )}
                </p>
              </div>

              {escala && (
                <div className="rounded-xl p-4" style={{ background: "var(--bg-sidebar)" }}>
                  <div className="text-[0.64rem] font-bold uppercase tracking-wider" style={{ color: "var(--accent-light)" }}>
                    Proyección a escala completa
                  </div>
                  <p className="mt-1 text-[0.68rem] text-[var(--text-muted)]">
                    con la economía unitaria de {escala.label}
                  </p>
                  <div className="mt-2.5 tabular-nums text-[1.6rem] font-extrabold leading-none text-[var(--text-primary)]">
                    {usd(escala.ahorroMensual)}
                  </div>
                  <p className="mt-1 text-[0.7rem] leading-snug text-[var(--text-secondary)]">
                    ahorro mensual si DUCAFAST cubriera el 100% de los {num(escala.files)} files del mes
                  </p>
                  <div className="mt-3 tabular-nums text-[1.6rem] font-extrabold leading-none text-[var(--text-primary)]">
                    {usd(escala.ahorroAnual)}
                  </div>
                  <p className="mt-1 text-[0.7rem] leading-snug text-[var(--text-secondary)]">
                    ahorro anualizado a full escala
                  </p>
                  <p className="mt-3 border-t pt-2 text-[0.66rem] leading-relaxed text-[var(--text-muted)]"
                    style={{ borderColor: "var(--border)" }}>
                    Supone que el resto del volumen se comporta como el que ya pasa por DUCAFAST.
                    Los files que quedan fuera pueden ser justamente los que no se dejan automatizar,
                    así que léelo como techo, no como pronóstico.
                  </p>
                </div>
              )}
            </div>
          </Seccion>

          <p className="mt-4 text-[0.68rem] leading-relaxed text-[var(--text-muted)]">
            Todo el informe mide <strong>T1+T2+T3</strong> (Creado → Creación Pre-DUCA), el tramo que
            DUCAFAST automatiza; la revisión del analista y la firma quedan fuera porque ocurren
            igual con DUCAFAST y sin él. Calculado sobre todos los Files de {inf.anio} de la
            hoja 003, sin los filtros del tablero. Las horas salen de unir los intervalos de cada
            persona, así que el trabajo simultáneo no se cuenta dos veces, y los ejecutores
            automatizados no suman horas. Horario hábil L–J 08:00–13:00 y 14:00–18:00, V hasta las
            17:00; no se descuentan asuetos.
          </p>
        </>
      )}
    </div>
  );
}
