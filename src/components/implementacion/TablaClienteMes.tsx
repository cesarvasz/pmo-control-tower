"use client";

// Implementación agrupada por Cliente: una fila por cliente y, por cada mes de
// cierre, Volumen (cantidad de files) y Profit (suma). Cuando hay metas
// capturadas se agrega "% Meta" por mes: Profit real ÷ (Vol × CM1) de ESE cliente
// en ESE mes, en verde cuando llega al % a alcanzar que se le puso a la meta.
// Cierra con el total por cliente (columna) y el total por mes (fila): ahí se suman
// solo los meses (y clientes) que tienen meta. Las columnas son los meses presentes
// en las filas que recibe, así que al filtrar por mes solo quedan esos. La primera
// columna y los encabezados se quedan fijos al hacer scroll.

import {
  SIN_FECHA, avanceMesCliente, avanceTotalCliente, avanceTotalGeneral, avanceTotalMes,
  claveMeta, etiquetaMes, fmtImporte, fmtPct, type Avance, type Celda, type IndiceMetas, type MatrizClienteMes,
} from "@/lib/implementaciones";
import type { MetaCliente } from "@/types";

/** Alto de la 1ª fila del encabezado: la 2ª se pega justo debajo al hacer scroll. */
const H1 = 38;
const SEPARADOR = "1px solid var(--border)";

const num = (n: number) => n.toLocaleString("es-GT");

/** Texto del tooltip de un %: de dónde sale la meta y cuánto hace falta para cumplirla. */
function detalle(a: Avance, meta?: MetaCliente): string {
  const base = `Profit ${fmtImporte(a.profit)} de una meta de ${fmtImporte(a.meta)}`;
  const origen = meta
    ? ` (Vol ${num(meta.vol)} × CM1 ${fmtImporte(meta.cm1)})`
    : a.n > 1 ? ` (suma de ${a.n} metas; solo lo que tiene meta)` : "";
  const objetivo = `A alcanzar: ${fmtPct(a.requerido / a.meta)} de la meta = ${fmtImporte(a.requerido)} → ${a.cumple ? "cumple" : "no llega"}`;
  return `${base}${origen}\n${objetivo}`;
}

/** Celda del % de la meta. Sin meta: «—» en gris. Verde cuando el Profit llega al
 *  % a alcanzar de la meta (no siempre es el 100 %). */
function CeldaPct({ a, titulo, estilo }: { a: Avance | null; titulo?: string; estilo?: React.CSSProperties }) {
  if (!a) return <td className="tabular-nums text-right text-[var(--text-disabled)]" style={estilo}>—</td>;
  return (
    <td className="tabular-nums text-right font-semibold" title={titulo}
      style={{ ...estilo, color: a.cumple ? "var(--ok)" : undefined }}>
      {fmtPct(a.pct)}
    </td>
  );
}

/** Las celdas de un mes (Volumen, Profit y, si hay metas, % Meta). Sin filas ese
 *  mes: «—» en gris. */
function Celdas({ c, pct, fuerte }: { c: Celda | undefined; pct?: React.ReactNode; fuerte?: boolean }) {
  const base: React.CSSProperties = { fontWeight: fuerte ? 700 : undefined, whiteSpace: "nowrap" };
  if (!c) {
    return (
      <>
        <td className="tabular-nums text-right text-[var(--text-disabled)]" style={{ ...base, borderLeft: SEPARADOR }}>—</td>
        <td className="tabular-nums text-right text-[var(--text-disabled)]" style={base}>—</td>
        {pct}
      </>
    );
  }
  return (
    <>
      <td className="tabular-nums text-right" style={{ ...base, borderLeft: SEPARADOR }}>{num(c.volumen)}</td>
      <td className="tabular-nums text-right" style={{ ...base, color: c.profit < 0 ? "var(--bad)" : undefined }}>
        {fmtImporte(c.profit)}
      </td>
      {pct}
    </>
  );
}

export default function TablaClienteMes({ matriz, metas }: { matriz: MatrizClienteMes; metas: IndiceMetas }) {
  const { meses, clientes, totalesPorMes, total } = matriz;

  if (clientes.length === 0) {
    return (
      <div className="rounded-xl border py-10 text-center text-[1.05rem] text-[var(--text-muted)]"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        Sin registros para los filtros seleccionados.
      </div>
    );
  }

  // Hay metas que mostrar si algún cliente de la tabla tiene meta en algún mes de la tabla.
  const hayMetas = clientes.some((c) => meses.some((k) => metas.has(claveMeta(c.cliente, k))));
  const colsPorGrupo = hayMetas ? 3 : 2;

  const fijaIzq: React.CSSProperties = { position: "sticky", left: 0, zIndex: 2 };
  const th2: React.CSSProperties = { top: H1, height: H1, textAlign: "right" };
  const estiloPie: React.CSSProperties = { background: "var(--bg-surface)", padding: "11px 14px", fontWeight: 700, whiteSpace: "nowrap" };

  return (
    <div className="table-wrap">
      <table className="pmo">
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...fijaIzq, zIndex: 4, height: H1 * 2, minWidth: 180 }}>Cliente</th>
            {meses.map((k) => (
              <th key={k} colSpan={colsPorGrupo}
                style={{ textAlign: "center", height: H1, borderLeft: SEPARADOR, fontStyle: k === SIN_FECHA ? "italic" : undefined }}>
                {etiquetaMes(k)}
              </th>
            ))}
            <th colSpan={colsPorGrupo} style={{ textAlign: "center", height: H1, borderLeft: SEPARADOR, color: "var(--accent-light)" }}>
              Total
            </th>
          </tr>
          <tr>
            {[...meses, "total"].map((k) => [
              <th key={`${k}-v`} style={{ ...th2, borderLeft: SEPARADOR }} title="Cantidad de files">Vol.</th>,
              <th key={`${k}-p`} style={th2} title="Suma de Profit">Profit</th>,
              hayMetas && (
                <th key={`${k}-m`} style={th2} title="Profit ÷ meta de Profit del mes (Vol × CM1). Verde = llegó al % a alcanzar">% Meta</th>
              ),
            ])}
          </tr>
        </thead>

        <tbody>
          {clientes.map((c) => {
            const totalCli = avanceTotalCliente(c, meses, metas);
            return (
              <tr key={c.cliente}>
                <td className="max-w-[260px] truncate font-medium text-[var(--text-primary)]" style={fijaIzq} title={c.cliente}>
                  {c.cliente}
                </td>
                {meses.map((k) => {
                  const a = avanceMesCliente(c, k, metas);
                  return (
                    <Celdas key={k} c={c.porMes[k]}
                      pct={hayMetas && <CeldaPct a={a} titulo={a ? detalle(a, metas.get(claveMeta(c.cliente, k))) : undefined} />} />
                  );
                })}
                <Celdas c={c.total} fuerte
                  pct={hayMetas && <CeldaPct a={totalCli} titulo={totalCli ? detalle(totalCli) : undefined} estilo={{ fontWeight: 700 }} />} />
              </tr>
            );
          })}
        </tbody>

        <tfoot>
          <tr style={{ borderTop: "2px solid var(--border)" }}>
            <td className="font-bold text-[var(--text-primary)]" style={{ ...fijaIzq, ...estiloPie }}>Total</td>
            {meses.map((k) => {
              const a = avanceTotalMes(matriz, k, metas);
              return (
                <FooterCeldas key={k} c={totalesPorMes[k]} estilo={estiloPie}
                  pct={hayMetas && <CeldaPct a={a} titulo={a ? detalle(a) : undefined} estilo={estiloPie} />} />
              );
            })}
            {(() => {
              const a = avanceTotalGeneral(matriz, metas);
              return (
                <FooterCeldas c={total} estilo={estiloPie}
                  pct={hayMetas && <CeldaPct a={a} titulo={a ? detalle(a) : undefined} estilo={estiloPie} />} />
              );
            })()}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Misma pareja de celdas que `Celdas`, con el padding y el fondo que `table.pmo`
 *  solo aplica al tbody. */
function FooterCeldas({ c, pct, estilo }: { c: Celda | undefined; pct?: React.ReactNode; estilo: React.CSSProperties }) {
  return (
    <>
      <td className="tabular-nums text-right" style={{ ...estilo, borderLeft: SEPARADOR }}>{c ? num(c.volumen) : "—"}</td>
      <td className="tabular-nums text-right" style={{ ...estilo, color: c && c.profit < 0 ? "var(--bad)" : undefined }}>
        {c ? fmtImporte(c.profit) : "—"}
      </td>
      {pct}
    </>
  );
}
