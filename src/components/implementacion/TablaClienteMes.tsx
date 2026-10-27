"use client";

// Implementación agrupada por Cliente: una fila por cliente y, por cada mes de
// cierre, dos columnas — Volumen (cantidad de files) y Profit (suma). Cierra con
// el total por cliente (columna) y el total por mes (fila). Las columnas son los
// meses presentes en las filas que recibe, así que al filtrar por mes solo quedan
// esos. La primera columna y los encabezados se quedan fijos al hacer scroll.

import { SIN_FECHA, etiquetaMes, fmtImporte, type Celda, type MatrizClienteMes } from "@/lib/implementaciones";

/** Alto de la 1ª fila del encabezado: la 2ª se pega justo debajo al hacer scroll. */
const H1 = 38;
const SEPARADOR = "1px solid var(--border)";

const num = (n: number) => n.toLocaleString("es-GT");

/** Las dos celdas de un mes (Volumen, Profit). Sin filas ese mes: «—» en gris. */
function Celdas({ c, fuerte }: { c: Celda | undefined; fuerte?: boolean }) {
  const base: React.CSSProperties = { fontWeight: fuerte ? 700 : undefined, whiteSpace: "nowrap" };
  if (!c) {
    return (
      <>
        <td className="tabular-nums text-right text-[var(--text-disabled)]" style={{ ...base, borderLeft: SEPARADOR }}>—</td>
        <td className="tabular-nums text-right text-[var(--text-disabled)]" style={base}>—</td>
      </>
    );
  }
  return (
    <>
      <td className="tabular-nums text-right" style={{ ...base, borderLeft: SEPARADOR }}>{num(c.volumen)}</td>
      <td className="tabular-nums text-right" style={{ ...base, color: c.profit < 0 ? "var(--bad)" : undefined }}>
        {fmtImporte(c.profit)}
      </td>
    </>
  );
}

export default function TablaClienteMes({ matriz }: { matriz: MatrizClienteMes }) {
  const { meses, clientes, totalesPorMes, total } = matriz;

  if (clientes.length === 0) {
    return (
      <div className="rounded-xl border py-10 text-center text-[1.05rem] text-[var(--text-muted)]"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        Sin registros para los filtros seleccionados.
      </div>
    );
  }

  const fijaIzq: React.CSSProperties = { position: "sticky", left: 0, zIndex: 2 };
  const th2: React.CSSProperties = { top: H1, height: H1, textAlign: "right" };

  return (
    <div className="table-wrap">
      <table className="pmo">
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...fijaIzq, zIndex: 4, height: H1 * 2, minWidth: 180 }}>Cliente</th>
            {meses.map((k) => (
              <th key={k} colSpan={2}
                style={{ textAlign: "center", height: H1, borderLeft: SEPARADOR, fontStyle: k === SIN_FECHA ? "italic" : undefined }}>
                {etiquetaMes(k)}
              </th>
            ))}
            <th colSpan={2} style={{ textAlign: "center", height: H1, borderLeft: SEPARADOR, color: "var(--accent-light)" }}>
              Total
            </th>
          </tr>
          <tr>
            {[...meses, "total"].map((k) => [
              <th key={`${k}-v`} style={{ ...th2, borderLeft: SEPARADOR }} title="Cantidad de files">Vol.</th>,
              <th key={`${k}-p`} style={th2} title="Suma de Profit">Profit</th>,
            ])}
          </tr>
        </thead>

        <tbody>
          {clientes.map((c) => (
            <tr key={c.cliente}>
              <td className="max-w-[260px] truncate font-medium text-[var(--text-primary)]" style={fijaIzq} title={c.cliente}>
                {c.cliente}
              </td>
              {meses.map((k) => <Celdas key={k} c={c.porMes[k]} />)}
              <Celdas c={c.total} fuerte />
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr style={{ borderTop: "2px solid var(--border)" }}>
            <td className="font-bold text-[var(--text-primary)]"
              style={{ ...fijaIzq, background: "var(--bg-surface)", padding: "11px 14px" }}>
              Total
            </td>
            {meses.map((k) => <FooterCeldas key={k} c={totalesPorMes[k]} />)}
            <FooterCeldas c={total} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Misma pareja de celdas que `Celdas`, con el padding y el fondo que `table.pmo`
 *  solo aplica al tbody. */
function FooterCeldas({ c }: { c: Celda | undefined }) {
  const estilo: React.CSSProperties = { background: "var(--bg-surface)", padding: "11px 14px", fontWeight: 700, whiteSpace: "nowrap" };
  return (
    <>
      <td className="tabular-nums text-right" style={{ ...estilo, borderLeft: SEPARADOR }}>{c ? num(c.volumen) : "—"}</td>
      <td className="tabular-nums text-right" style={{ ...estilo, color: c && c.profit < 0 ? "var(--bad)" : undefined }}>
        {c ? fmtImporte(c.profit) : "—"}
      </td>
    </>
  );
}
