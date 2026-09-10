"use client";

// Tablas del reporte "Digitalización OCR": por cliente (con fila de totales) y
// por file (con buscador y límite de filas visibles — son más de mil). Ambas con
// export a CSV del conjunto filtrado, más un export de la serie por período.

import { useMemo, useState } from "react";
import { SectionHeader } from "@/components/ui";
import {
  exportClientesCSV, exportFilesCSV, exportSerieCSV,
  type FilaCliente, type FilaFile, type PuntoSerieOcr,
} from "@/lib/digitalizacion";
import { fmtMin, fmtDur, fmtFecha, fmtFechaHora, nEs } from "./fmt";

type Dir = "asc" | "desc";
const MAX_FILAS = 200;

function descargarCSV(nombre: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ExportBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="rounded-lg border px-3 py-1.5 text-[0.76rem] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
      style={{ borderColor: "var(--accent)", color: "var(--accent-light)" }}>
      ↓ {children}
    </button>
  );
}

function Th({ children, campo, orden, alternar, align = "center" }: {
  children: React.ReactNode; campo: string;
  orden: { campo: string; dir: Dir }; alternar: (c: string) => void; align?: "left" | "center";
}) {
  const activo = orden.campo === campo;
  return (
    <th onClick={() => alternar(campo)} className="cursor-pointer select-none"
      style={{ textAlign: align, color: activo ? "var(--accent-light)" : undefined }}>
      {children}{activo && <span className="ml-1">{orden.dir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

function useOrden(inicial: string) {
  const [campo, setCampo] = useState(inicial);
  const [dir, setDir] = useState<Dir>("desc");
  const alternar = (c: string) => {
    if (c === campo) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setCampo(c); setDir("desc"); }
  };
  return { campo, dir, alternar, orden: { campo, dir } };
}

const num = (v: number | null) => (v == null ? -1 : v);

// ── Por cliente ───────────────────────────────────────────────────────
function TablaCliente({ filas, serie }: { filas: FilaCliente[]; serie: PuntoSerieOcr[] }) {
  const { campo, dir, alternar, orden } = useOrden("files");
  const ordenadas = useMemo(() => {
    const val = (f: FilaCliente): number | string =>
      campo === "cliente" ? f.cliente
        : campo === "conT2" ? f.conT2
          : campo === "t1Prom" ? num(f.t1Prom)
            : campo === "t1Mediana" ? num(f.t1Mediana)
              : campo === "t2Prom" ? num(f.t2Prom)
                : campo === "t2Mediana" ? num(f.t2Mediana)
                  : campo === "totalProm" ? num(f.totalProm)
                    : f.files;
    return [...filas].sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === "string" ? va.localeCompare(vb as string, "es") : va - (vb as number);
      return dir === "asc" ? c : -c;
    });
  }, [filas, campo, dir]);

  const tot = useMemo(
    () => filas.reduce((t, f) => ({ files: t.files + f.files, conT2: t.conT2 + f.conT2 }), { files: 0, conT2: 0 }),
    [filas],
  );

  return (
    <section className="mt-7">
      <SectionHeader title="Por cliente" badge={`${nEs(filas.length)} clientes`} />
      <div className="mb-2.5 flex flex-wrap gap-2">
        <ExportBtn onClick={() => descargarCSV("ocr-por-cliente", exportClientesCSV(ordenadas))}>Exportar por cliente</ExportBtn>
        <ExportBtn onClick={() => descargarCSV("ocr-por-periodo", exportSerieCSV(serie))}>Exportar por período</ExportBtn>
      </div>
      <div className="table-wrap">
        <table className="pmo">
          <thead>
            <tr>
              <Th campo="cliente" orden={orden} alternar={alternar} align="left">Cliente</Th>
              <Th campo="files" orden={orden} alternar={alternar}>Files</Th>
              <Th campo="conT2" orden={orden} alternar={alternar}>c/ T2</Th>
              <Th campo="t1Prom" orden={orden} alternar={alternar}>T1 prom</Th>
              <Th campo="t1Mediana" orden={orden} alternar={alternar}>T1 mediana</Th>
              <Th campo="t2Prom" orden={orden} alternar={alternar}>T2 prom</Th>
              <Th campo="t2Mediana" orden={orden} alternar={alternar}>T2 mediana</Th>
              <Th campo="totalProm" orden={orden} alternar={alternar}>Total prom</Th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((f) => (
              <tr key={f.cliente}>
                <td className="max-w-[240px] truncate" title={f.cliente}>{f.cliente}</td>
                <td className="tabular-nums text-center">{nEs(f.files)}</td>
                <td className="tabular-nums text-center text-[var(--text-secondary)]">{nEs(f.conT2)}</td>
                <td className="tabular-nums text-center" style={{ color: f.t1Prom == null ? "var(--text-muted)" : "var(--etapa-1)" }}>{fmtMin(f.t1Prom)}</td>
                <td className="tabular-nums text-center" style={{ color: f.t1Mediana == null ? "var(--text-muted)" : "var(--etapa-1)" }}>{fmtMin(f.t1Mediana)}</td>
                <td className="tabular-nums text-center" style={{ color: f.t2Prom == null ? "var(--text-muted)" : "var(--etapa-3)" }}>{fmtMin(f.t2Prom)}</td>
                <td className="tabular-nums text-center" style={{ color: f.t2Mediana == null ? "var(--text-muted)" : "var(--etapa-3)" }}>{fmtMin(f.t2Mediana)}</td>
                <td className="tabular-nums text-center font-semibold" style={f.totalProm == null ? { color: "var(--text-muted)" } : undefined}>{fmtMin(f.totalProm)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
              <td>Total</td>
              <td className="tabular-nums text-center">{nEs(tot.files)}</td>
              <td className="tabular-nums text-center">{nEs(tot.conT2)}</td>
              <td className="text-center text-[var(--text-muted)]">—</td>
              <td className="text-center text-[var(--text-muted)]">—</td>
              <td className="text-center text-[var(--text-muted)]">—</td>
              <td className="text-center text-[var(--text-muted)]">—</td>
              <td className="text-center text-[var(--text-muted)]">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

// ── Por file ─────────────────────────────────────────────────────────
function TablaFile({ filas }: { filas: FilaFile[] }) {
  const { campo, dir, alternar, orden } = useOrden("t1");
  const [q, setQ] = useState("");
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const visibles = useMemo(() => {
    const nq = norm(q.trim());
    const filtradas = nq ? filas.filter((f) => norm(f.file).includes(nq) || norm(f.cliente).includes(nq)) : filas;
    const val = (f: FilaFile): number | string =>
      campo === "file" ? f.file
        : campo === "cliente" ? f.cliente
          : campo === "creado" ? (f.creado?.getTime() ?? 0)
            : campo === "docs" ? (f.docs?.getTime() ?? 0)
              : campo === "carta" ? (f.carta?.getTime() ?? 0)
                : campo === "t2" ? num(f.t2Seg)
                  : campo === "total" ? num(f.totalSeg)
                    : num(f.t1Seg);
    return [...filtradas].sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === "string" ? va.localeCompare(vb as string, "es") : va - (vb as number);
      return dir === "asc" ? c : -c;
    });
  }, [filas, campo, dir, q]);

  const recortadas = visibles.slice(0, MAX_FILAS);

  return (
    <section className="mt-7">
      <SectionHeader title="Por file" badge={`${nEs(filas.length)} files`} />
      <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar file o cliente…"
          className="rounded-lg border px-3 py-1.5 text-sm outline-none"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)", minWidth: 220 }} />
        <ExportBtn onClick={() => descargarCSV("ocr-por-file", exportFilesCSV(visibles))}>Exportar por file</ExportBtn>
        <span className="text-[0.72rem] text-[var(--text-muted)]">
          {nEs(visibles.length)} de {nEs(filas.length)} · el CSV incluye todo el recorte filtrado
        </span>
      </div>
      <div className="table-wrap">
        <table className="pmo">
          <thead>
            <tr>
              <Th campo="file" orden={orden} alternar={alternar} align="left">File</Th>
              <Th campo="cliente" orden={orden} alternar={alternar} align="left">Cliente</Th>
              <Th campo="creado" orden={orden} alternar={alternar}>Creado</Th>
              <Th campo="docs" orden={orden} alternar={alternar}>Digit. docs</Th>
              <Th campo="carta" orden={orden} alternar={alternar}>Digit. carta lic.</Th>
              <Th campo="t1" orden={orden} alternar={alternar}>T1</Th>
              <Th campo="t2" orden={orden} alternar={alternar}>T2</Th>
              <Th campo="total" orden={orden} alternar={alternar}>Total</Th>
            </tr>
          </thead>
          <tbody>
            {recortadas.map((f) => (
              <tr key={f.file}>
                <td className="ini-id">{f.file}</td>
                <td className="max-w-[200px] truncate text-[var(--text-secondary)]" title={f.cliente}>{f.cliente}</td>
                <td className="tabular-nums text-center text-[var(--text-secondary)]">{fmtFecha(f.creado)}</td>
                <td className="tabular-nums text-center text-[var(--text-secondary)]">{fmtFechaHora(f.docs)}</td>
                <td className="tabular-nums text-center text-[var(--text-secondary)]">{fmtFechaHora(f.carta)}</td>
                <td className="tabular-nums text-center" style={{ color: f.t1Seg == null ? "var(--text-muted)" : "var(--etapa-1)" }}>{f.t1Seg == null ? "—" : fmtDur(f.t1Seg)}</td>
                <td className="tabular-nums text-center" style={{ color: f.t2Seg == null ? "var(--text-muted)" : "var(--etapa-3)" }}>{f.t2Seg == null ? "—" : fmtDur(f.t2Seg)}</td>
                <td className="tabular-nums text-center font-semibold" style={f.totalSeg == null ? { color: "var(--text-muted)" } : undefined}>{f.totalSeg == null ? "—" : fmtDur(f.totalSeg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibles.length > MAX_FILAS && (
        <p className="mt-2 text-[0.72rem] text-[var(--text-muted)]">
          Se muestran los primeros {MAX_FILAS} de {nEs(visibles.length)}. Usa el buscador o el CSV.
        </p>
      )}
    </section>
  );
}

export default function TablasOcr({ clientes, files, serie }: {
  clientes: FilaCliente[]; files: FilaFile[]; serie: PuntoSerieOcr[];
}) {
  return (
    <>
      <TablaCliente filas={clientes} serie={serie} />
      <TablaFile filas={files} />
    </>
  );
}
