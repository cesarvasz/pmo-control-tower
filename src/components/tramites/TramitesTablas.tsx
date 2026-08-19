"use client";

// Tablas del reporte. Con el formato ancho del origen, todas las dimensiones
// (Mesa, Cliente, Usuario, Analista, Proceso…) comparten forma, así que una sola
// tabla genérica las cubre. Las tablas «Por acción» y «Quién ejecutó» ya no
// existen: el origen dejó de traer quién ejecutó cada hito.

import { useMemo, useState } from "react";
import { fmtHHMMSS } from "@/lib/horario";
import { Pill } from "@/components/ui";
import { ETAPAS, esAutomatizado, type EtapaKey, type FilaAgregada, type FilaHito } from "@/lib/tramites";

type Dir = "asc" | "desc";
const num = (v: number | null | undefined) => (v == null ? -1 : v);

function Th({ children, campo, orden, alternar, align = "left" }: {
  children: React.ReactNode;
  campo?: string;
  orden?: { campo: string; dir: Dir };
  alternar?: (c: string) => void;
  align?: "left" | "center";
}) {
  const activo = campo && orden?.campo === campo;
  return (
    <th
      onClick={campo && alternar ? () => alternar(campo) : undefined}
      className={campo ? "cursor-pointer select-none" : undefined}
      style={{ textAlign: align, color: activo ? "var(--accent-light)" : undefined }}
    >
      {children}
      {activo && <span className="ml-1">{orden!.dir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

/** Marca de ejecutor automatizado — no cuenta como personal. */
export function BadgeBot() {
  return <Pill tone="neutral" small title="Ejecutor automatizado — no cuenta como personal">⚙ auto</Pill>;
}

/**
 * Tabla genérica de una dimensión: volumen, el tiempo de cada etapa y el total.
 * Clicable para aplicar el valor como filtro; ordenable por cualquier columna.
 */
export function TablaDimension({
  filas, etiqueta, onFiltrar, seleccion, buscable = false, marcarBots = false, maxFilas = 200,
  columnaCiclo = false, alcance,
}: {
  filas: FilaAgregada[];
  etiqueta: string;
  onFiltrar: (v: string) => void;
  seleccion: string[];
  buscable?: boolean;
  marcarBots?: boolean;
  maxFilas?: number;
  /** Tablas de persona: agrega «De punta a punta» (expedientes donde es Usuario y Analista). */
  columnaCiclo?: boolean;
  /** Filtro global de "Tiempo": solo se muestran columnas de etapas de este tramo. */
  alcance?: EtapaKey[];
}) {
  const etapasVisibles = alcance ? ETAPAS.filter((e) => alcance.includes(e.key)) : ETAPAS;
  const [campo, setCampo] = useState("volumen");
  const [dir, setDir] = useState<Dir>("desc");
  const [q, setQ] = useState("");

  const alternar = (c: string) => {
    if (c === campo) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setCampo(c); setDir("desc"); }
  };

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visibles = useMemo(() => {
    const n = norm(q);
    const filtradas = n ? filas.filter((f) => norm(f.label).includes(n)) : filas;
    const s = [...filtradas].sort((a, b) => {
      const v = campo === "clave" ? a.label.localeCompare(b.label, "es")
        : campo === "volumen" ? a.volumen - b.volumen
        : campo === "ciclo" ? (a.cicloCompleto ?? 0) - (b.cicloCompleto ?? 0)
        : num(a.tiempos[campo as EtapaKey | "total"]) - num(b.tiempos[campo as EtapaKey | "total"]);
      return dir === "asc" ? v : -v;
    });
    return s;
  }, [filas, campo, dir, q]);

  const recortadas = visibles.slice(0, maxFilas);

  return (
    <div>
      {buscable && (
        <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Buscar ${etiqueta.toLowerCase()}…`}
            className="rounded-lg border px-3 py-1.5 text-sm outline-none"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)", minWidth: 220 }}
          />
          <span className="text-[0.72rem] text-[var(--text-muted)]">
            {visibles.length.toLocaleString("es-GT")} de {filas.length.toLocaleString("es-GT")}
          </span>
        </div>
      )}

      <div className="table-wrap">
        <table className="pmo">
          <thead>
            <tr>
              <Th campo="clave" orden={{ campo, dir }} alternar={alternar}>{etiqueta}</Th>
              <Th campo="volumen" orden={{ campo, dir }} alternar={alternar} align="center">Volumen</Th>
              {columnaCiclo && (
                <Th campo="ciclo" orden={{ campo, dir }} alternar={alternar} align="center">
                  <span title="Expedientes donde es Usuario y Analista a la vez: carga el ciclo completo">
                    Punta a punta
                  </span>
                </Th>
              )}
              {etapasVisibles.map((e) => (
                <Th key={e.key} campo={e.key} orden={{ campo, dir }} alternar={alternar} align="center">
                  {e.corto}
                </Th>
              ))}
              <Th campo="total" orden={{ campo, dir }} alternar={alternar} align="center">Total</Th>
            </tr>
          </thead>
          <tbody>
            {recortadas.map((f) => {
              const activa = seleccion.includes(f.clave);
              const bot = marcarBots && esAutomatizado(f.clave);
              return (
                <tr key={f.clave} onClick={() => onFiltrar(f.clave)} className="cursor-pointer"
                  style={activa ? { boxShadow: "inset 3px 0 0 var(--accent)" } : undefined}>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="truncate" title={f.label}
                        style={{ color: activa ? "var(--accent-light)" : undefined, fontWeight: activa ? 600 : 400 }}>
                        {f.label}
                      </span>
                      {bot && <BadgeBot />}
                    </span>
                  </td>
                  <td className="tabular-nums text-center">{f.volumen.toLocaleString("es-GT")}</td>
                  {columnaCiclo && (
                    <td className="tabular-nums text-center text-[var(--text-secondary)]">
                      {f.cicloCompleto ? f.cicloCompleto.toLocaleString("es-GT") : "—"}
                    </td>
                  )}
                  {etapasVisibles.map((e) => (
                    <td key={e.key} className="tabular-nums text-center text-[var(--text-secondary)]">
                      {fmtHHMMSS(f.tiempos[e.key])}
                    </td>
                  ))}
                  <td className="tabular-nums text-center font-semibold">{fmtHHMMSS(f.tiempos.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {visibles.length > maxFilas && (
        <p className="mt-2 text-[0.72rem] text-[var(--text-muted)]">
          Se muestran las primeras {maxFilas} de {visibles.length.toLocaleString("es-GT")} — usa el buscador para afinar.
        </p>
      )}
    </div>
  );
}

/** Cuántos expedientes alcanzaron cada hito del trámite. */
export function TablaHitos({ filas }: { filas: FilaHito[] }) {
  return (
    <div className="table-wrap">
      <table className="pmo">
        <thead>
          <tr>
            <th>Hito</th>
            <th style={{ textAlign: "center" }}>Expedientes</th>
            <th style={{ textAlign: "center" }}>Cobertura</th>
            <th style={{ minWidth: 160 }}>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const color = f.cobertura >= 0.9 ? "var(--ok)" : f.cobertura >= 0.7 ? "var(--warn)" : "var(--bad)";
            return (
              <tr key={f.key}>
                <td>{f.label}</td>
                <td className="tabular-nums text-center">{f.expedientes.toLocaleString("es-GT")}</td>
                <td className="tabular-nums text-center font-semibold" style={{ color }}>
                  {Math.round(f.cobertura * 100)}%
                </td>
                <td>
                  <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
                    <div className="h-full rounded-full" style={{ width: `${f.cobertura * 100}%`, background: color }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
