"use client";

// C7 — Tabla de detalle: ordenable por cualquier columna, paginada, con
// descarga en CSV de TODO lo filtrado (no solo la página visible).

import { useMemo, useState } from "react";
import { fmtHHMMSS } from "@/lib/horario";
import { exportarDetalleCSV, descargarCSV, type ClonacionRegistro } from "@/lib/clonaciones";

type Campo = "file" | "origen" | "inicio" | "creacion" | "usuario" | "cliente" | "mesa" | "proceso" | "comentario" | "segHabiles";
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

/** "dd/mm/yy hh:mm:ss" (24 h, con segundos). */
const fechaCorta = (d: Date | null) => {
  if (!d) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

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
        : orden.campo === "origen" ? a.origen.localeCompare(b.origen, "es")
        : orden.campo === "usuario" ? a.usuario.localeCompare(b.usuario, "es")
        : orden.campo === "cliente" ? a.cliente.localeCompare(b.cliente, "es")
        : orden.campo === "mesa" ? a.mesa.localeCompare(b.mesa, "es")
        : orden.campo === "proceso" ? a.proceso.localeCompare(b.proceso, "es")
        : orden.campo === "comentario" ? a.comentario.localeCompare(b.comentario, "es")
        : orden.campo === "inicio" ? (a.inicioMetrica?.getTime() ?? -1) - (b.inicioMetrica?.getTime() ?? -1)
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
          className="rounded-lg border px-3.5 py-2 text-[1rem] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
          style={{ borderColor: "var(--accent)", color: "var(--accent-light)" }}>
          ↓ Exportar CSV
        </button>
        <span className="text-[0.92rem] text-[var(--text-muted)]">
          Exporta las {ordenados.length.toLocaleString("es-GT")} filas filtradas, no solo la página visible.
        </span>

        <label className="ml-auto flex items-center gap-1.5 text-[0.95rem] text-[var(--text-muted)]">
          Filas por página
          <select value={tamano} onChange={(e) => { setTamano(Number(e.target.value)); setPagina(1); }}
            className="rounded-lg border px-2 py-1 text-[1rem] outline-none"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}>
            {TAMANOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      {ordenados.length === 0 ? (
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
                  <Th campo="file" actual={orden} alternar={alternar}>c807_file</Th>
                  <Th campo="origen" actual={orden} alternar={alternar}>Origen</Th>
                  <Th campo="inicio" actual={orden} alternar={alternar} align="center">Inicio</Th>
                  <Th campo="creacion" actual={orden} alternar={alternar} align="center">Creación</Th>
                  <Th campo="usuario" actual={orden} alternar={alternar}>Usuario</Th>
                  <Th campo="cliente" actual={orden} alternar={alternar}>Cliente</Th>
                  <Th campo="mesa" actual={orden} alternar={alternar}>Mesa</Th>
                  <Th campo="proceso" actual={orden} alternar={alternar}>Proceso</Th>
                  <Th campo="comentario" actual={orden} alternar={alternar}>Comentario</Th>
                  <Th campo="segHabiles" actual={orden} alternar={alternar} align="center">Tiempo hábil</Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((r, i) => (
                  <tr key={`${r.file}-${i}`}>
                    <td className="ini-id">{r.file}</td>
                    <td className="whitespace-nowrap text-[1.02rem]">
                      {r.origen === "Padre" ? (
                        <span className="text-[var(--text-muted)]">Padre</span>
                      ) : (
                        <span className="ini-id"
                          style={{ color: r.origen.endsWith("sv") ? "var(--warn)" : undefined }}
                          title={r.origen.endsWith("sv")
                            ? "El file padre no aparece en la columna c807_file"
                            : "File padre verificado en c807_file"}>
                          {r.origen}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap tabular-nums text-center text-[var(--text-secondary)]"
                      title={
                        r.inicioMetrica && r.origenTipo === "v" &&
                        (!r.solicitud || r.inicioMetrica.getTime() !== r.solicitud.getTime())
                          ? `Creación del file padre (${r.origen}) — usada como inicio del cálculo`
                          : r.inicioMetrica ? "Solicitud_fecha" : "Sin fecha de inicio"
                      }>
                      {fechaCorta(r.inicioMetrica)}
                    </td>
                    <td className="whitespace-nowrap tabular-nums text-center text-[var(--text-secondary)]">{fechaCorta(r.creacion)}</td>
                    <td className="max-w-[180px] truncate text-[var(--text-secondary)]" title={r.usuario}>{r.usuario}</td>
                    <td className="max-w-[220px] truncate text-[var(--text-secondary)]" title={r.cliente}>{r.cliente}</td>
                    <td className="max-w-[140px] truncate text-[var(--text-secondary)]" title={r.mesa}>{r.mesa}</td>
                    <td className="max-w-[160px] truncate text-[var(--text-secondary)]" title={r.proceso}>{r.proceso}</td>
                    <td className="align-top text-[1rem] leading-snug text-[var(--text-secondary)]" title={r.comentario}>
                      <span className="block max-w-[280px]"
                        style={{ whiteSpace: "pre-line", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {r.comentario || "—"}
                      </span>
                    </td>
                    <td className="tabular-nums text-center font-semibold"
                      style={{ color: r.segHabiles == null ? "var(--text-disabled)" : r.anomalo ? "var(--bad)" : undefined }}
                      title={
                        r.anomalo
                          ? "Anómalo: la fecha de inicio es posterior a la de Creación"
                          : r.segHabiles == null
                            ? "Sin fecha de inicio — no medible"
                            : r.origenTipo === "v" && r.inicioMetrica
                              ? `Desde la creación del file padre (${fechaCorta(r.inicioMetrica)}) hasta la creación de este`
                              : `Desde la Solicitud (${fechaCorta(r.inicioMetrica)}) hasta la Creación`
                      }>
                      {fmtHHMMSS(r.segHabiles)}
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
        </>
      )}
    </div>
  );
}
