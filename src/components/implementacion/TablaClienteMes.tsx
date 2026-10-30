"use client";

// Implementación agrupada por Cliente: una fila por cliente y, por cada mes de
// facturación, Vol (cantidad de files) y Profit (suma). Cuando hay metas capturadas:
//  · Justo después del cliente van las columnas de la META (Vol, CM1 por file y Total =
//    Vol × CM1). Es la misma para todos los meses, así que sale una sola vez, con un
//    estilo propio (ver estiloMeta.ts) para distinguirla de lo que viene de la hoja.
//  · Vol y Profit de cada mes muestran lo que se lleva contra esa meta, con su % a la par:
//    Vol como «59/70 · 84 %» (files del mes ÷ Vol) y Profit con su % de cumplimiento (Profit ÷
//    Total de la meta). El color es un semáforo del cumplimiento del % a alcanzar de ese mes (que
//    se muestra en el encabezado del mes): rojo < 80 %, amarillo 80–89 %, verde ≥ 90 %. Sin
//    meta para el cliente, solo el conteo de files y el importe.
// Un GRUPO de clientes (ver GRUPOS_CLIENTES) es una sola fila, con su cumplimiento; el ▶ de
// su nombre la expande para ver a cada cliente del grupo con su Vol y Profit por mes.
// El grupo Total (por cliente, columna) solo trae Vol y Profit. Cierra con el total por
// mes (fila). Las columnas son los meses presentes en las filas que recibe, así que al
// filtrar por mes solo quedan esos. La primera columna y los encabezados se quedan fijos
// al hacer scroll.

import { Fragment, useState } from "react";
import {
  SIN_FECHA, UMBRAL_AMARILLO, UMBRAL_VERDE, avanceMesCliente, avanceTotalMes, avanceVolMesCliente, avanceVolTotalMes, etiquetaMes, fmtImporte,
  fmtPct, metaProfitMensual, objetivoDe, type Avance, type AvanceVol, type Celda, type IndiceMetas, type MatrizClienteMes, type Nivel,
} from "@/lib/implementaciones";
import { META_BORDE, META_FONDO, META_FONDO_ENCABEZADO, META_TEXTO } from "@/components/implementacion/estiloMeta";
import type { MetaCliente } from "@/types";

/** Alto de la 1ª fila del encabezado: la 2ª se pega justo debajo al hacer scroll. */
const H1 = 38;
const SEPARADOR = "1px solid var(--border)";

const num = (n: number) => n.toLocaleString("es-GT");
/** Files con a lo más un decimal: lo requerido (Vol × %) puede no ser entero. */
const numDec = (n: number) => n.toLocaleString("es-GT", { maximumFractionDigits: 1 });
/** 90 → «90», 92.5 → «92.5». */
const pctTxt = (n: number) => String(Math.round(n * 100) / 100);

/** Texto del tooltip del Profit: de dónde sale la meta y cuánto hace falta para cumplirla. */
function detalle(a: Avance, meta?: MetaCliente): string {
  const base = `Profit ${fmtImporte(a.profit)} de un cumplimiento de ${fmtImporte(a.meta)}`;
  const origen = meta
    ? ` (Vol ${num(meta.vol)} × CM1 ${fmtImporte(meta.cm1)})`
    : a.n > 1 ? ` (suma de ${a.n} cumplimientos; solo lo que tiene cumplimiento)` : "";
  const objetivo = `A alcanzar: ${fmtPct(a.requerido / a.meta)} del cumplimiento = ${fmtImporte(a.requerido)}`;
  const cumplimiento = `Llevas ${fmtPct(a.cumplimiento)} de lo requerido → ${a.nivel}`;
  return `${base}${origen}\n${objetivo}\n${cumplimiento}`;
}

/** Texto del tooltip del Vol: cuántos files van, contra cuántos, y cuánto hace falta. */
function detalleVol(a: AvanceVol, meta?: MetaCliente): string {
  const origen = meta ? "" : a.n > 1 ? ` (suma de ${a.n} cumplimientos; solo lo que tiene cumplimiento)` : "";
  const base = `${num(a.hecho)} files de un Vol de ${num(a.vol)}${origen} → ${fmtPct(a.pct)}`;
  const objetivo = `A alcanzar: ${fmtPct(a.requerido / a.vol)} del Vol = ${numDec(a.requerido)} files`;
  const cumplimiento = `Llevas ${fmtPct(a.cumplimiento)} de lo requerido → ${a.nivel}`;
  return `${base}\n${objetivo}\n${cumplimiento}`;
}

const COLOR_NIVEL: Record<Nivel, string> = { rojo: "var(--bad)", amarillo: "var(--warn)", verde: "var(--ok)" };

/** Vol de un mes. Con cumplimiento: «59/70» y su % a la par, con el semáforo. Sin él: el conteo de files
 *  (o «—» si no hubo ninguno). */
function CeldaVol({ c, a, titulo, estilo }: { c: Celda | undefined; a: AvanceVol | null; titulo?: string; estilo?: React.CSSProperties }) {
  const base: React.CSSProperties = { ...estilo, borderLeft: SEPARADOR, whiteSpace: "nowrap" };
  if (a) {
    return (
      <td className="tabular-nums text-right font-semibold" title={titulo} style={{ ...base, color: COLOR_NIVEL[a.nivel] }}>
        {num(a.hecho)}/{num(a.vol)}
        <span className="ml-1.5 text-[0.76rem] font-medium">{fmtPct(a.pct)}</span>
      </td>
    );
  }
  if (!c) return <td className="tabular-nums text-right text-[var(--text-disabled)]" style={base}>—</td>;
  return <td className="tabular-nums text-right" style={base}>{num(c.volumen)}</td>;
}

/** Profit de un mes: el importe y, si el cliente tiene cumplimiento, su % a la par con el semáforo. */
function CeldaProfit({ c, a, titulo, estilo }: { c: Celda | undefined; a: Avance | null; titulo?: string; estilo?: React.CSSProperties }) {
  const color = !c ? "var(--text-disabled)" : c.profit < 0 ? "var(--bad)" : estilo?.color;
  return (
    <td className="tabular-nums text-right" title={a ? titulo : undefined} style={{ ...estilo, whiteSpace: "nowrap", color }}>
      {c ? fmtImporte(c.profit) : "—"}
      {a && <span className="ml-1.5 text-[0.76rem] font-semibold" style={{ color: COLOR_NIVEL[a.nivel] }}>{fmtPct(a.pct)}</span>}
    </td>
  );
}

/** Las dos celdas de un mes (Vol y Profit). Sin filas ese mes: «—» en gris. `vol` y `profit` son el avance contra
 *  la meta; null (o sin meta) deja solo el conteo y el importe. */
function CeldasMes({ c, vol, volTitulo, profit, profitTitulo, estilo }: {
  c: Celda | undefined; vol?: AvanceVol | null; volTitulo?: string; profit?: Avance | null; profitTitulo?: string; estilo?: React.CSSProperties;
}) {
  return (
    <>
      <CeldaVol c={c} a={vol ?? null} titulo={volTitulo} estilo={estilo} />
      <CeldaProfit c={c} a={profit ?? null} titulo={profitTitulo} estilo={estilo} />
    </>
  );
}

/** Las tres celdas de la meta (Vol, CM1 por file, Total). Un valor null se muestra «—». */
function CeldasMeta({ vol, cm1, total, estilo }: {
  vol: number | null; cm1: number | null; total: number | null; estilo?: React.CSSProperties;
}) {
  const base: React.CSSProperties = { ...estilo, background: META_FONDO, whiteSpace: "nowrap" };
  const celda = (txt: string | null, extra: React.CSSProperties) => (
    <td className="tabular-nums text-right" style={{ ...base, ...extra, color: txt == null ? "var(--text-disabled)" : extra.color }}>
      {txt ?? "—"}
    </td>
  );
  return (
    <>
      {celda(vol == null ? null : num(vol), { borderLeft: META_BORDE })}
      {celda(cm1 == null ? null : fmtImporte(cm1), {})}
      {celda(total == null ? null : fmtImporte(total), { borderRight: META_BORDE, fontWeight: 700, color: META_TEXTO })}
    </>
  );
}

export default function TablaClienteMes({ matriz, metas }: { matriz: MatrizClienteMes; metas: IndiceMetas }) {
  const { meses, clientes, totalesPorMes, total } = matriz;
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const alternarGrupo = (nombre: string) => setAbiertos((s) => {
    const n = new Set(s);
    if (n.has(nombre)) n.delete(nombre); else n.add(nombre);
    return n;
  });

  if (clientes.length === 0) {
    return (
      <div className="rounded-xl border py-10 text-center text-[1.05rem] text-[var(--text-muted)]"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        Sin registros para los filtros seleccionados.
      </div>
    );
  }

  // Hay metas que mostrar si algún cliente de la tabla tiene meta.
  const conMeta = clientes.filter((c) => metas.clientes.has(c.cliente));
  const hayMetas = conMeta.length > 0;

  const fijaIzq: React.CSSProperties = { position: "sticky", left: 0, zIndex: 2 };
  const th2: React.CSSProperties = { top: H1, height: H1, textAlign: "right" };
  const th2Meta = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    ...th2, background: META_FONDO_ENCABEZADO, color: META_TEXTO, whiteSpace: "nowrap", ...extra,
  });
  const estiloPie: React.CSSProperties = { background: "var(--bg-surface)", padding: "11px 14px", fontWeight: 700, whiteSpace: "nowrap" };
  const semaforo = `rojo menos de ${UMBRAL_AMARILLO}%, amarillo ${UMBRAL_AMARILLO}% a ${UMBRAL_VERDE - 1}%, verde ${UMBRAL_VERDE}% o más`;

  return (
    <div className="table-wrap">
      <table className="pmo">
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...fijaIzq, zIndex: 4, height: H1 * 2, minWidth: 180 }}>Cliente</th>
            {hayMetas && (
              <th colSpan={3} title="El mismo cumplimiento para todos los meses: Vol × CM1 por file = Total"
                style={{ textAlign: "center", height: H1, background: META_FONDO_ENCABEZADO, color: META_TEXTO, borderLeft: META_BORDE, borderRight: META_BORDE }}>
                Cumplimiento mensual
              </th>
            )}
            {meses.map((k) => (
              <th key={k} colSpan={2}
                title={hayMetas && k !== SIN_FECHA ? `En ${etiquetaMes(k)} hay que alcanzar el ${pctTxt(objetivoDe(metas, k))}% del cumplimiento (Vol y Profit)` : undefined}
                style={{ textAlign: "center", height: H1, borderLeft: SEPARADOR, fontStyle: k === SIN_FECHA ? "italic" : undefined }}>
                {etiquetaMes(k)}
                {hayMetas && k !== SIN_FECHA && (
                  <span className="ml-1.5 text-[0.72rem] font-normal text-[var(--text-muted)]">≥ {pctTxt(objetivoDe(metas, k))}%</span>
                )}
              </th>
            ))}
            <th colSpan={2} style={{ textAlign: "center", height: H1, borderLeft: SEPARADOR, color: "var(--accent-light)" }}>
              Total
            </th>
          </tr>
          <tr>
            {hayMetas && (
              <>
                <th style={th2Meta({ borderLeft: META_BORDE })} title="Cantidad de files que se espera por mes">Vol</th>
                <th style={th2Meta()} title="Profit que debe dejar cada file (dólares)">CM1 por file</th>
                <th style={th2Meta({ borderRight: META_BORDE })} title="Cumplimiento de Profit del mes: Vol × CM1 por file">Total</th>
              </>
            )}
            {meses.map((k) => [
              <th key={`${k}-v`} style={{ ...th2, borderLeft: SEPARADOR }}
                title={hayMetas && k !== SIN_FECHA
                  ? `Files del mes contra el Vol del cumplimiento, con su %. Color según cuánto de lo requerido en el mes se logró: ${semaforo}`
                  : "Cantidad de files"}>
                Vol
              </th>,
              <th key={`${k}-p`} style={th2}
                title={hayMetas && k !== SIN_FECHA
                  ? `Suma de Profit y su % del Total del cumplimiento. Color según cuánto de lo requerido en el mes se logró: ${semaforo}`
                  : "Suma de Profit"}>
                Profit
              </th>,
            ])}
            <th style={{ ...th2, borderLeft: SEPARADOR }} title="Cantidad de files">Vol.</th>
            <th style={th2} title="Suma de Profit">Profit</th>
          </tr>
        </thead>

        <tbody>
          {clientes.map((c) => {
            const meta = metas.clientes.get(c.cliente);
            const miembros = c.miembros;
            const abierto = !!miembros && abiertos.has(c.cliente);
            return (
              <Fragment key={c.cliente}>
                <tr>
                  <td className="max-w-[260px] overflow-hidden whitespace-nowrap font-medium text-[var(--text-primary)]" style={fijaIzq}
                    title={miembros ? `${c.cliente}: ${miembros.map((m) => m.cliente).join(" · ")}` : c.cliente}>
                    {miembros ? (
                      <button type="button" onClick={() => alternarGrupo(c.cliente)} aria-expanded={abierto}
                        aria-label={`${abierto ? "Contraer" : "Expandir"} ${c.cliente}`}
                        className="flex w-full items-center gap-2 text-left font-medium">
                        <span aria-hidden className="inline-block shrink-0 text-[0.6rem] text-[var(--accent)]"
                          style={{ transition: "transform 0.15s", transform: abierto ? "rotate(90deg)" : undefined }}>▶</span>
                        <span className="min-w-0 truncate">{c.cliente}</span>
                        <span className="shrink-0 text-[0.72rem] font-normal text-[var(--text-muted)]">{miembros.length} {miembros.length === 1 ? "cliente" : "clientes"}</span>
                      </button>
                    ) : (
                      <span className="block truncate">{c.cliente}</span>
                    )}
                  </td>
                  {hayMetas && (
                    <CeldasMeta vol={meta?.vol ?? null} cm1={meta?.cm1 ?? null} total={meta ? metaProfitMensual(meta) : null} />
                  )}
                  {meses.map((k) => {
                    const vol = avanceVolMesCliente(c, k, metas);
                    const profit = avanceMesCliente(c, k, metas);
                    return (
                      <CeldasMes key={k} c={c.porMes[k]}
                        vol={vol} volTitulo={vol ? detalleVol(vol, meta) : undefined}
                        profit={profit} profitTitulo={profit ? detalle(profit, meta) : undefined} />
                    );
                  })}
                  <CeldasMes c={c.total} estilo={{ fontWeight: 700 }} />
                </tr>

                {/* Los clientes del grupo: solo Vol y Profit (el cumplimiento es del grupo). */}
                {abierto && miembros.map((m) => (
                  <tr key={`${c.cliente}|${m.cliente}`}>
                    <td className="max-w-[260px] truncate text-[var(--text-secondary)]" style={{ ...fijaIzq, paddingLeft: 36 }} title={m.cliente}>
                      {m.cliente}
                    </td>
                    {hayMetas && <CeldasMeta vol={null} cm1={null} total={null} />}
                    {meses.map((k) => <CeldasMes key={k} c={m.porMes[k]} />)}
                    <CeldasMes c={m.total} />
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>

        <tfoot>
          <tr style={{ borderTop: "2px solid var(--border)" }}>
            <td className="font-bold text-[var(--text-primary)]" style={{ ...fijaIzq, ...estiloPie }}>Total</td>
            {hayMetas && (
              <CeldasMeta
                estilo={{ padding: estiloPie.padding, fontWeight: 700 }}
                vol={conMeta.reduce((s, c) => s + (metas.clientes.get(c.cliente)?.vol ?? 0), 0)}
                cm1={null}
                total={conMeta.reduce((s, c) => s + metaProfitMensual(metas.clientes.get(c.cliente)!), 0)} />
            )}
            {meses.map((k) => {
              const vol = avanceVolTotalMes(matriz, k, metas);
              const profit = avanceTotalMes(matriz, k, metas);
              return (
                <CeldasMes key={k} c={totalesPorMes[k]} estilo={estiloPie}
                  vol={vol} volTitulo={vol ? detalleVol(vol) : undefined}
                  profit={profit} profitTitulo={profit ? detalle(profit) : undefined} />
              );
            })}
            <CeldasMes c={total} estilo={estiloPie} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
