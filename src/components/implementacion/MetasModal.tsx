"use client";

// Popup de metas de Implementación, en dos partes:
//  1. La META de cada cliente: Vol (files por mes) y CM1 (dólares de Profit por file). Es
//     la misma para todos los meses, así que se captura una sola vez. El Total (Vol × CM1)
//     se calcula en vivo. Dejar los dos campos vacíos quita la meta de ese cliente.
//  2. El % a alcanzar de cada mes: qué parte de esa meta hay que lograr para darla por
//     cumplida (vacío = 100 %). Es uno por mes, igual para todos los clientes.
// Se guardan juntos en Firestore (PUT .../metas); quien no tiene la acción
// "edit_implementacion_metas" lo ve en solo lectura.
//
// El padre lo monta solo mientras está abierto (`{abierto && <MetasModal/>}`), así
// que los campos siempre arrancan desde lo guardado.

import { useState } from "react";
import Modal from "@/components/Modal";
import { authedFetch } from "@/lib/api";
import {
  OBJETIVO_DEFECTO, etiquetaMes, evaluarFilaMeta, evaluarObjetivo, fmtImporte, metaProfitMensual, type PuntoMes,
} from "@/lib/implementaciones";
import { META_BORDE, META_FONDO, META_FONDO_ENCABEZADO, META_TEXTO } from "@/components/implementacion/estiloMeta";
import type { MetaCliente, MetasImplementacionDoc, ObjetivoMes } from "@/types";

interface Campos { vol: string; cm1: string }
const VACIO: Campos = { vol: "", cm1: "" };

const estiloInput = (error: boolean): React.CSSProperties => ({
  background: "var(--bg-base)",
  borderColor: error ? "var(--bad)" : "var(--border)",
  color: "var(--text-primary)",
});

/** Un número sin ceros de más para volver a escribirlo en un campo: 90 → «90», 92.5 → «92.5». */
const aTexto = (n: number) => String(Math.round(n * 100) / 100);

const Titulo = ({ children, nota }: { children: React.ReactNode; nota: string }) => (
  <div className="mb-2">
    <h3 className="text-[1rem] font-bold text-[var(--text-primary)]">{children}</h3>
    <p className="text-[0.84rem] leading-relaxed text-[var(--text-muted)]">{nota}</p>
  </div>
);

export default function MetasModal({ clientes, meses, metas, objetivos, puedeEditar, onClose, onGuardado }: {
  /** Clientes que hay hoy en la hoja. */
  clientes: string[];
  /** Meses con fecha que hay hoy en la hoja (con su volumen de files). */
  meses: PuntoMes[];
  /** Metas guardadas (pueden incluir clientes que ya no aparecen en la hoja). */
  metas: MetaCliente[];
  /** % a alcanzar guardados por mes (pueden incluir meses que ya no están en la hoja). */
  objetivos: ObjetivoMes[];
  puedeEditar: boolean;
  onClose: () => void;
  onGuardado: (doc: MetasImplementacionDoc) => void;
}) {
  // Los clientes y los meses con algo guardado que ya no están en la hoja se conservan y
  // se muestran, para que guardar no los borre sin que el usuario lo note.
  const huerfanos = metas.map((m) => m.cliente).filter((c) => !clientes.includes(c));
  const nombres = [...clientes, ...huerfanos];

  const enHoja = new Map(meses.map((p) => [p.clave, p]));
  const filasMes = [...new Set([...meses.map((p) => p.clave), ...objetivos.map((o) => o.mes)])]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)) // el mes más reciente arriba
    .map((clave) => ({ clave, etiqueta: etiquetaMes(clave), volumen: enHoja.get(clave)?.volumen ?? null }));

  const [campos, setCampos] = useState<Record<string, Campos>>(() => {
    const ini: Record<string, Campos> = {};
    for (const m of metas) ini[m.cliente] = { vol: aTexto(m.vol), cm1: m.cm1.toFixed(2) };
    return ini;
  });
  const [pcts, setPcts] = useState<Record<string, string>>(() =>
    Object.fromEntries(objetivos.map((o) => [o.mes, aTexto(o.objetivo)])));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const setCliente = (n: string, p: Partial<Campos>) => setCampos((c) => ({ ...c, [n]: { ...(c[n] ?? VACIO), ...p } }));

  const evaluadas = nombres.map((n) => ({ n, ev: evaluarFilaMeta((campos[n] ?? VACIO).vol, (campos[n] ?? VACIO).cm1) }));
  const evaluadosMes = filasMes.map((f) => ({ ...f, ev: evaluarObjetivo(pcts[f.clave] ?? "") }));
  const hayErrores = evaluadas.some(({ ev }) => ev.errorVol || ev.errorCm1) || evaluadosMes.some(({ ev }) => ev.error);
  const nMetas = evaluadas.filter(({ ev }) => ev.completa).length;

  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      const metasLista: MetaCliente[] = evaluadas
        .filter(({ ev }) => ev.completa)
        .map(({ n, ev }) => ({ cliente: n, vol: ev.vol as number, cm1: ev.cm1 as number }));
      // El 100 % es el valor por defecto: no se guarda.
      const objetivosLista: ObjetivoMes[] = evaluadosMes
        .filter(({ ev }) => ev.objetivo != null && ev.objetivo !== OBJETIVO_DEFECTO)
        .map(({ clave, ev }) => ({ mes: clave, objetivo: ev.objetivo as number }));
      const res = await authedFetch("/api/roi/implementacion/metas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metas: metasLista, objetivos: objetivosLista }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      onGuardado((await res.json()) as MetasImplementacionDoc);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el cumplimiento");
      setGuardando(false);
    }
  };

  const bloqueado = !puedeEditar || guardando;
  const thMeta = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    background: META_FONDO_ENCABEZADO, color: META_TEXTO, padding: "8px 12px", ...extra,
  });

  return (
    <Modal open onClose={onClose} width={780} label="Cumplimiento de Implementación">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b p-5" style={{ borderColor: "var(--border)" }}>
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Cumplimiento</h2>
          <p className="mt-1 text-[0.9rem] leading-relaxed text-[var(--text-muted)]">
            <strong>Cumplimiento de Profit del mes = Vol × CM1.</strong> Es el mismo para todos los meses; lo que cambia de un
            mes a otro es el % del cumplimiento que hay que alcanzar.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar"
          className="shrink-0 rounded-lg px-2 py-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)]">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {!puedeEditar && (
          <div className="mb-4 rounded-lg border px-3 py-2 text-[0.88rem] text-[var(--text-muted)]"
            style={{ borderColor: "var(--border)", background: "var(--bg-hover)" }}>
            Solo lectura: tu rol no puede editar el cumplimiento.
          </div>
        )}

        <section>
          <Titulo nota="Igual para todos los meses. Deja Vol y CM1 vacíos para no ponerle cumplimiento a un cliente.">
            Cumplimiento por cliente
          </Titulo>
          <table className="w-full border-collapse text-[0.92rem]">
            <thead>
              <tr className="text-left text-[0.78rem] uppercase tracking-wide text-[var(--text-muted)]">
                <th className="pb-2 pr-3 font-medium">Cliente</th>
                <th className="font-medium" style={thMeta({ borderLeft: META_BORDE, borderTopLeftRadius: 8 })}>Vol (files/mes)</th>
                <th className="font-medium" style={thMeta()}>CM1 por file (USD)</th>
                <th className="text-right font-medium" style={thMeta({ borderRight: META_BORDE, borderTopRightRadius: 8 })}>
                  Total (Vol × CM1)
                </th>
              </tr>
            </thead>
            <tbody>
              {evaluadas.map(({ n, ev }, i) => {
                const ultima = i === evaluadas.length - 1;
                const c = campos[n] ?? VACIO;
                const celda = (extra: React.CSSProperties = {}): React.CSSProperties => ({
                  background: META_FONDO, padding: "8px 12px", ...(ultima ? { borderBottom: META_BORDE } : {}), ...extra,
                });
                return (
                  <tr key={n} className="align-top">
                    <td className="py-2.5 pr-3 text-[var(--text-primary)]">
                      <div className="max-w-[240px] truncate font-medium" title={n}>{n}</div>
                      {huerfanos.includes(n) && <div className="text-[0.78rem] text-[var(--text-muted)]">sin registros en la hoja</div>}
                    </td>
                    <td style={celda({ borderLeft: META_BORDE })}>
                      <input
                        value={c.vol}
                        onChange={(e) => setCliente(n, { vol: e.target.value })}
                        disabled={bloqueado}
                        inputMode="decimal"
                        placeholder="0"
                        aria-label={`Vol de ${n}`}
                        aria-invalid={!!ev.errorVol}
                        className="w-[110px] rounded-lg border px-2.5 py-1.5 text-right tabular-nums outline-none disabled:opacity-60"
                        style={estiloInput(!!ev.errorVol)}
                      />
                      {ev.errorVol && <div className="mt-0.5 text-[0.76rem]" style={{ color: "var(--bad)" }}>{ev.errorVol}</div>}
                    </td>
                    <td style={celda()}>
                      <div className="flex w-[130px] items-center rounded-lg border focus-within:border-[var(--accent)]"
                        style={estiloInput(!!ev.errorCm1)}>
                        <span className="pl-2.5 text-[var(--text-muted)]">$</span>
                        <input
                          value={c.cm1}
                          onChange={(e) => setCliente(n, { cm1: e.target.value })}
                          disabled={bloqueado}
                          inputMode="decimal"
                          placeholder="0.00"
                          aria-label={`CM1 de ${n}`}
                          aria-invalid={!!ev.errorCm1}
                          className="w-full bg-transparent px-2 py-1.5 text-right tabular-nums outline-none disabled:opacity-60"
                        />
                      </div>
                      {ev.errorCm1 && <div className="mt-0.5 text-[0.76rem]" style={{ color: "var(--bad)" }}>{ev.errorCm1}</div>}
                    </td>
                    <td className="text-right tabular-nums font-bold"
                      style={celda({ borderRight: META_BORDE, color: META_TEXTO, verticalAlign: "top", paddingTop: 14 })}>
                      {ev.completa ? fmtImporte(metaProfitMensual({ vol: ev.vol as number, cm1: ev.cm1 as number })) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="mt-7">
          <Titulo nota="Qué parte del cumplimiento hay que lograr en cada mes. Vacío = 100 %. Vale para todos los clientes.">
            % a alcanzar por mes
          </Titulo>
          {filasMes.length === 0 ? (
            <div className="py-4 text-[var(--text-muted)]">La hoja todavía no tiene meses con fecha de cierre.</div>
          ) : (
            <table className="w-full border-collapse text-[0.92rem]">
              <tbody>
                {evaluadosMes.map(({ clave, etiqueta, volumen, ev }) => (
                  <tr key={clave} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 pr-3">
                      <div className="font-medium text-[var(--text-primary)]">{etiqueta}</div>
                      <div className="text-[0.78rem] text-[var(--text-muted)]">
                        {volumen == null ? "sin registros en la hoja" : `${volumen.toLocaleString("es-GT")} files en la hoja`}
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex w-[110px] items-center rounded-lg border focus-within:border-[var(--accent)]"
                        style={estiloInput(!!ev.error)}>
                        <input
                          value={pcts[clave] ?? ""}
                          onChange={(e) => setPcts((p) => ({ ...p, [clave]: e.target.value }))}
                          disabled={bloqueado}
                          inputMode="decimal"
                          placeholder={String(OBJETIVO_DEFECTO)}
                          aria-label={`Porcentaje a alcanzar en ${etiqueta}`}
                          aria-invalid={!!ev.error}
                          className="w-full bg-transparent px-2.5 py-1.5 text-right tabular-nums outline-none disabled:opacity-60"
                        />
                        <span className="pr-2.5 text-[var(--text-muted)]">%</span>
                      </div>
                      {ev.error && <div className="mt-0.5 text-[0.76rem]" style={{ color: "var(--bad)" }}>{ev.error}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t p-4" style={{ borderColor: "var(--border)" }}>
        <span className="text-[0.85rem]" style={{ color: error || hayErrores ? "var(--bad)" : "var(--text-muted)" }}>
          {error || (hayErrores ? "Corrige los campos marcados para poder guardar." : `${nMetas} de ${nombres.length} clientes con cumplimiento`)}
        </span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
            style={{ borderColor: "var(--border)" }}>
            {puedeEditar ? "Cancelar" : "Cerrar"}
          </button>
          {puedeEditar && (
            <button type="button" onClick={guardar} disabled={guardando || hayErrores}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ background: "var(--accent)" }}>
              {guardando ? "Guardando…" : "Guardar cumplimiento"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
