"use client";

// C7 — Tabla de detalle: ordenable por cualquier columna, paginada, con
// descarga en CSV de TODO lo filtrado (no solo la página visible).

import { useMemo, useState } from "react";
import { fmtHHMMSS } from "@/lib/horario";
import { exportarDetalleCSV, descargarCSV, type ClonacionRegistro } from "@/lib/clonaciones";

type Campo = "file" | "solicitud" | "creacion" | "usuario" | "cliente" | "segHabiles";
type Dir = "asc" | "desc";
const TAMANOS = [25, 50, 100, 250] as const;

function Th({ children, campo, actual, alternar, align = "left" }: {
  children: React.ReactNode; campo: Campo; actual: { campo: Campo; dir: Dir };
  alternar: (c: Campo) => void; align?: "left" | "center";
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

const fechaCorta = (d: Date | null) => d ? d.toLocaleString("es-GT", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function TablaDetalleClonacion({ regs }: { regs: ClonacionRegistro[] }) {
  const [orden, setOrden] = useState<{ campo: Campo; dir: Dir }>({ campo: "creacion", dir: "desc" });
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState<number>(25);

  const alternar = (c: Campo) => {
    setPagina(1);
    setOrden((o) => (o.campo === c ? { campo: c, dir: o.dir === "asc" ? "desc" : "asc" } : { campo: c, dir: "desc" }));
  };

  const ordenados = useMemo(() => {
    const num = (v: number | null) => (v == null ? -1 : v);
    const s = [...regs].sort((a, b) => {
      const v = orden.campo === "file" ? a.file.localeCompare(b.file, "es")
        : orden.campo === "usuario" ? a.usuario.localeCompare(b.usuario, "es")
        : orden.campo === "cliente" ? a.cliente.localeCompare(b.cliente, "es")
        : orden.campo === "solicitud" ? (a.solicitud?.getTime() ?? -1) - (b.solicitud?.getTime() ?? -1)
        : orden.campo === "creacion" ? a.creacion.getTime() - b.creacion.getTime()
        : num(a.segHabiles) - num(b.segHabiles);
      return orden.dir === "asc" ? v : -v;
    });
    return s;
  }, [regs, orden]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / tamano));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = ordenados.slice((paginaActual - 1) * tamano, paginaActual * tamano);

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
        <button
          onClick={() => descargarCSV(`clonacion-detalle-${new Date().toISOString().slice(0, 10)}.csv`, exportarDetalleCSV(ordenados))}
          className="rounded-lg border px-3.5 py-2 text-[0.78rem] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
          style={{ borderColor: "var(--accent)", color: "var(--accent-light)" }}>
          ↓ Exportar CSV
        </button>
        <span className="text-[0.72rem] text-[var(--text-muted)]">
          Exporta las {ordenados.length.toLocaleString("es-GT")} filas filtradas, no solo la página visible.
        </span>

        <label className="ml-auto flex items-center gap-1.5 text-[0.74rem] text-[var(--text-muted)]">
          Filas por página
          <select value={tamano} onChange={(e) => { setTamano(Number(e.target.value)); setPagina(1); }}
            className="rounded-lg border px-2 py-1 text-[0.78rem] outline-none"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>
            {TAMANOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      {ordenados.length === 0 ? (
        <div className="rounded-xl border py-10 text-center text-[0.82rem] text-[var(--text-muted)]"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          Sin registros para los filtros seleccionados.
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="pmo">
              <thead>
                <tr>
                  <Th campo="file" actual={orden} alternar={alternar}>c807_file</Th>
                  <Th campo="solicitud" actual={orden} alternar={alternar} align="center">Solicitud</Th>
                  <Th campo="creacion" actual={orden} alternar={alternar} align="center">Creación</Th>
                  <Th campo="usuario" actual={orden} alternar={alternar}>Usuario</Th>
                  <Th campo="cliente" actual={orden} alternar={alternar}>Cliente</Th>
                  <Th campo="segHabiles" actual={orden} alternar={alternar} align="center">Tiempo hábil</Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((r, i) => (
                  <tr key={`${r.file}-${i}`}>
                    <td className="ini-id">{r.file}</td>
                    <td className="tabular-nums text-center text-[var(--text-secondary)]">{fechaCorta(r.solicitud)}</td>
                    <td className="tabular-nums text-center text-[var(--text-secondary)]">{fechaCorta(r.creacion)}</td>
                    <td className="max-w-[180px] truncate text-[var(--text-secondary)]" title={r.usuario}>{r.usuario}</td>
                    <td className="max-w-[220px] truncate text-[var(--text-secondary)]" title={r.cliente}>{r.cliente}</td>
                    <td className="tabular-nums text-center font-semibold"
                      style={{ color: r.segHabiles == null ? "var(--text-disabled)" : r.anomalo ? "var(--bad)" : undefined }}
                      title={r.anomalo ? "Anómalo: Solicitud posterior a Creación" : undefined}>
                      {fmtHHMMSS(r.segHabiles)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[0.74rem] text-[var(--text-muted)]">
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
        </>
      )}
    </div>
  );
}
