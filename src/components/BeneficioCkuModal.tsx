"use client";

// Popup del Beneficio de un CKU en /players (clic en la celda «Beneficio»).
//  · El CKU sin Implementación (Javier): solo el total del Beneficio ROI Confirmado — nada del costo/beneficio de Monday.
//  · El CKU que lleva Implementación (Victoria, ver CKU_CON_IMPLEMENTACION): arriba su Beneficio del mes — lo cumplido ÷ la
//    meta de Implementación y Ducafast Mesa 2 (el mismo % y los mismos pts de la tabla) y, por métrica y en total, la meta
//    y lo cumplido en dólares con su porcentaje — y debajo el detalle: las cuentas de Implementación y los Files de
//    Ducafast Mesa 2. Sin fórmulas ni ROI Confirmado (ya no entra en su Beneficio).
//  Los colores de los indicadores: 100 % verde · 95–99 amarillo · menos de 95 rojo; ningún % pasa de 100. Las metas, en neutro.

import { Fragment, useState } from "react";
import Modal from "@/components/Modal";
import { etiquetaMesLargo } from "@/lib/players";
import { colorIndicadorCku, type BenefitKpiCku } from "@/lib/kpi";

const IMPL = "var(--info)";
const DUCA = "var(--accent-light)";

const usd = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => Math.round(n).toLocaleString("es-GT");
/** real ÷ meta como ratio (sin tope), o null si no hay meta. */
const ratio = (real: number, meta: number) => (meta > 0 ? real / meta : null);
/** Porcentaje de un ratio, o «—» si no hay. Ningún indicador pasa de 100 %. */
const pct = (r: number | null, decimales = 0) =>
  r == null ? "—" : `${(Math.round(Math.min(r, 1) * 10 ** (2 + decimales)) / 10 ** decimales).toLocaleString("es-GT")}%`;
/** Color de un indicador del CKU: 100 % verde · 95–99 amarillo · menos de 95 rojo (ver colorIndicadorCku). */
const semaforo = (r: number | null) => (r == null ? "var(--text-muted)" : colorIndicadorCku(Math.min(r, 1) * 100));

const Seccion = ({ titulo, nota, acento, children }: { titulo: string; nota?: React.ReactNode; acento: string; children: React.ReactNode }) => (
  <section className="rounded-xl border p-4" style={{ borderColor: "var(--border)", borderLeft: `5px solid ${acento}` }}>
    <div className="text-[0.62rem] font-bold uppercase tracking-widest" style={{ color: acento }}>{titulo}</div>
    {nota && <div className="mt-1 text-[0.74rem] leading-relaxed text-[var(--text-muted)]">{nota}</div>}
    <div className="mt-3">{children}</div>
  </section>
);

const Vacio = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg px-4 py-4 text-center text-[0.82rem] text-[var(--text-muted)]" style={{ background: "var(--bg-hover)" }}>{children}</div>
);

/** Resumen de arriba: el % del Beneficio (cumplido total ÷ meta total de Implementación y Ducafast Mesa 2), los pts que vale y,
 *  por métrica y en total, la meta y lo cumplido en dólares con su porcentaje. */
function ResumenTotal({ mesLabel, b }: { mesLabel: string; b: BenefitKpiCku }) {
  const m = b.metricasMes;
  if (!m) return null;
  const r = m.pctTotal;
  const color = semaforo(r);
  const impl = b.implementacion, duca = b.ducafast;
  const filas: { nombre: string; meta: number | null; real: number | null; r: number | null }[] = [
    { nombre: "Implementación", meta: impl ? impl.meta : null, real: impl ? impl.profit : null, r: m.pctImplementacion },
    { nombre: "Ducafast Mesa 2", meta: duca?.metaUsd ?? null, real: duca?.ahorroUsd ?? null, r: m.pctDucafast },
  ];
  const metaTotal = r == null ? null : m.metaTotal;
  const realTotal = r == null ? null : m.realTotal;
  const th = "pb-1.5 text-right font-semibold";
  const td = "py-1 text-right tabular-nums";
  return (
    <section className="rounded-xl border p-4" style={{ borderColor: color, borderWidth: 2, background: "var(--bg-hover)" }}>
      <div className="text-[0.62rem] font-bold uppercase tracking-widest text-[var(--text-muted)]">Beneficio · {mesLabel}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[2.4rem] font-extrabold leading-none tabular-nums" style={{ color }}>{pct(r, 1)}</span>
        <span className="text-[0.85rem] font-semibold tabular-nums text-[var(--text-secondary)]">{Math.round(b.total)} pts de {b.peso}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, (r ?? 0) * 100))}%`, background: color }} />
      </div>
      <table className="mt-3 w-full text-[0.8rem]">
        <thead>
          <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
            <th className="pb-1.5 text-left font-semibold" />
            <th className={th}>Meta</th>
            <th className={th}>Cumplido</th>
            <th className={th}>%</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.nombre} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-1 text-left text-[var(--text-secondary)]">{f.nombre}</td>
              <td className={`${td} text-[var(--text-primary)]`}>{f.meta == null ? "—" : usd(f.meta)}</td>
              <td className={td} style={{ color: semaforo(f.r) }}>{f.real == null ? "—" : usd(f.real)}</td>
              <td className={`${td} font-bold`} style={{ color: semaforo(f.r) }}>{pct(f.r, 1)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-bold" style={{ borderColor: "var(--border)" }}>
            <td className="py-1.5 text-left text-[var(--text-primary)]">Total</td>
            <td className={`${td} text-[var(--text-primary)]`}>{metaTotal == null ? "—" : usd(metaTotal)}</td>
            <td className={td} style={{ color }}>{realTotal == null ? "—" : usd(realTotal)}</td>
            <td className={td} style={{ color }}>
              {pct(r, 1)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function CuentasAImplementar({ b, mesLabel }: { b: BenefitKpiCku; mesLabel: string }) {
  const impl = b.implementacion;
  const cuentas = impl?.cuentas ?? [];
  // Acordeón: los grupos (varias cuentas medidas como una) se abren para ver a cada cliente suyo.
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set());
  const alternar = (cliente: string) =>
    setAbiertas((prev) => { const n = new Set(prev); if (!n.delete(cliente)) n.add(cliente); return n; });
  return (
    <Seccion
      titulo="Implementación" acento={IMPL}>
      {!impl || cuentas.length === 0 ? (
        <Vacio>No hay cuentas con meta de Implementación para {mesLabel}.</Vacio>
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-[0.8rem]">
            <thead>
              <tr style={{ background: "var(--bg-hover)" }}>
                <th className="px-3 py-2 text-left font-semibold text-[var(--text-secondary)]">Cuenta</th>
                <th className="px-3 py-2 text-right font-semibold text-[var(--text-secondary)]">Files</th>
                <th className="px-3 py-2 text-right font-semibold text-[var(--text-secondary)]">Meta</th>
                <th className="px-3 py-2 text-right font-semibold text-[var(--text-secondary)]">Profit</th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => {
                const r = ratio(c.profit, c.meta);
                const miembros = c.miembros ?? [];
                const abierta = abiertas.has(c.cliente);
                return (
                  <Fragment key={c.cliente}>
                    <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-2 text-[var(--text-primary)]">
                        {miembros.length > 0 ? (
                          <button type="button" onClick={() => alternar(c.cliente)} aria-expanded={abierta}
                            className="flex w-full items-center gap-2 text-left font-semibold hover:text-[var(--accent-light)]">
                            <span aria-hidden className="inline-block w-3 text-[0.7rem] text-[var(--text-muted)]">{abierta ? "▾" : "▸"}</span>
                            <span>{c.cliente}</span>
                            <span className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-semibold text-[var(--text-muted)]" style={{ background: "var(--bg-hover)" }}>
                              {miembros.length} cuentas
                            </span>
                          </button>
                        ) : c.cliente}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{num(c.files)} / {num(c.vol)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text-primary)]">{usd(c.meta)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span style={{ color: semaforo(r) }}>{usd(c.profit)}</span>
                        <span className="ml-1.5 text-[0.7rem] font-bold" style={{ color: semaforo(r) }}>{pct(r)}</span>
                      </td>
                    </tr>
                    {abierta && miembros.map((m) => (
                      <tr key={m.cliente} className="border-t text-[0.76rem]" style={{ borderColor: "var(--border)", background: "var(--bg-hover)" }}>
                        <td className="py-1.5 pl-10 pr-3 text-[var(--text-secondary)]">{m.cliente}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-muted)]">{num(m.files)}</td>
                        <td className="px-3 py-1.5" />
                        <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-secondary)]">{usd(m.profit)}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2" style={{ borderColor: "var(--border)", background: "var(--bg-hover)" }}>
                <td className="px-3 py-2 font-bold text-[var(--text-primary)]" colSpan={2}>Meta de {mesLabel}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-[var(--text-primary)]">{usd(impl.meta)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">
                  <span style={{ color: semaforo(ratio(impl.profit, impl.meta)) }}>{usd(impl.profit)}</span>
                  <span className="ml-1.5 text-[0.7rem]" style={{ color: semaforo(ratio(impl.profit, impl.meta)) }}>{pct(ratio(impl.profit, impl.meta))}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Seccion>
  );
}

/** Costo total de un grupo, o «—» si no tiene Files con tiempo medido. */
const costo = (n: number | null | undefined) => (n == null ? "—" : usd(n));

/** Ducafast Mesa 2 del mes: los Files que lo usaron y los que no, y el % (el mismo de arriba). */
function DucafastMesa2({ b, mesLabel }: { b: BenefitKpiCku; mesLabel: string }) {
  const d = b.ducafast;
  const r = b.metricasMes?.pctDucafast ?? null;
  return (
    <Seccion titulo="Ducafast Mesa 2" acento={DUCA}>
      {!d || d.files === 0 ? (
        <Vacio>No hay Files de la Mesa 2 en {mesLabel}.</Vacio>
      ) : (
        <div className="space-y-3">
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-[0.8rem]">
            <thead>
              <tr style={{ background: "var(--bg-hover)" }}>
                <th className="px-3 py-2 text-left font-semibold text-[var(--text-secondary)]">Files</th>
                <th className="px-3 py-2 text-right font-semibold text-[var(--text-secondary)]">Cantidad</th>
                <th className="px-3 py-2 text-right font-semibold text-[var(--text-secondary)]">Costo por File</th>
                <th className="px-3 py-2 text-right font-semibold text-[var(--text-secondary)]">Costo total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2 text-[var(--text-primary)]">Con Ducafast</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: semaforo(r) }}>{num(d.filesCon)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">{costo(d.porFileCon)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">{costo(d.costoCon)}</td>
              </tr>
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2 text-[var(--text-primary)]">Sin Ducafast</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{num(d.files - d.filesCon)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">{costo(d.porFileSin)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">{costo(d.costoSin)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2" style={{ borderColor: "var(--border)", background: "var(--bg-hover)" }}>
                <td className="px-3 py-2 font-bold text-[var(--text-primary)]">Total de {mesLabel}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">
                  <span className="text-[var(--text-primary)]">{num(d.files)}</span>
                  <span className="ml-1.5 text-[0.7rem]" style={{ color: semaforo(r) }}>{pct(r, 1)}</span>
                </td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums font-bold text-[var(--text-primary)]">
                  {d.costoCon == null && d.costoSin == null ? "—" : usd((d.costoCon ?? 0) + (d.costoSin ?? 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        </div>
      )}
    </Seccion>
  );
}

export default function BeneficioCkuModal({ cku, beneficioCku, etiquetaRoi, conImplementacion, mes, onClose }: {
  cku: string;
  beneficioCku: BenefitKpiCku;
  /** De dónde sale lo confirmado («ROI · T1 → T3»); undefined = ROI no cargó y es el de Monday. */
  etiquetaRoi?: string;
  /** El CKU que lleva Implementación (Victoria): ve su Beneficio como lo cumplido ÷ la meta de Implementación y Ducafast Mesa 2. */
  conImplementacion: boolean;
  /** Mes («yyyy-MM») del Beneficio y de las cuentas a implementar. */
  mes: string;
  onClose: () => void;
}) {
  const mesLabel = etiquetaMesLargo(mes);
  return (
    <Modal open onClose={onClose} width={980} label={`Beneficio de ${cku}`}>
      <div className="flex shrink-0 items-start justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="text-[0.68rem] uppercase tracking-widest text-[var(--text-muted)]">Beneficio</div>
          <div className="mt-0.5 text-[1.1rem] font-bold text-[var(--text-primary)]">{cku}</div>
        </div>
        <button onClick={onClose} aria-label="Cerrar"
          className="rounded-lg px-2 py-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">✕</button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {conImplementacion && <ResumenTotal mesLabel={mesLabel} b={beneficioCku} />}
        {conImplementacion && <CuentasAImplementar b={beneficioCku} mesLabel={mesLabel} />}
        {conImplementacion && <DucafastMesa2 b={beneficioCku} mesLabel={mesLabel} />}

        {!conImplementacion && (
        <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg-hover)" }}>
          <div className="text-[0.62rem] uppercase tracking-widest text-[var(--text-muted)]">Beneficio ROI Confirmado</div>
          <div className="mt-1 text-[1.9rem] font-extrabold leading-tight tabular-nums" style={{ color: "var(--ok)" }}>{usd(beneficioCku.benefitConfirmado)}</div>
          <div className="mt-0.5 text-[0.74rem] text-[var(--text-muted)]">{etiquetaRoi ?? "El ROI no está disponible: se muestra el confirmado de Monday"}</div>
        </div>
        )}
      </div>
    </Modal>
  );
}
