"use client";

// Costo del tiempo medido, a una tarifa por hora.
//
// La línea de tiempo se calcula sobre los expedientes YA filtrados, así que
// responde a todos los filtros del reporte sin hacer nada especial.
//
// El aviso de arriba no es decorativo: las etapas miden tiempo transcurrido, no
// horas trabajadas, y sin el divisor de simultaneidad el total responde a «cuánto
// vale el calendario que ocupan estos trámites», no a nómina.

import { useState } from "react";
import type { Costo, EtapaKey } from "@/lib/tramites";

const usd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)} M`
    : n >= 10_000 ? `$${Math.round(n / 1000).toLocaleString("es-GT")} K`
      : `$${Math.round(n).toLocaleString("es-GT")}`;

const usdExacto = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const horas = (n: number) => `${Math.round(n).toLocaleString("es-GT")} h`;

export default function CostoTiempo({
  costo, tarifa, onTarifa, simultaneos, onSimultaneos, porDia, onSeleccionarPeriodo,
}: {
  costo: Costo;
  tarifa: number;
  onTarifa: (v: number) => void;
  simultaneos: number;
  onSimultaneos: (v: number) => void;
  porDia: boolean;
  onSeleccionarPeriodo: (clave: string) => void;
}) {
  const [activa, setActiva] = useState<EtapaKey | null>(null);
  const max = Math.max(1, ...costo.serie.map((p) => p.costo));
  const pico = costo.serie.reduce((a, b) => (b.costo > a.costo ? b : a), costo.serie[0]);

  return (
    <div className="viz-etapas">
      {/* Aviso: qué mide y qué no mide este número */}
      <div className="mb-4 rounded-lg border-l-[3px] px-3.5 py-2.5 text-[0.76rem] leading-relaxed"
        style={{ borderColor: "var(--warn)", background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
        <strong>Es el costo del tiempo transcurrido, no de horas trabajadas.</strong>{" "}
        Las etapas miden el reloj entre dos hitos, y buena parte de eso es expediente esperando en
        cola. Con <em>simultáneos = 1</em> el total responde a «cuánto vale el calendario que ocupan
        estos trámites». Súbelo a cuántos expedientes lleva de verdad una persona a la vez para
        acercarte a horas de trabajo.
      </div>

      {/* Controles */}
      <div className="mb-4 flex flex-wrap items-end gap-5">
        <label className="block">
          <span className="mb-1 block text-[0.68rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Tarifa por hora (USD)
          </span>
          <input
            type="number" min={0} step={0.5} value={tarifa}
            onChange={(e) => onTarifa(Math.max(0, Number(e.target.value) || 0))}
            className="w-28 rounded-lg border px-3 py-1.5 text-sm outline-none"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[0.68rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Expedientes simultáneos por persona
          </span>
          <span className="flex items-center gap-2.5">
            <input
              type="range" min={1} max={40} step={1} value={simultaneos}
              onChange={(e) => onSimultaneos(Number(e.target.value))}
              style={{ width: 170, accentColor: "var(--accent)" }}
            />
            <input
              type="number" min={1} max={200} value={simultaneos}
              onChange={(e) => onSimultaneos(Math.max(1, Number(e.target.value) || 1))}
              className="w-20 rounded-lg border px-2 py-1.5 text-sm outline-none"
              style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
          </span>
        </label>

        <div className="ml-auto text-right">
          <div className="text-[0.66rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Costo del periodo filtrado
          </div>
          <div className="tabular-nums text-[2rem] font-extrabold leading-none text-[var(--card-value-total)]">
            {usd(costo.costo)}
          </div>
          <div className="mt-0.5 text-[0.72rem] text-[var(--text-muted)]">
            {usdExacto(costo.costo)} · {horas(costo.horas)} · {costo.n.toLocaleString("es-GT")} expedientes
          </div>
        </div>
      </div>

      {/* Línea de tiempo */}
      {costo.serie.length === 0 ? (
        <div className="py-8 text-center text-[0.82rem] text-[var(--text-muted)]">
          Sin periodos en el recorte actual.
        </div>
      ) : (
        <>
          <div className="table-wrap pb-1">
            <div className="flex min-w-max items-end gap-1" style={{ height: 150 }}>
              {costo.serie.map((p) => {
                const alto = Math.max(2, (p.costo / max) * 130);
                const esPico = p.clave === pico?.clave;
                return (
                  <div
                    key={p.clave}
                    onClick={() => onSeleccionarPeriodo(p.clave)}
                    title={`${p.label}\n${usdExacto(p.costo)} · ${horas(p.horas)} · ${p.volumen.toLocaleString("es-GT")} expedientes`}
                    className="flex cursor-pointer flex-col items-center justify-end"
                    style={{ width: porDia ? 22 : 52 }}
                  >
                    <span className="mb-1 tabular-nums text-[0.62rem] font-bold text-[var(--text-secondary)]">
                      {porDia ? "" : usd(p.costo)}
                    </span>
                    <div
                      className="w-full rounded-t-sm transition-opacity hover:opacity-80"
                      style={{ height: alto, background: esPico ? "var(--bad)" : "var(--accent)", opacity: esPico ? 0.95 : 0.8 }}
                    />
                    <span className="mt-1 whitespace-nowrap text-[0.62rem] text-[var(--text-muted)]"
                      style={{ transform: porDia ? "rotate(-45deg)" : undefined, transformOrigin: "top left" }}>
                      {p.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-[0.7rem] text-[var(--text-muted)]">
            Costo por {porDia ? "día" : "mes"} de creación del expediente. Clic en una barra para filtrar ese periodo.
            {pico && <> El pico es <strong>{pico.label}</strong> con {usdExacto(pico.costo)}.</>}
          </p>
        </>
      )}

      {/* Reparto por etapa */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {costo.porEtapa.map((e) => {
          const atenuado = activa != null && activa !== e.key;
          return (
            <div
              key={e.key}
              onMouseEnter={() => setActiva(e.key)}
              onMouseLeave={() => setActiva(null)}
              className="rounded-lg px-2.5 py-2 transition-opacity"
              style={{ background: "var(--bg-hover)", opacity: atenuado ? 0.45 : 1 }}
            >
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: e.color }} />
                <span className="text-[0.7rem] font-bold text-[var(--text-primary)]">{e.corto}</span>
                <span className="ml-auto tabular-nums text-[0.72rem] font-bold" style={{ color: e.color }}>
                  {e.pct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-0.5 truncate text-[0.66rem] text-[var(--text-muted)]" title={e.label}>{e.label}</div>
              <div className="tabular-nums text-[0.82rem] font-semibold text-[var(--text-secondary)]">
                {usd(e.costo)}
              </div>
              <div className="tabular-nums text-[0.66rem] text-[var(--text-muted)]">{horas(e.horas)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
