"use client";

// Resumen de una pantalla de la pestaña 003: los números que importan, grandes y sin
// tener que hacer cuentas — Files totales (con + sin Ducafast), cantidad y costo de
// cada grupo por separado y el beneficio de Ducafast. Clic en
// «Beneficio» abre, aquí mismo, una tabla simple Con vs. Sin Ducafast.
//
// Todo sale del mismo recorte filtrado que el resto de la pestaña (`ahorro` es el
// mismo cálculo que «Ahorro real con Ducafast» de Costo por File).

import { useState } from "react";
import type { AhorroDucafast } from "@/lib/tramites";

const usd = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usdCorto = (n: number) =>
  Math.abs(n) >= 10_000 ? `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n) / 1000).toLocaleString("en-US")}K` : usd(n);
const num = (n: number) => Math.round(n).toLocaleString("es-GT");
const pct = (p: number | null) => (p == null ? "—" : `${(Math.round(p * 1000) / 10).toLocaleString("es-GT")}%`);

const Etiqueta = ({ children, color }: { children: React.ReactNode; color?: string }) => (
  <div className="flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-wider" style={{ color: color ?? "var(--text-muted)" }}>
    {children}
  </div>
);
const Grande = ({ children, color }: { children: React.ReactNode; color?: string }) => (
  <div className="mt-1.5 truncate tabular-nums text-[2.1rem] font-extrabold leading-none" style={{ color: color ?? "var(--text-primary)" }}>
    {children}
  </div>
);
const Sub = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-1.5 text-[0.76rem] text-[var(--text-muted)]">{children}</div>
);

function Tile({ children, className = "", acento, onClick, activo, tip }: {
  children: React.ReactNode; className?: string; acento?: string;
  onClick?: () => void; activo?: boolean; tip?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      title={tip}
      aria-expanded={onClick ? activo : undefined}
      className={`flex min-w-0 flex-col rounded-xl border p-4 text-left ${onClick ? "cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" : ""} ${className}`}
      style={{
        background: "var(--bg-surface)",
        borderColor: activo ? "var(--accent)" : "var(--border)",
        borderWidth: activo ? 2 : 1,
        ...(acento ? { borderLeft: `5px solid ${acento}` } : {}),
      }}>
      {children}
    </Comp>
  );
}

/** Tarjeta de un grupo (con o sin Ducafast): Cantidad y Costo lado a lado. */
function TileGrupo({ titulo, color, files, total, medidos, porFile, tarifa }: {
  titulo: string; color: string; files: number; total: number;
  /** Files del grupo con tiempo medido: la base de su costo. */
  medidos: number; porFile: number; tarifa: number;
}) {
  const costo = medidos * porFile;
  return (
    <Tile acento={color} className="col-span-2"
      tip={`Cantidad: Files del periodo ${titulo.toLowerCase()}.\nCosto: horas × $${tarifa}/h + licencias de los ${num(medidos)} Files con tiempo medido = ${num(medidos)} × ${usd(porFile)} = ${usd(costo)}`}>
      <Etiqueta color={color}><span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />{titulo}</Etiqueta>
      <div className="mt-1 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <div className="text-[0.66rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Cantidad</div>
          <Grande color={color}>{num(files)}</Grande>
          <Sub>{pct(total ? files / total : null)} del total</Sub>
        </div>
        <div className="min-w-0 border-l pl-3" style={{ borderColor: "var(--border)" }}>
          <div className="text-[0.66rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Costo</div>
          <Grande>{medidos ? usdCorto(costo) : "—"}</Grande>
          <Sub>{medidos ? <><strong className="text-[var(--text-secondary)]">{usd(porFile)}</strong> por File</> : "sin tiempo medido"}</Sub>
        </div>
      </div>
    </Tile>
  );
}

const COLOR_CON = "var(--accent-light)";
const COLOR_SIN = "var(--warn)";

export default function ResumenDucafast({ periodo, filesCon, filesSin, ahorro, tarifa }: {
  /** «Nov 26», «3 meses», «Todo el histórico». */
  periodo: string;
  /** Files del recorte (cuenta simple, sin importar si tienen tiempo medido). */
  filesCon: number;
  filesSin: number;
  ahorro: AhorroDucafast;
  tarifa: number;
}) {
  const [detalle, setDetalle] = useState(false);
  const total = filesCon + filesSin;

  // Costo de cada grupo = sus Files medidos × su costo por File (horas × tarifa + licencias),
  // la misma base que el ahorro — así los costos y el Beneficio hablan del mismo dinero.
  const costoCon = ahorro.filesConDucafast * ahorro.costoPorFileConDucafast;
  const costoSin = ahorro.filesSinDucafast * ahorro.costoPorFileSinDucafast;
  const ahorroPorFile = ahorro.costoPorFileSinDucafast - ahorro.costoPorFileConDucafast;

  return (
    <section className="mb-5">
      <div className="mb-2">
        <span className="rounded-md px-2 py-0.5 text-[0.72rem] font-bold" style={{ background: "var(--bg-accent-soft)", color: "var(--accent-light)" }}>
          {periodo}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile>
          <Etiqueta>Total de Files</Etiqueta>
          <Grande>{num(total)}</Grande>
          <Sub>con + sin Ducafast</Sub>
        </Tile>
        <TileGrupo titulo="Con Ducafast" color={COLOR_CON} files={filesCon} total={total}
          medidos={ahorro.filesConDucafast} porFile={ahorro.costoPorFileConDucafast} tarifa={tarifa} />
        <TileGrupo titulo="Sin Ducafast" color={COLOR_SIN} files={filesSin} total={total}
          medidos={ahorro.filesSinDucafast} porFile={ahorro.costoPorFileSinDucafast} tarifa={tarifa} />
        <Tile onClick={() => setDetalle((v) => !v)} activo={detalle}
          tip={ahorro.disponible ? `${num(ahorro.filesConDucafast)} Files con Ducafast × (${usd(ahorro.costoPorFileSinDucafast)} − ${usd(ahorro.costoPorFileConDucafast)}) = ${usd(ahorro.ahorro)}` : undefined}>
          <Etiqueta>
            Beneficio Ducafast
            <span className="ml-auto normal-case tracking-normal text-[var(--accent-light)]">{detalle ? "▴" : "▾"}</span>
          </Etiqueta>
          <Grande color={!ahorro.disponible ? "var(--text-muted)" : ahorro.ahorro >= 0 ? "var(--ok)" : "var(--bad)"}>
            {ahorro.disponible ? usdCorto(ahorro.ahorro) : "—"}
          </Grande>
          <Sub>{ahorro.disponible ? `${usd(ahorroPorFile)} menos por File` : "Sin Files con y sin Ducafast para comparar"}</Sub>
        </Tile>
      </div>

      {detalle && (
        <div className="mt-3 rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--accent)" }}>
          <div className="table-wrap">
            <table className="pmo">
              <thead>
                <tr>
                  <th></th>
                  <th style={{ textAlign: "right", color: COLOR_CON }}>Con Ducafast</th>
                  <th style={{ textAlign: "right", color: COLOR_SIN }}>Sin Ducafast</th>
                  <th style={{ textAlign: "right" }}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Files</td>
                  <td className="tabular-nums text-right">{num(filesCon)}</td>
                  <td className="tabular-nums text-right">{num(filesSin)}</td>
                  <td className="tabular-nums text-right text-[var(--text-muted)]">—</td>
                </tr>
                <tr>
                  <td>Costo por File</td>
                  <td className="tabular-nums text-right">{usd(ahorro.costoPorFileConDucafast)}</td>
                  <td className="tabular-nums text-right">{usd(ahorro.costoPorFileSinDucafast)}</td>
                  <td className="tabular-nums text-right font-bold" style={{ color: ahorroPorFile >= 0 ? "var(--ok)" : "var(--bad)" }}>
                    {ahorro.disponible ? usd(ahorroPorFile) : "—"}
                  </td>
                </tr>
                <tr>
                  <td>Costo total</td>
                  <td className="tabular-nums text-right">{usd(costoCon)}</td>
                  <td className="tabular-nums text-right">{usd(costoSin)}</td>
                  <td className="tabular-nums text-right text-[var(--text-muted)]">—</td>
                </tr>
                <tr style={{ fontWeight: 700 }}>
                  <td>Beneficio</td>
                  <td colSpan={3} className="tabular-nums text-right"
                    style={{ color: !ahorro.disponible ? "var(--text-muted)" : ahorro.ahorro >= 0 ? "var(--ok)" : "var(--bad)" }}>
                    {ahorro.disponible ? usd(ahorro.ahorro) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[0.74rem] leading-relaxed text-[var(--text-muted)]">
            Beneficio = Files con Ducafast × (costo por File sin Ducafast − con Ducafast)
            {ahorro.disponible && <> = {num(ahorro.filesConDucafast)} × {usd(ahorroPorFile)}</>}.
            Costos con horas × ${tarifa}/h + licencias, sobre los Files con tiempo medido
            ({num(ahorro.filesConDucafast)} con y {num(ahorro.filesSinDucafast)} sin Ducafast).
          </p>
        </div>
      )}
    </section>
  );
}
