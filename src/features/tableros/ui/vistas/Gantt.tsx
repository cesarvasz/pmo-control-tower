"use client";

// Vista Gantt: barras por elemento (su Plan) o hitos (su Fecha límite), por grupo, con los
// subelementos desplegables, la línea de hoy y el color de su status. Clic en un nombre abre su detalle.

import { useMemo, useState } from "react";
import { EmptyRow } from "@/components/ui";
import { barrasGantt, diasEntre, mesesEnRango, rangoGantt, type Barra } from "../../dominio/gantt";
import { porOrden } from "../../dominio/tablero";
import { hoyLocal } from "../../dominio/formulas";
import { estiloControl } from "../comun";
import type { PropsVista } from "./index";

const ALTO = 30;
const ZOOM = { dias: 26, semanas: 12, meses: 4 } as const;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmt = (f: string) => `${+f.slice(8, 10)} ${MESES[+f.slice(5, 7) - 1]} ${f.slice(0, 4)}`;

export default function VistaGantt({ datos, calc, busca, onAbrir }: PropsVista) {
  const [zoom, setZoom] = useState<keyof typeof ZOOM>("semanas");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const hoy = hoyLocal();
  const barras = useMemo(() => barrasGantt(datos, calc, hoy), [datos, calc, hoy]);
  const rango = useMemo(() => rangoGantt(barras, hoy), [barras, hoy]);
  const px = ZOOM[zoom];

  const q = busca.trim().toLowerCase();
  const visibles = barras.filter((b) => {
    if (!q) return true;
    const item = b.parentId ? barras.find((x) => x.id === b.parentId) : b;
    return [item, ...barras.filter((x) => x.parentId === item?.id)].some((x) => x?.nombre.toLowerCase().includes(q));
  });

  if (!rango) return <EmptyRow msg="Nada tiene fechas todavía: el Gantt usa la columna con rol Plan (inicio–fin) o Fecha límite." />;

  const ancho = (diasEntre(rango.desde, rango.hasta) + 1) * px;
  const x = (f: string) => diasEntre(rango.desde, f) * px;
  const filas: ({ tipo: "grupo"; id: string; titulo: string; color: string } | { tipo: "barra"; b: Barra; subs: number })[] = [];
  for (const g of [...datos.grupos].sort(porOrden)) {
    const items = visibles.filter((b) => !b.parentId && b.grupoId === g.id);
    if (!items.length) continue;
    filas.push({ tipo: "grupo", id: g.id, titulo: g.titulo, color: g.color ?? "var(--accent)" });
    for (const it of items) {
      const subs = visibles.filter((b) => b.parentId === it.id);
      filas.push({ tipo: "barra", b: it, subs: subs.length });
      if (abiertos.has(it.id)) for (const s of subs) filas.push({ tipo: "barra", b: s, subs: 0 });
    }
  }
  const atrasados = visibles.filter((b) => b.atrasado).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-[0.78rem] text-[var(--text-secondary)]">
        <label className="flex items-center gap-1.5">Escala
          <select value={zoom} onChange={(e) => setZoom(e.target.value as keyof typeof ZOOM)} {...estiloControl}>
            <option value="dias">Días</option><option value="semanas">Semanas</option><option value="meses">Meses</option>
          </select>
        </label>
        <button type="button" className="hover:underline" onClick={() => setAbiertos(new Set(barras.filter((b) => !b.parentId).map((b) => b.id)))}>Desplegar todo</button>
        <button type="button" className="hover:underline" onClick={() => setAbiertos(new Set())}>Plegar todo</button>
        <span className="flex-1" />
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-0.5" style={{ background: "#e2445c" }} /> hoy</span>
        <span>◆ fecha límite sin plan</span>
        <span>▏fin real</span>
        {atrasados > 0 && <span className="font-semibold text-[#e2445c]">{atrasados} atrasado{atrasados === 1 ? "" : "s"}</span>}
      </div>

      <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
        {/* Nombres */}
        <div className="w-[300px] shrink-0 border-r" style={{ borderColor: "var(--border)" }}>
          <div style={{ height: 44 }} className="border-b" />
          {filas.map((f) => f.tipo === "grupo" ? (
            <div key={`g${f.id}`} className="truncate border-b px-2 text-[0.8rem] font-semibold" style={{ height: ALTO, lineHeight: `${ALTO}px`, color: f.color, borderColor: "var(--border-subtle)" }}>
              {f.titulo}
            </div>
          ) : (
            <div key={f.b.id} className="flex items-center gap-1 border-b pr-2 text-[0.8rem]" style={{ height: ALTO, paddingLeft: f.b.parentId ? 26 : 6, borderColor: "var(--border-subtle)" }}>
              {f.subs > 0 ? (
                <button type="button" className="w-4 text-[var(--text-muted)]" aria-label={abiertos.has(f.b.id) ? "Plegar" : "Desplegar"}
                  onClick={() => setAbiertos((s) => { const n = new Set(s); if (n.has(f.b.id)) n.delete(f.b.id); else n.add(f.b.id); return n; })}>
                  {abiertos.has(f.b.id) ? "▾" : "▸"}
                </button>
              ) : <span className="w-4" />}
              <button type="button" className="flex-1 truncate text-left text-[var(--text-primary)] hover:underline" title={f.b.nombre} onClick={() => onAbrir(f.b.id)}>
                {f.b.nombre || "(sin nombre)"}
              </button>
            </div>
          ))}
        </div>

        {/* Línea de tiempo */}
        <div className="flex-1 overflow-x-auto">
          <div className="relative" style={{ width: ancho }}>
            <div className="relative border-b" style={{ height: 44, borderColor: "var(--border)" }}>
              {mesesEnRango(rango.desde, rango.hasta).map((m) => (
                <div key={m} className="absolute top-0 h-full border-l px-1 text-[0.72rem] font-semibold text-[var(--text-secondary)]" style={{ left: Math.max(0, x(m)), borderColor: "var(--border)" }}>
                  {MESES[+m.slice(5, 7) - 1]} {m.slice(2, 4)}
                </div>
              ))}
            </div>
            {filas.map((f) => (
              <div key={f.tipo === "grupo" ? `g${f.id}` : f.b.id} className="relative border-b" style={{ height: ALTO, borderColor: "var(--border-subtle)", background: f.tipo === "grupo" ? "var(--bg-hover)" : undefined }}>
                {f.tipo === "barra" && f.b.desde && f.b.hasta && (f.b.hito ? (
                  <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45" title={`${f.b.nombre} · fecha límite ${fmt(f.b.hasta)} · ${f.b.status}`}
                    style={{ left: x(f.b.hasta) + px / 2, background: f.b.color, outline: f.b.atrasado ? "2px solid #e2445c" : undefined }} />
                ) : (
                  <div className="absolute top-[7px] h-4 rounded" title={`${f.b.nombre} · ${fmt(f.b.desde)} → ${fmt(f.b.hasta)} · ${f.b.status}${f.b.atrasado ? " · atrasado" : ""}`}
                    style={{
                      left: x(f.b.desde), width: Math.max(px, (diasEntre(f.b.desde, f.b.hasta) + 1) * px), background: f.b.color,
                      opacity: f.b.parentId ? 0.8 : 1, outline: f.b.atrasado ? "2px solid #e2445c" : undefined,
                    }} />
                ))}
                {f.tipo === "barra" && f.b.finReal && (
                  <div className="absolute top-1 h-[22px] w-0.5" title={`Fin real ${fmt(f.b.finReal)}`} style={{ left: x(f.b.finReal) + px - 1, background: "var(--text-primary)" }} />
                )}
              </div>
            ))}
            <div className="pointer-events-none absolute top-0 w-0.5" title={`Hoy ${fmt(hoy)}`} style={{ left: x(hoy) + px / 2, height: 44 + filas.length * ALTO, background: "#e2445c" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
