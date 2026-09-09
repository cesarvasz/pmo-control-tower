"use client";

// C6 — Costo del tiempo, D3/D4. Un usuario que lleva varios files a la vez no
// trabaja la suma de todos: el reloj corre una sola vez, así que se cobran
// horas EFECTIVAS (unión de tramos por usuario — ver costoClonacion en
// lib/clonaciones.ts), no la suma de duraciones por file.
//
// La sección va PARTIDA en dos grupos: "Sin herramienta" (Padre + SV) y "Con
// herramienta" (réplicas V). El tramo de cada fila es inicioMetrica → creación
// (con herramienta, desde la creación del file padre). La unión por usuario se
// hace dentro de cada grupo.

import { exportarCostoCSV, descargarCSV, type CostoClonacion as CostoTipo, type CostoPorOrigen } from "@/lib/clonaciones";

const COL_PADRE = "#2f77bc";
const COL_V = "#d97b34";

const usd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)} M`
    : n >= 10_000 ? `$${Math.round(n / 1000).toLocaleString("es-GT")} K`
      : `$${Math.round(n).toLocaleString("es-GT")}`;
const usdExacto = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const horas = (n: number) => `${n.toLocaleString("es-GT", { maximumFractionDigits: 1 })} h`;

function BloqueCosto({ titulo, color, costo, slug, onSeleccionarMes }: {
  titulo: string; color: string; costo: CostoTipo; slug: string; onSeleccionarMes: (clave: string) => void;
}) {
  const max = Math.max(1, ...costo.serie.map((p) => p.costo));
  const pico = costo.serie.length ? costo.serie.reduce((a, b) => (b.costo > a.costo ? b : a)) : null;
  const costoAlerta = costo.usuariosAlerta.reduce((s, p) => s + p.costo, 0);

  return (
    <section className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="flex items-center gap-2 text-[1.15rem] font-bold text-[var(--text-primary)]">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {titulo}
        </h4>
        <div className="text-right">
          <div className="text-[0.81rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Costo del periodo</div>
          <div className="tabular-nums text-[2.15rem] font-extrabold leading-none" style={{ color: "var(--card-value-total)" }}>
            {usd(costo.costoTotal)}
          </div>
        </div>
      </div>

      {costo.personas.length === 0 ? (
        <div className="py-6 text-center text-[1.02rem] text-[var(--text-muted)]">Sin tramos de costo en este grupo.</div>
      ) : (
        <>
          {costo.usuariosAlerta.length > 0 && (
            <div className="mb-3 rounded-lg border-l-[3px] px-3 py-2 text-[0.95rem] leading-relaxed"
              style={{ borderColor: "var(--warn)", background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
              <strong>{costo.usuariosAlerta.length} usuario{costo.usuariosAlerta.length === 1 ? "" : "s"} supera{costo.usuariosAlerta.length === 1 ? "" : "n"} el 120% del periodo</strong>{" "}
              ({horas(costo.ventana.horas)} hábiles mostradas, {usdExacto(costoAlerta)} en juego) — esperable si el
              inicio es anterior al primer file del recorte.
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { l: "Horas efectivas", v: horas(costo.horasEfectivas) },
              { l: "Horas sumadas", v: horas(costo.horasSuma) },
              { l: "Traslape descontado", v: `${costo.pctTraslapeDescontado.toFixed(0)}%` },
              { l: "Usuarios", v: costo.nUsuarios.toLocaleString("es-GT") },
              { l: "Costo por file", v: usdExacto(costo.costoPorFile) },
            ].map((c) => (
              <div key={c.l} className="rounded-lg px-3 py-2" style={{ background: "var(--bg-hover)" }}>
                <div className="text-[0.78rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{c.l}</div>
                <div className="tabular-nums text-[1.35rem] font-extrabold leading-tight text-[var(--text-primary)]">{c.v}</div>
              </div>
            ))}
          </div>

          {costo.serie.length > 0 && (
            <>
              <div className="table-wrap pb-1">
                <div className="flex min-w-max items-end gap-2 pt-5" style={{ height: 150 }}>
                  {costo.serie.map((p) => {
                    const alto = Math.max(2, (p.costo / max) * 105);
                    return (
                      <div key={p.clave} onClick={() => onSeleccionarMes(p.clave)}
                        title={`${p.label}\n${usdExacto(p.costo)} · ${horas(p.horas)} · ${p.volumen.toLocaleString("es-GT")} clonaciones`}
                        className="flex cursor-pointer flex-col items-center justify-end" style={{ width: 64 }}>
                        <span className="mb-1 tabular-nums text-[0.78rem] font-bold text-[var(--text-secondary)]">{usd(p.costo)}</span>
                        <div className="w-full rounded-t-sm transition-opacity hover:opacity-80"
                          style={{ height: alto, background: color, opacity: pico?.clave === p.clave ? 1 : 0.72 }} />
                        <span className="mt-1 whitespace-nowrap text-[0.78rem] text-[var(--text-muted)]">{p.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-1.5 text-[0.87rem] text-[var(--text-muted)]">
                Costo por mes de creación · clic en una barra para filtrar.
                {pico && <> Pico: <strong>{pico.label}</strong> con {usdExacto(pico.costo)}.</>}
              </p>
            </>
          )}

          <div className="mt-4 mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h5 className="text-[1.02rem] font-bold text-[var(--text-primary)]">Costo por usuario</h5>
            <button
              onClick={() => descargarCSV(`clonacion-costo-${slug}-${new Date().toISOString().slice(0, 10)}.csv`, exportarCostoCSV(costo.personas))}
              className="rounded-lg border px-2.5 py-1 text-[0.92rem] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
              style={{ borderColor: "var(--accent)", color: "var(--accent-light)" }}>
              ↓ CSV
            </button>
          </div>
          <div className="table-wrap">
            <table className="pmo">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th style={{ textAlign: "center" }}>Files</th>
                  <th style={{ textAlign: "center" }} title="Suma de sus clonaciones: cuenta la misma hora una vez por clonación abierta">Horas sumadas</th>
                  <th style={{ textAlign: "center" }} title="Unión de sus tramos: cada hora cuenta una sola vez">Horas efectivas</th>
                  <th style={{ textAlign: "center" }} title="Suma ÷ efectivas × 100 — 100% = sin traslape">Traslape</th>
                  <th style={{ textAlign: "center" }} title="Horas efectivas ÷ horas hábiles del periodo mostrado">% del periodo</th>
                  <th style={{ textAlign: "center" }}>Costo</th>
                  <th style={{ textAlign: "center" }} title="Costo ÷ files del usuario">Costo/file</th>
                </tr>
              </thead>
              <tbody>
                {costo.personas.slice(0, 150).map((p) => (
                  <tr key={p.usuario} style={p.pctPeriodo > 120 ? { color: "var(--warn)" } : undefined}>
                    <td className="truncate" title={p.usuario}>{p.usuario}</td>
                    <td className="tabular-nums text-center">{p.files.toLocaleString("es-GT")}</td>
                    <td className="tabular-nums text-center text-[var(--text-muted)]">{horas(p.horasSuma)}</td>
                    <td className="tabular-nums text-center font-bold">{horas(p.horasEfectivas)}</td>
                    <td className="tabular-nums text-center">{p.traslapePct.toFixed(0)}%</td>
                    <td className="tabular-nums text-center font-semibold" style={{ color: p.pctPeriodo > 120 ? "var(--warn)" : undefined }}>
                      {p.pctPeriodo.toFixed(0)}%
                    </td>
                    <td className="tabular-nums text-center font-semibold">{usdExacto(p.costo)}</td>
                    <td className="tabular-nums text-center text-[var(--text-muted)]">{usdExacto(p.files > 0 ? p.costo / p.files : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {costo.personas.length > 150 && (
            <p className="mt-2 text-[0.9rem] text-[var(--text-muted)]">Se muestran las 150 con más horas de {costo.personas.length}.</p>
          )}
        </>
      )}
    </section>
  );
}

export default function CostoClonacion({
  costoPorOrigen, tarifa, onTarifa, onSeleccionarMes,
}: {
  costoPorOrigen: CostoPorOrigen;
  tarifa: number;
  onTarifa: (v: number) => void;
  onSeleccionarMes: (clave: string) => void;
}) {
  const { padreSv, v, costoTotal, contrafactual: cf } = costoPorOrigen;

  return (
    <div className="viz-etapas">
      <div className="mb-4 rounded-lg border-l-[3px] px-3.5 py-2.5 text-[0.98rem] leading-relaxed"
        style={{ borderColor: "var(--ok)", background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
        <strong>Se cobran horas de reloj, no la suma de las clonaciones.</strong>{" "}
        Los tramos de cada usuario se <em>unen</em> antes de contar: si trabajó dos files de 9 a 10 a. m.,
        cuenta 1 h, no 2. El tramo va de <strong>inicio → Creación</strong> (para las réplicas <em>V</em>,
        desde la creación del file padre). El costo se calcula por separado para cada grupo.
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-5">
        <label className="block">
          <span className="mb-1 block text-[0.87rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Tarifa por hora hábil, por usuario (USD)
          </span>
          <input
            type="number" min={0} step={0.5} value={tarifa}
            onChange={(e) => onTarifa(Math.max(0, Number(e.target.value) || 0))}
            className="w-28 rounded-lg border px-3 py-1.5 text-base outline-none"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
        </label>

        <div className="ml-auto flex items-end gap-5 text-right">
          <div>
            <div className="text-[0.81rem] font-bold uppercase tracking-wider" style={{ color: COL_PADRE }}>Sin herramienta</div>
            <div className="tabular-nums text-[1.5rem] font-extrabold" style={{ color: "var(--text-primary)" }}>{usd(padreSv.costoTotal)}</div>
          </div>
          <div>
            <div className="text-[0.81rem] font-bold uppercase tracking-wider" style={{ color: COL_V }}>Con herramienta</div>
            <div className="tabular-nums text-[1.5rem] font-extrabold" style={{ color: "var(--text-primary)" }}>{usd(v.costoTotal)}</div>
          </div>
          <div>
            <div className="text-[0.81rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Total</div>
            <div className="tabular-nums text-[2.6rem] font-extrabold leading-none text-[var(--card-value-total)]">{usd(costoTotal)}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <BloqueCosto titulo="Sin herramienta" color={COL_PADRE} costo={padreSv} slug="sin-herramienta" onSeleccionarMes={onSeleccionarMes} />
        <BloqueCosto titulo="Con herramienta" color={COL_V} costo={v} slug="con-herramienta" onSeleccionarMes={onSeleccionarMes} />
      </div>

      {cf.nFilesV > 0 && cf.costoPorFilePadreSv > 0 && (
        <div className="mt-4 rounded-xl border-l-4 p-4"
          style={{ borderColor: "var(--ok)", background: "var(--bg-hover)" }}>
          <div className="text-[0.9rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Valor de la herramienta — contrafactual
          </div>
          <p className="mt-1 text-[1.02rem] leading-relaxed text-[var(--text-secondary)]">
            Producir a mano los{" "}
            <strong>{cf.nFilesV.toLocaleString("es-GT")}</strong> files hechos con herramienta habría costado{" "}
            <strong style={{ color: "var(--card-value-total)" }}>{usdExacto(cf.costoManualV)}</strong>{" "}
            — a {usdExacto(cf.costoPorFilePadreSv)}/file, lo que cuesta un file sin herramienta.
            Con la herramienta costaron {usdExacto(v.costoTotal)}.
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[0.85rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Ahorro estimado</span>
            <span className="tabular-nums text-[2.15rem] font-extrabold leading-none" style={{ color: "var(--ok)" }}>
              {usd(cf.ahorro)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
