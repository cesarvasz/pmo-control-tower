"use client";

// Popup de metas de Implementación: un bloque por cada mes que hay en la hoja y, en
// cada uno, los clientes con tres campos: Vol (files del mes), CM1 (dólares de Profit
// por file) y el % de la meta que hay que alcanzar (vacío = 100). La meta de Profit
// del mes es Vol × CM1 y se calcula en vivo. Dejar los tres campos vacíos quita la
// meta de ese cliente en ese mes. Se guardan todas juntas en Firestore (PUT .../metas);
// quien no tiene la acción "edit_implementacion_metas" lo ve en solo lectura.
//
// El padre lo monta solo mientras está abierto (`{abierto && <MetasModal/>}`), así
// que los campos siempre arrancan desde lo guardado.

import { Fragment, useState } from "react";
import Modal from "@/components/Modal";
import { authedFetch } from "@/lib/api";
import {
  claveMeta, etiquetaMes, evaluarFilaMeta, fmtImporte, metaProfitMensual, OBJETIVO_DEFECTO, type PuntoMes,
} from "@/lib/implementaciones";
import type { MetaCliente, MetasImplementacionDoc } from "@/types";

interface Campos { vol: string; cm1: string; obj: string }
const VACIO: Campos = { vol: "", cm1: "", obj: "" };

const estiloInput = (error: boolean): React.CSSProperties => ({
  background: "var(--bg-base)",
  borderColor: error ? "var(--bad)" : "var(--border)",
  color: "var(--text-primary)",
});

/** Un número sin ceros de más para volver a escribirlo en un campo: 90 → «90», 92.5 → «92.5». */
const aTexto = (n: number) => String(Math.round(n * 100) / 100);

export default function MetasModal({ clientes, meses, metas, puedeEditar, onClose, onGuardado }: {
  /** Clientes que hay hoy en la hoja. */
  clientes: string[];
  /** Meses con fecha que hay hoy en la hoja (con su volumen de files). */
  meses: PuntoMes[];
  /** Metas vigentes por cliente y mes (pueden incluir clientes o meses que ya no están en la hoja). */
  metas: MetaCliente[];
  puedeEditar: boolean;
  onClose: () => void;
  onGuardado: (metas: MetasImplementacionDoc["metas"]) => void;
}) {
  // Los clientes y los meses con meta que ya no están en la hoja se conservan y se
  // muestran, para que guardar no los borre sin que el usuario lo note.
  const huerfanos = [...new Set(metas.map((m) => m.cliente))].filter((c) => !clientes.includes(c));
  const nombres = [...clientes, ...huerfanos];

  const enHoja = new Map(meses.map((p) => [p.clave, p]));
  const clavesMes = [...new Set([...meses.map((p) => p.clave), ...metas.map((m) => m.mes)])]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // el mes más reciente arriba
  const bloques = clavesMes.map((clave) => ({
    clave,
    etiqueta: etiquetaMes(clave),
    // null = el mes ya no está en la hoja
    volumen: enHoja.get(clave)?.volumen ?? null,
  }));

  const [campos, setCampos] = useState<Record<string, Campos>>(() => {
    const ini: Record<string, Campos> = {};
    for (const m of metas) {
      ini[claveMeta(m.cliente, m.mes)] = {
        vol: aTexto(m.vol),
        cm1: m.cm1.toFixed(2),
        // El 100 % es el valor por defecto: se deja el campo vacío para no llenarlo de ruido.
        obj: m.objetivo === OBJETIVO_DEFECTO ? "" : aTexto(m.objetivo),
      };
    }
    return ini;
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const set = (llave: string, p: Partial<Campos>) => setCampos((c) => ({ ...c, [llave]: { ...(c[llave] ?? VACIO), ...p } }));

  // Un renglón por cliente y mes, ya evaluado.
  const celdas = bloques.flatMap((b) => nombres.map((n) => {
    const llave = claveMeta(n, b.clave);
    const c = campos[llave] ?? VACIO;
    return { llave, n, mes: b.clave, ev: evaluarFilaMeta(c.vol, c.cm1, c.obj) };
  }));
  const evaluadas = new Map(celdas.map((c) => [c.llave, c.ev]));
  const hayErrores = celdas.some(({ ev }) => ev.errorVol || ev.errorCm1 || ev.errorObjetivo);
  const nMetas = celdas.filter(({ ev }) => ev.completa).length;

  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      const lista: MetaCliente[] = celdas
        .filter(({ ev }) => ev.completa)
        .map(({ n, mes, ev }) => ({ cliente: n, mes, vol: ev.vol as number, cm1: ev.cm1 as number, objetivo: ev.objetivo }));
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
    <Modal open onClose={onClose} width={900} label="Metas por cliente y mes">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b p-5" style={{ borderColor: "var(--border)" }}>
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Metas por cliente y mes</h2>
          <p className="mt-1 text-[0.9rem] leading-relaxed text-[var(--text-muted)]">
            <strong>Meta de Profit del mes = Vol × CM1.</strong> En <strong>% a alcanzar</strong> pon qué parte de esa meta
            hay que lograr para darla por cumplida (vacío = 100 %). Deja los tres campos vacíos para no ponerle meta a un
            cliente ese mes.
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

        {bloques.length === 0 ? (
          <div className="py-8 text-center text-[var(--text-muted)]">La hoja todavía no tiene meses con fecha de cierre.</div>
        ) : (
          <table className="w-full border-collapse text-[0.92rem]">
            <thead>
              <tr className="text-left text-[0.78rem] uppercase tracking-wide text-[var(--text-muted)]">
                <th className="pb-2 pr-3 font-medium">Cliente</th>
                <th className="pb-2 pr-3 font-medium">Vol (files)</th>
                <th className="pb-2 pr-3 font-medium">CM1 (USD por file)</th>
                <th className="pb-2 pr-3 font-medium">% a alcanzar</th>
                <th className="pb-2 text-right font-medium">Meta de Profit</th>
              </tr>
            </thead>
            <tbody>
              {bloques.map((b) => (
                <Fragment key={b.clave}>
                  <tr>
                    <th colSpan={5} scope="colgroup" className="border-t px-0 pb-1.5 pt-4 text-left"
                      style={{ borderColor: "var(--border)" }}>
                      <span className="text-[1rem] font-bold text-[var(--accent-light)]">{b.etiqueta}</span>
                      <span className="ml-2 text-[0.8rem] font-normal text-[var(--text-muted)]">
                        {b.volumen == null ? "sin registros en la hoja" : `${b.volumen.toLocaleString("es-GT")} files en la hoja`}
                      </span>
                    </th>
                  </tr>
                  {nombres.map((n) => {
                    const llave = claveMeta(n, b.clave);
                    const c = campos[llave] ?? VACIO;
                    const ev = evaluadas.get(llave) ?? evaluarFilaMeta("", "");
                    const meta = ev.completa ? metaProfitMensual({ vol: ev.vol as number, cm1: ev.cm1 as number }) : null;
                    return (
                      <tr key={llave} className="align-top">
                        <td className="py-2.5 pr-3 text-[var(--text-primary)]">
                          <div className="max-w-[260px] truncate font-medium" title={n}>{n}</div>
                          {huerfanos.includes(n) && <div className="text-[0.78rem] text-[var(--text-muted)]">sin registros en la hoja</div>}
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            value={c.vol}
                            onChange={(e) => set(llave, { vol: e.target.value })}
                            disabled={!puedeEditar || guardando}
                            inputMode="decimal"
                            placeholder="0"
                            aria-label={`Vol de ${n} en ${b.etiqueta}`}
                            aria-invalid={!!ev.errorVol}
                            className="w-[100px] rounded-lg border px-2.5 py-1.5 text-right tabular-nums outline-none disabled:opacity-60"
                            style={estiloInput(!!ev.errorVol)}
                          />
                          {ev.errorVol && <div className="mt-0.5 text-[0.76rem]" style={{ color: "var(--bad)" }}>{ev.errorVol}</div>}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex w-[125px] items-center rounded-lg border focus-within:border-[var(--accent)]"
                            style={estiloInput(!!ev.errorCm1)}>
                            <span className="pl-2.5 text-[var(--text-muted)]">$</span>
                            <input
                              value={c.cm1}
                              onChange={(e) => set(llave, { cm1: e.target.value })}
                              disabled={!puedeEditar || guardando}
                              inputMode="decimal"
                              placeholder="0.00"
                              aria-label={`CM1 de ${n} en ${b.etiqueta}`}
                              aria-invalid={!!ev.errorCm1}
                              className="w-full bg-transparent px-2 py-1.5 text-right tabular-nums outline-none disabled:opacity-60"
                            />
                          </div>
                          {ev.errorCm1 && <div className="mt-0.5 text-[0.76rem]" style={{ color: "var(--bad)" }}>{ev.errorCm1}</div>}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex w-[100px] items-center rounded-lg border focus-within:border-[var(--accent)]"
                            style={estiloInput(!!ev.errorObjetivo)}>
                            <input
                              value={c.obj}
                              onChange={(e) => set(llave, { obj: e.target.value })}
                              disabled={!puedeEditar || guardando}
                              inputMode="decimal"
                              placeholder={String(OBJETIVO_DEFECTO)}
                              aria-label={`Porcentaje a alcanzar de ${n} en ${b.etiqueta}`}
                              aria-invalid={!!ev.errorObjetivo}
                              className="w-full bg-transparent px-2.5 py-1.5 text-right tabular-nums outline-none disabled:opacity-60"
                            />
                            <span className="pr-2.5 text-[var(--text-muted)]">%</span>
                          </div>
                          {ev.errorObjetivo && <div className="mt-0.5 text-[0.76rem]" style={{ color: "var(--bad)" }}>{ev.errorObjetivo}</div>}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          <div className="font-semibold text-[var(--text-primary)]">{meta != null ? fmtImporte(meta) : "—"}</div>
                          {meta != null && ev.objetivo !== OBJETIVO_DEFECTO && (
                            <div className="text-[0.78rem] text-[var(--text-muted)]">
                              a lograr: {fmtImporte(Math.round(meta * ev.objetivo) / 100)}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t p-4" style={{ borderColor: "var(--border)" }}>
        <span className="text-[0.85rem]" style={{ color: error || hayErrores ? "var(--bad)" : "var(--text-muted)" }}>
          {error || (hayErrores ? "Corrige los campos marcados para poder guardar." : `${nMetas} ${nMetas === 1 ? "meta capturada" : "metas capturadas"}`)}
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
