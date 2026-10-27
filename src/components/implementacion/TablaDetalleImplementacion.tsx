"use client";

// Detalle de Implementación: una fila por registro de la hoja. Ordenable por
// cualquier columna y paginada. Recibe las filas ya filtradas por mes.
//
// Semáforo: cuando hay metas, el CM1 de la meta de cada cliente EN EL MES DE CIERRE
// del file es lo que ese file debe dejar de Profit. Verde = el file lo alcanza, rojo =
// se queda corto, «—» = no hay meta para su cliente en ese mes. Arriba de la tabla va
// un resumen (# cumplen, # no cumplen) y un filtro. El resumen cuenta todas las filas
// que recibe; el filtro solo recorta la tabla.

import { useMemo, useState } from "react";
import {
  SIN_FECHA, claveMes, etiquetaMes, evaluarFile, fmtFechaCorta, fmtImporte, pasaFiltroSemaforo, resumenSemaforo,
  type EvaluacionFile, type FiltroSemaforo, type IndiceMetas,
} from "@/lib/implementaciones";
import type { ImplementacionRow } from "@/types";

type Campo = "File" | "Fecha_cierre" | "Cliente" | "Usuario" | "ingresos_facturados" | "egresos_liquidados" | "Profit" | "Semaforo";
type Dir = "asc" | "desc";
const TAMANOS = [25, 50, 100, 250] as const;

const FILTROS: [FiltroSemaforo, string][] = [["todos", "Todos"], ["cumplen", "Cumplen"], ["no-cumplen", "No cumplen"]];

/** Al ordenar por semáforo, de mayor a menor salen primero los rojos. */
const RANGO_SEMAFORO = { "no-cumple": 2, "cumple": 1, "sin-meta": 0 } as const;

interface Fila { r: ImplementacionRow; e: EvaluacionFile }

function Th({ children, campo, actual, alternar, align = "left", title }: {
  children: React.ReactNode; campo: Campo; actual: { campo: Campo; dir: Dir };
  alternar: (c: Campo) => void; align?: "left" | "right" | "center"; title?: string;
}) {
  const activo = actual.campo === campo;
  return (
    <th onClick={() => alternar(campo)} className="cursor-pointer select-none" title={title}
      style={{ textAlign: align, color: activo ? "var(--accent-light)" : undefined }}>
      {children}
      {activo && <span className="ml-1">{actual.dir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

function Punto({ color }: { color: string }) {
  return <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />;
}

/** Explicación de un semáforo, para el tooltip y el lector de pantalla. */
function explicar(r: ImplementacionRow, e: EvaluacionFile): string {
  if (e.estado === "cumple") return `Cumple: Profit ${fmtImporte(r.Profit)} ≥ CM1 ${fmtImporte(e.cm1)} por file`;
  if (e.estado === "no-cumple") return `No cumple: Profit ${fmtImporte(r.Profit)} < CM1 ${fmtImporte(e.cm1)} por file`;
  if (r.Profit == null) return "Sin Profit en la hoja";
  const mes = claveMes(r.Fecha_cierre);
  return mes === SIN_FECHA ? "Sin fecha de cierre: no hay meta del mes que aplicarle" : `Sin meta de CM1 para este cliente en ${etiquetaMes(mes)}`;
}

export default function TablaDetalleImplementacion({ rows, metas }: { rows: ImplementacionRow[]; metas: IndiceMetas }) {
  const [orden, setOrden] = useState<{ campo: Campo; dir: Dir }>({ campo: "Fecha_cierre", dir: "desc" });
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState<number>(25);
  const [filtro, setFiltro] = useState<FiltroSemaforo>("todos");

  const filas = useMemo<Fila[]>(() => rows.map((r) => ({ r, e: evaluarFile(r, metas) })), [rows, metas]);
  const resumen = useMemo(() => resumenSemaforo(filas.map((f) => f.e.estado)), [filas]);
  // Sin ninguna meta aplicable no hay nada que juzgar: ni columna, ni resumen, ni filtro.
  const hayMetas = filas.some((f) => f.e.cm1 != null);
  const filtroActivo: FiltroSemaforo = hayMetas ? filtro : "todos";

  const alternar = (c: Campo) => {
    setPagina(1);
    setOrden((o) => (o.campo === c ? { campo: c, dir: o.dir === "asc" ? "desc" : "asc" } : { campo: c, dir: "desc" }));
  };
  const elegirFiltro = (f: FiltroSemaforo) => { setFiltro(f); setPagina(1); };

  const ordenadas = useMemo(() => {
    const num = (v: number | null) => (v == null ? -Infinity : v);
    return filas
      .filter((f) => pasaFiltroSemaforo(f.e.estado, filtroActivo))
      .sort((a, b) => {
        const c = orden.campo;
        let v: number;
        if (c === "ingresos_facturados" || c === "egresos_liquidados" || c === "Profit") {
          const x = num(a.r[c]), y = num(b.r[c]);
          v = x === y ? 0 : x < y ? -1 : 1;
        } else if (c === "Semaforo") {
          v = RANGO_SEMAFORO[a.e.estado] - RANGO_SEMAFORO[b.e.estado];
        } else {
          v = a.r[c].localeCompare(b.r[c], "es");
        }
        return orden.dir === "asc" ? v : -v;
      });
  }, [filas, filtroActivo, orden]);

  const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / tamano));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = ordenadas.slice((paginaActual - 1) * tamano, paginaActual * tamano);

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-x-5 gap-y-2.5">
        {hayMetas && (
          <>
            <div role="group" aria-label="Filtrar por cumplimiento del CM1" className="inline-flex rounded-lg border p-0.5"
              style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}>
              {FILTROS.map(([v, label]) => (
                <button key={v} type="button" onClick={() => elegirFiltro(v)} aria-pressed={filtroActivo === v}
                  className="rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors"
                  style={filtroActivo === v ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.95rem] text-[var(--text-secondary)]"
              title="Un file cumple si su Profit es igual o mayor al CM1 de la meta de su cliente en el mes de cierre del file">
              <span className="flex items-center gap-1.5">
                <Punto color="var(--ok)" />
                <strong className="tabular-nums text-[var(--text-primary)]">{resumen.cumplen.toLocaleString("es-GT")}</strong> cumplen
              </span>
              <span className="flex items-center gap-1.5">
                <Punto color="var(--bad)" />
                <strong className="tabular-nums text-[var(--text-primary)]">{resumen.noCumplen.toLocaleString("es-GT")}</strong> no cumplen
              </span>
              {resumen.sinMeta > 0 && (
                <span className="text-[var(--text-muted)]">{resumen.sinMeta.toLocaleString("es-GT")} sin meta</span>
              )}
            </div>
          </>
        )}

        <label className="ml-auto flex items-center gap-1.5 text-[0.95rem] text-[var(--text-muted)]">
          Filas por página
          <select value={tamano} onChange={(e) => { setTamano(Number(e.target.value)); setPagina(1); }}
            className="rounded-lg border px-2 py-1 text-[1rem] outline-none"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>
            {TAMANOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      {ordenadas.length === 0 ? (
        <div className="rounded-xl border py-10 text-center text-[1.05rem] text-[var(--text-muted)]"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          Sin registros para los filtros seleccionados.
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="pmo">
              <thead>
                <tr>
                  <Th campo="File" actual={orden} alternar={alternar}>File</Th>
                  <Th campo="Fecha_cierre" actual={orden} alternar={alternar} align="center">Fecha de cierre</Th>
                  <Th campo="Cliente" actual={orden} alternar={alternar}>Cliente</Th>
                  <Th campo="Usuario" actual={orden} alternar={alternar}>Usuario</Th>
                  <Th campo="ingresos_facturados" actual={orden} alternar={alternar} align="right">Ingresos facturados</Th>
                  <Th campo="egresos_liquidados" actual={orden} alternar={alternar} align="right">Egresos liquidados</Th>
                  <Th campo="Profit" actual={orden} alternar={alternar} align="right">Profit</Th>
                  {hayMetas && (
                    <Th campo="Semaforo" actual={orden} alternar={alternar} align="center"
                      title="Profit del file contra el CM1 de la meta de su cliente en el mes de cierre">
                      Meta CM1
                    </Th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visibles.map(({ r, e }, i) => (
                  <tr key={`${r.File}-${i}`}>
                    <td className="ini-id">{r.File}</td>
                    <td className="whitespace-nowrap tabular-nums text-center text-[var(--text-secondary)]">{fmtFechaCorta(r.Fecha_cierre)}</td>
                    <td className="max-w-[240px] truncate text-[var(--text-secondary)]" title={r.Cliente}>{r.Cliente}</td>
                    <td className="max-w-[180px] truncate text-[var(--text-secondary)]" title={r.Usuario}>{r.Usuario}</td>
                    <td className="whitespace-nowrap tabular-nums text-right">{fmtImporte(r.ingresos_facturados)}</td>
                    <td className="whitespace-nowrap tabular-nums text-right">{fmtImporte(r.egresos_liquidados)}</td>
                    <td className="whitespace-nowrap tabular-nums text-right font-semibold"
                      style={{ color: r.Profit != null && r.Profit < 0 ? "var(--bad)" : undefined }}>
                      {fmtImporte(r.Profit)}
                    </td>
                    {hayMetas && (
                      <td className="text-center" title={explicar(r, e)}>
                        {e.estado === "sin-meta" ? (
                          <span className="text-[var(--text-disabled)]">—</span>
                        ) : (
                          <span role="img" aria-label={explicar(r, e)} className="inline-block h-3.5 w-3.5 rounded-full align-middle"
                            style={{ background: e.estado === "cumple" ? "var(--ok)" : "var(--bad)" }} />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[0.95rem] text-[var(--text-muted)]">
            <span>
              {(paginaActual - 1) * tamano + 1}–{Math.min(paginaActual * tamano, ordenadas.length)} de {ordenadas.length.toLocaleString("es-GT")}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={paginaActual === 1}
                className="rounded-lg border px-2.5 py-1 font-semibold transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
                style={{ borderColor: "var(--border)" }}>← Anterior</button>
              <span>Página {paginaActual} de {totalPaginas}</span>
              <button onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas}
                className="rounded-lg border px-2.5 py-1 font-semibold transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
                style={{ borderColor: "var(--border)" }}>Siguiente →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
