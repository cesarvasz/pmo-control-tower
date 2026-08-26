"use client";

// C6 — Costo del tiempo, D3/D4. Un usuario que lleva varios files a la vez no
// trabaja la suma de todos: el reloj corre una sola vez, así que se cobran
// horas EFECTIVAS (unión de tramos por usuario — ver costoClonacion en
// lib/clonaciones.ts), no la suma de duraciones por file.

import { exportarCostoCSV, descargarCSV, type CostoClonacion as CostoTipo } from "@/lib/clonaciones";

const usd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)} M`
    : n >= 10_000 ? `$${Math.round(n / 1000).toLocaleString("es-GT")} K`
      : `$${Math.round(n).toLocaleString("es-GT")}`;
const usdExacto = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const horas = (n: number) => `${n.toLocaleString("es-GT", { maximumFractionDigits: 1 })} h`;

export default function CostoClonacion({
  costo, tarifa, onTarifa, onSeleccionarMes,
}: {
  costo: CostoTipo;
  tarifa: number;
  onTarifa: (v: number) => void;
  onSeleccionarMes: (clave: string) => void;
}) {
  const max = Math.max(1, ...costo.serie.map((p) => p.costo));
  const pico = costo.serie.length ? costo.serie.reduce((a, b) => (b.costo > a.costo ? b : a)) : null;
  const costoAlerta = costo.usuariosAlerta.reduce((s, p) => s + p.costo, 0);

  return (
    <div className="viz-etapas">
      <div className="mb-4 rounded-lg border-l-[3px] px-3.5 py-2.5 text-[0.76rem] leading-relaxed"
        style={{ borderColor: "var(--ok)", background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
        <strong>Se cobran horas de reloj, no la suma de las clonaciones.</strong>{" "}
        Quien lleva varias a la vez no trabaja la suma de todas: el reloj corre una sola vez. Por eso
        los tramos de cada usuario se <em>unen</em> antes de contar, y cada hora hábil se paga una sola
        vez.
        {costo.horasSuma > 0 && (
          <> Sumando por clonación saldrían {horas(costo.horasSuma)} — se descuenta el {costo.pctTraslapeDescontado.toFixed(0)}% por traslape.</>
        )}
      </div>

      {costo.usuariosAlerta.length > 0 && (
        <div className="mb-4 rounded-lg border-l-[3px] px-3.5 py-2.5 text-[0.76rem] leading-relaxed"
          style={{ borderColor: "var(--warn)", background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
          <strong>{costo.usuariosAlerta.length} usuario{costo.usuariosAlerta.length === 1 ? "" : "s"} supera{costo.usuariosAlerta.length === 1 ? "" : "n"} el 120% del periodo</strong>{" "}
          ({horas(costo.ventana.horas)} hábiles mostradas, {usdExacto(costoAlerta)} en juego). Es
          esperable cuando la solicitud es anterior al primer file del periodo — si no, acota con el
          filtro de antigüedad de la solicitud.
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-5">
        <label className="block">
          <span className="mb-1 block text-[0.68rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Tarifa por hora hábil, por usuario (USD)
          </span>
          <input
            type="number" min={0} step={0.5} value={tarifa}
            onChange={(e) => onTarifa(Math.max(0, Number(e.target.value) || 0))}
            className="w-28 rounded-lg border px-3 py-1.5 text-sm outline-none"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
        </label>

        <div className="ml-auto text-right">
          <div className="text-[0.66rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Costo del periodo filtrado
          </div>
          <div className="tabular-nums text-[2rem] font-extrabold leading-none text-[var(--card-value-total)]">
            {usd(costo.costoTotal)}
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { l: "Horas efectivas", v: horas(costo.horasEfectivas) },
          { l: "Horas sumadas", v: horas(costo.horasSuma) },
          { l: "Traslape descontado", v: `${costo.pctTraslapeDescontado.toFixed(0)}%` },
          { l: "Usuarios", v: costo.nUsuarios.toLocaleString("es-GT") },
          { l: "Costo total", v: usdExacto(costo.costoTotal) },
        ].map((c) => (
          <div key={c.l} className="rounded-lg px-3 py-2" style={{ background: "var(--bg-hover)" }}>
            <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{c.l}</div>
            <div className="tabular-nums text-[1.15rem] font-extrabold leading-tight text-[var(--text-primary)]">{c.v}</div>
          </div>
        ))}
      </div>

      {costo.serie.length === 0 ? (
        <div className="py-8 text-center text-[0.82rem] text-[var(--text-muted)]">Sin periodos en el recorte actual.</div>
      ) : (
        <>
          <div className="table-wrap pb-1">
            <div className="flex min-w-max items-end gap-1" style={{ height: 150 }}>
              {costo.serie.map((p) => {
                const alto = Math.max(2, (p.costo / max) * 130);
                const esPico = pico?.clave === p.clave;
                return (
                  <div key={p.clave} onClick={() => onSeleccionarMes(p.clave)}
                    title={`${p.label}\n${usdExacto(p.costo)} · ${horas(p.horas)} · ${p.volumen.toLocaleString("es-GT")} clonaciones`}
                    className="flex cursor-pointer flex-col items-center justify-end" style={{ width: 52 }}>
                    <span className="mb-1 tabular-nums text-[0.62rem] font-bold text-[var(--text-secondary)]">{usd(p.costo)}</span>
                    <div className="w-full rounded-t-sm transition-opacity hover:opacity-80"
                      style={{ height: alto, background: esPico ? "var(--bad)" : "var(--accent)", opacity: esPico ? 0.95 : 0.8 }} />
                    <span className="mt-1 whitespace-nowrap text-[0.62rem] text-[var(--text-muted)]">{p.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-[0.7rem] text-[var(--text-muted)]">
            Costo por mes de creación. Clic en una barra para filtrar ese mes.
            {pico && <> El pico es <strong>{pico.label}</strong> con {usdExacto(pico.costo)}.</>}
          </p>
        </>
      )}

      {costo.personas.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-[0.86rem] font-bold text-[var(--text-primary)]">Costo por usuario</h4>
            <button
              onClick={() => descargarCSV(`clonacion-costo-${new Date().toISOString().slice(0, 10)}.csv`, exportarCostoCSV(costo.personas))}
              className="rounded-lg border px-3 py-1.5 text-[0.74rem] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
              style={{ borderColor: "var(--accent)", color: "var(--accent-light)" }}>
              ↓ Exportar CSV
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
                  <th style={{ textAlign: "center" }} title="Horas efectivas ÷ horas hábiles del periodo mostrado. Puede pasar de 100% si la solicitud es anterior al periodo.">% del periodo</th>
                  <th style={{ textAlign: "center" }}>Costo</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[0.7rem] text-[var(--text-muted)]">
            Ventana del recorte ({new Date(costo.ventana.inicio).toLocaleDateString("es-GT")} –{" "}
            {new Date(costo.ventana.fin).toLocaleDateString("es-GT")} · {horas(costo.ventana.horas)} hábiles) — la
            misma para todos, contra las fechas de Creación mostradas.
          </p>
          {costo.personas.length > 150 && (
            <p className="mt-2 text-[0.72rem] text-[var(--text-muted)]">
              Se muestran las 150 con más horas de {costo.personas.length}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
