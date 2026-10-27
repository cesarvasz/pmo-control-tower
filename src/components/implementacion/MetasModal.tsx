"use client";

// Popup de metas de Implementación: lista los clientes y deja capturar, por cada
// uno, Vol (files por mes) y CM1 (dólares de Profit por file). La meta de Profit
// por mes es Vol × CM1 y se calcula en vivo. Dejar los dos campos vacíos quita la
// meta de ese cliente. Se guardan todas juntas en Firestore (PUT .../metas); quien
// no tiene la acción "edit_implementacion_metas" lo ve en solo lectura.
//
// El padre lo monta solo mientras está abierto (`{abierto && <MetasModal/>}`), así
// que los campos siempre arrancan desde lo guardado.

import { useState } from "react";
import Modal from "@/components/Modal";
import { authedFetch } from "@/lib/api";
import { evaluarFilaMeta, fmtImporte, metaProfitMensual } from "@/lib/implementaciones";
import type { MetaCliente, MetasImplementacionDoc } from "@/types";

interface Campos { vol: string; cm1: string }
const VACIO: Campos = { vol: "", cm1: "" };

const estiloInput = (error: boolean): React.CSSProperties => ({
  background: "var(--bg-base)",
  borderColor: error ? "var(--bad)" : "var(--border)",
  color: "var(--text-primary)",
});

export default function MetasModal({ clientes, metas, puedeEditar, onClose, onGuardado }: {
  /** Clientes que hay hoy en la hoja. */
  clientes: string[];
  /** Metas guardadas (pueden incluir clientes que ya no aparecen en la hoja). */
  metas: MetaCliente[];
  puedeEditar: boolean;
  onClose: () => void;
  onGuardado: (metas: MetaCliente[]) => void;
}) {
  // Los clientes con meta que ya no están en la hoja se conservan y se muestran,
  // para que guardar no los borre sin que el usuario lo note.
  const huerfanos = metas.map((m) => m.cliente).filter((c) => !clientes.includes(c));
  const nombres = [...clientes, ...huerfanos];

  const [campos, setCampos] = useState<Record<string, Campos>>(() => {
    const ini: Record<string, Campos> = {};
    for (const n of nombres) {
      const m = metas.find((x) => x.cliente === n);
      ini[n] = m ? { vol: String(m.vol), cm1: m.cm1.toFixed(2) } : { vol: "", cm1: "" };
    }
    return ini;
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const set = (n: string, p: Partial<Campos>) => setCampos((c) => ({ ...c, [n]: { ...(c[n] ?? VACIO), ...p } }));
  const evaluadas = nombres.map((n) => ({ n, ev: evaluarFilaMeta((campos[n] ?? VACIO).vol, (campos[n] ?? VACIO).cm1) }));
  const hayErrores = evaluadas.some(({ ev }) => ev.errorVol || ev.errorCm1);
  const nMetas = evaluadas.filter(({ ev }) => ev.completa).length;

  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      const lista: MetaCliente[] = evaluadas
        .filter(({ ev }) => ev.completa)
        .map(({ n, ev }) => ({ cliente: n, vol: ev.vol as number, cm1: ev.cm1 as number }));
      const res = await authedFetch("/api/roi/implementacion/metas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metas: lista }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const doc = (await res.json()) as MetasImplementacionDoc;
      onGuardado(doc.metas);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar las metas");
      setGuardando(false);
    }
  };

  return (
    <Modal open onClose={onClose} width={760} label="Metas por cliente">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b p-5" style={{ borderColor: "var(--border)" }}>
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Metas por cliente</h2>
          <p className="mt-1 text-[0.9rem] leading-relaxed text-[var(--text-muted)]">
            <strong>Meta de Profit por mes = Vol × CM1.</strong> Se aplica a cada mes de la tabla y con ella se calcula el
            % de meta alcanzada. Deja los dos campos vacíos para quitarle la meta a un cliente.
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
            Solo lectura: tu rol no puede editar las metas.
          </div>
        )}

        <table className="w-full border-collapse text-[0.92rem]">
          <thead>
            <tr className="text-left text-[0.78rem] uppercase tracking-wide text-[var(--text-muted)]">
              <th className="pb-2 pr-3 font-medium">Cliente</th>
              <th className="pb-2 pr-3 font-medium">Vol (files/mes)</th>
              <th className="pb-2 pr-3 font-medium">CM1 (USD por file)</th>
              <th className="pb-2 text-right font-medium">Meta de Profit/mes</th>
            </tr>
          </thead>
          <tbody>
            {evaluadas.map(({ n, ev }) => {
              const huerfano = huerfanos.includes(n);
              return (
                <tr key={n} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2.5 pr-3 text-[var(--text-primary)]">
                    <div className="max-w-[260px] truncate font-medium" title={n}>{n}</div>
                    {huerfano && <div className="text-[0.78rem] text-[var(--text-muted)]">sin registros en la hoja</div>}
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      value={(campos[n] ?? VACIO).vol}
                      onChange={(e) => set(n, { vol: e.target.value })}
                      disabled={!puedeEditar || guardando}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={`Vol de ${n}`}
                      aria-invalid={!!ev.errorVol}
                      className="w-[110px] rounded-lg border px-2.5 py-1.5 text-right tabular-nums outline-none disabled:opacity-60"
                      style={estiloInput(!!ev.errorVol)}
                    />
                    {ev.errorVol && <div className="mt-0.5 text-[0.76rem]" style={{ color: "var(--bad)" }}>{ev.errorVol}</div>}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex w-[130px] items-center rounded-lg border focus-within:border-[var(--accent)]"
                      style={estiloInput(!!ev.errorCm1)}>
                      <span className="pl-2.5 text-[var(--text-muted)]">$</span>
                      <input
                        value={(campos[n] ?? VACIO).cm1}
                        onChange={(e) => set(n, { cm1: e.target.value })}
                        disabled={!puedeEditar || guardando}
                        inputMode="decimal"
                        placeholder="0.00"
                        aria-label={`CM1 de ${n}`}
                        aria-invalid={!!ev.errorCm1}
                        className="w-full bg-transparent px-2 py-1.5 text-right tabular-nums outline-none disabled:opacity-60"
                      />
                    </div>
                    {ev.errorCm1 && <div className="mt-0.5 text-[0.76rem]" style={{ color: "var(--bad)" }}>{ev.errorCm1}</div>}
                  </td>
                  <td className="py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                    {ev.completa ? fmtImporte(metaProfitMensual({ vol: ev.vol as number, cm1: ev.cm1 as number })) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t p-4" style={{ borderColor: "var(--border)" }}>
        <span className="text-[0.85rem]" style={{ color: error || hayErrores ? "var(--bad)" : "var(--text-muted)" }}>
          {error || (hayErrores ? "Corrige los campos marcados para poder guardar." : `${nMetas} de ${nombres.length} clientes con meta`)}
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
              {guardando ? "Guardando…" : "Guardar metas"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
