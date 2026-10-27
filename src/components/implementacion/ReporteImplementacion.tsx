"use client";

// Reporte de Implementación (archivo "Clonacion files" → pestaña
// "implementacion"). Se monta como pestaña dentro de la página ROI, hermana de
// 003 y de Clonación pero con su propio dominio (lib/implementacion.ts) — no
// comparte código con ellas a propósito.
//
// Primera versión: totales + tabla ordenable y paginada. Los filtros y las
// gráficas se agregan encima de este mismo arreglo de filas.

import { useMemo, useState } from "react";
import { SectionHeader } from "@/components/ui";
import { totalesImplementacion } from "@/lib/implementacion";
import type { ImplementacionRow } from "@/types";

type Campo = "File" | "Fecha_cierre" | "Cliente" | "Usuario" | "ingresos_facturados" | "egresos_liquidados" | "Profit";
type Dir = "asc" | "desc";
const TAMANOS = [25, 50, 100, 250] as const;

const importe = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "yyyy-MM-ddTHH:mm:ss" → "dd/mm/yyyy" (o con hora si la trae). Se parte el texto
 *  a mano: pasar por Date movería la hora según la zona del navegador. */
function fechaCorta(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return "—";
  const dia = `${m[3]}/${m[2]}/${m[1]}`;
  return m[4] === "00" && m[5] === "00" ? dia : `${dia} ${m[4]}:${m[5]}`;
}

function Th({ children, campo, actual, alternar, align = "left" }: {
  children: React.ReactNode; campo: Campo; actual: { campo: Campo; dir: Dir };
  alternar: (c: Campo) => void; align?: "left" | "right" | "center";
}) {
  const activo = actual.campo === campo;
  return (
    <th onClick={() => alternar(campo)} className="cursor-pointer select-none"
      style={{ textAlign: align, color: activo ? "var(--accent-light)" : undefined }}>
      {children}
      {activo && <span className="ml-1">{actual.dir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

function KpiCard({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div className="flex flex-col rounded-xl border p-[18px] text-center"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="text-[0.85rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 tabular-nums text-[1.9rem] font-extrabold leading-none"
        style={{ color: color ?? "var(--card-value-total)" }}>
        {valor}
      </div>
    </div>
  );
}

export default function ReporteImplementacion({ rows }: { rows: ImplementacionRow[] }) {
  const [orden, setOrden] = useState<{ campo: Campo; dir: Dir }>({ campo: "Fecha_cierre", dir: "desc" });
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState<number>(25);

  const totales = useMemo(() => totalesImplementacion(rows), [rows]);

  const alternar = (c: Campo) => {
    setPagina(1);
    setOrden((o) => (o.campo === c ? { campo: c, dir: o.dir === "asc" ? "desc" : "asc" } : { campo: c, dir: "desc" }));
  };

  const ordenados = useMemo(() => {
    const num = (v: number | null) => (v == null ? -Infinity : v);
    return [...rows].sort((a, b) => {
      const c = orden.campo;
      let v: number;
      if (c === "ingresos_facturados" || c === "egresos_liquidados" || c === "Profit") {
        const x = num(a[c]), y = num(b[c]);
        v = x === y ? 0 : x < y ? -1 : 1;
      } else {
        v = a[c].localeCompare(b[c], "es");
      }
      return orden.dir === "asc" ? v : -v;
    });
  }, [rows, orden]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / tamano));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = ordenados.slice((paginaActual - 1) * tamano, paginaActual * tamano);

  return (
    <div>
      <SectionHeader title="Implementación" badge={`${rows.length.toLocaleString("es-GT")} registros`} />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Ingresos facturados" valor={importe(totales.ingresos)} />
        <KpiCard label="Egresos liquidados" valor={importe(totales.egresos)} />
        <KpiCard label="Profit" valor={importe(totales.profit)}
          color={totales.profit < 0 ? "var(--bad)" : "var(--ok)"} />
      </div>

      <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
        <label className="ml-auto flex items-center gap-1.5 text-[0.95rem] text-[var(--text-muted)]">
          Filas por página
          <select value={tamano} onChange={(e) => { setTamano(Number(e.target.value)); setPagina(1); }}
            className="rounded-lg border px-2 py-1 text-[1rem] outline-none"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>
            {TAMANOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

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
            </tr>
          </thead>
          <tbody>
            {visibles.map((r, i) => (
              <tr key={`${r.File}-${i}`}>
                <td className="ini-id">{r.File}</td>
                <td className="whitespace-nowrap tabular-nums text-center text-[var(--text-secondary)]">{fechaCorta(r.Fecha_cierre)}</td>
                <td className="max-w-[240px] truncate text-[var(--text-secondary)]" title={r.Cliente}>{r.Cliente}</td>
                <td className="max-w-[180px] truncate text-[var(--text-secondary)]" title={r.Usuario}>{r.Usuario}</td>
                <td className="whitespace-nowrap tabular-nums text-right">{importe(r.ingresos_facturados)}</td>
                <td className="whitespace-nowrap tabular-nums text-right">{importe(r.egresos_liquidados)}</td>
                <td className="whitespace-nowrap tabular-nums text-right font-semibold"
                  style={{ color: r.Profit != null && r.Profit < 0 ? "var(--bad)" : undefined }}>
                  {importe(r.Profit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[0.95rem] text-[var(--text-muted)]">
        <span>
          {(paginaActual - 1) * tamano + 1}–{Math.min(paginaActual * tamano, ordenados.length)} de {ordenados.length.toLocaleString("es-GT")}
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
    </div>
  );
}
