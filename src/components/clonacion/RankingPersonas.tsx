"use client";

// C5 — Ranking horizontal top 15, reutilizado para Usuario y Cliente. El
// largo de la barra es la medida seleccionada (mediana/promedio/P90); un
// selector permite ordenar por medida o por volumen. Clic en una barra o
// etiqueta filtra por ese usuario/cliente.

import { useState } from "react";
import { fmtHHMMSS } from "@/lib/horario";
import { METRICA_LABEL, type FilaRanking, type Metrica } from "@/lib/clonaciones";

type Orden = "medida" | "volumen";
const TOP = 15;

export default function RankingPersonas({
  titulo, filas, metrica, seleccion, onSeleccionar,
}: {
  titulo: string;
  filas: FilaRanking[];
  metrica: Metrica;
  seleccion: string[];
  onSeleccionar: (clave: string) => void;
}) {
  const [orden, setOrden] = useState<Orden>("medida");

  const ordenadas = [...filas]
    .sort((a, b) => (orden === "medida" ? (b.valor ?? -1) - (a.valor ?? -1) : b.n - a.n))
    .slice(0, TOP);
  const max = Math.max(1, ...ordenadas.map((f) => (orden === "medida" ? f.valor ?? 0 : f.n)));
  const sel = new Set(seleccion);

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[0.86rem] font-bold text-[var(--text-primary)]">{titulo}</h4>
        <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
          {([["medida", METRICA_LABEL[metrica]], ["volumen", "Volumen"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setOrden(v)}
              className="px-2.5 py-1 text-[0.7rem] font-semibold transition-colors"
              style={{
                background: orden === v ? "var(--bg-accent-soft)" : "var(--bg-surface)",
                color: orden === v ? "var(--accent-light)" : "var(--text-secondary)",
              }}>{l}</button>
          ))}
        </div>
      </div>

      {ordenadas.length === 0 ? (
        <div className="py-8 text-center text-[0.8rem] text-[var(--text-muted)]">Sin datos para los filtros seleccionados.</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {ordenadas.map((f) => {
            const activo = sel.has(f.clave);
            const largo = Math.max(2, ((orden === "medida" ? f.valor ?? 0 : f.n) / max) * 100);
            return (
              <button
                key={f.clave}
                onClick={() => onSeleccionar(f.clave)}
                className="group flex items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-[var(--bg-hover)]"
                style={activo ? { boxShadow: "inset 3px 0 0 var(--accent)", background: "var(--bg-hover)" } : undefined}
              >
                <span className="w-[120px] shrink-0 truncate text-[0.74rem]"
                  style={{ color: activo ? "var(--accent-light)" : "var(--text-secondary)", fontWeight: activo ? 600 : 400 }}
                  title={f.clave}>
                  {f.clave}
                </span>
                <span className="relative h-4 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${largo}%`, background: activo ? "var(--accent)" : "var(--text-disabled)", opacity: activo ? 0.95 : 0.7 }} />
                </span>
                <span className="w-[130px] shrink-0 text-right tabular-nums text-[0.7rem] text-[var(--text-muted)]">
                  {fmtHHMMSS(f.valor)} · {f.n.toLocaleString("es-GT")}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
