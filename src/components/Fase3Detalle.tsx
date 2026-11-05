"use client";

// Detalle de la Fase 3 (Launch) bajo el Status Card: un acordeón con los entregables (items) de la fase y, al
// abrir cada uno, sus actividades (subitems) con status, fechas y responsable. Es interactivo, por eso va
// debajo de la hoja del Status Card y no dentro (la hoja es una página fija que también se exporta a PDF).

import { useMemo, useState } from "react";
import { isFase3 } from "@/lib/dashboard";
import { fmtDate } from "@/lib/business";
import { Pill, type Tone } from "@/components/ui";
import type { ProjItem, ProjSubitem } from "@/types";

const toneStatus = (status: string): Tone =>
  status === "Done" ? "ok" : status === "Stuck" ? "bad" : status === "Working on it" ? "info" : "neutral";

const fecha = (d: Date | null | undefined) => (d ? fmtDate(d) : "—");

function Actividad({ s }: { s: ProjSubitem }) {
  return (
    <tr className="border-t" style={{ borderColor: "var(--border)" }}>
      <td className="px-3 py-1.5 text-[var(--text-primary)]">{s.name}</td>
      <td className="px-3 py-1.5"><Pill tone={toneStatus(s.status)} small>{s.status || "—"}</Pill></td>
      <td className="px-3 py-1.5 tabular-nums text-[var(--text-secondary)]">{fecha(s.deadline)}</td>
      <td className="px-3 py-1.5 tabular-nums text-[var(--text-secondary)]">{fecha(s.newLimitDate)}</td>
      <td className="px-3 py-1.5 tabular-nums text-[var(--text-secondary)]">{fecha(s.actualEnd)}</td>
      <td className="px-3 py-1.5 text-[var(--text-secondary)]">{s.responsible || "—"}</td>
    </tr>
  );
}

export default function Fase3Detalle({ items }: { items: ProjItem[] }) {
  const entregables = useMemo(
    () => items.filter((p) => isFase3(p.grupo)).sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) || a.name.localeCompare(b.name)),
    [items],
  );
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set());
  const alternar = (id: string) =>
    setAbiertos((prev) => { const n = new Set(prev); if (!n.delete(id)) n.add(id); return n; });

  return (
    <section className="mt-4">
      <h3 className="mb-2 text-[0.8rem] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
        Fase 3 · Entregables y actividades
      </h3>
      {entregables.length === 0 ? (
        <div className="rounded-lg px-4 py-3 text-[0.82rem] text-[var(--text-muted)]" style={{ background: "var(--bg-hover)" }}>
          Este proyecto no tiene entregables en la Fase 3.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {entregables.map((p) => {
            const abierto = abiertos.has(p.id);
            const hechas = p.subitems.filter((s) => s.status === "Done").length;
            return (
              <li key={p.id} className="rounded-lg border" style={{ borderColor: "var(--border)" }}>
                <button
                  type="button" aria-expanded={abierto} onClick={() => alternar(p.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-hover)]"
                >
                  <span aria-hidden className="w-3 text-[0.65rem] text-[var(--text-muted)]">{abierto ? "▾" : "▸"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.82rem] font-semibold text-[var(--text-primary)]">{p.name}</span>
                    <span className="block text-[0.68rem] text-[var(--text-muted)]">
                      {p.responsible || p.resp || "sin responsable"} · límite {fecha(p.deadline)} · {hechas} de {p.subitems.length} {p.subitems.length === 1 ? "actividad" : "actividades"} Done
                    </span>
                  </span>
                  <Pill tone={toneStatus(p.status)} small>{p.status || "—"}</Pill>
                </button>
                {abierto && (
                  p.subitems.length === 0 ? (
                    <div className="border-t px-4 py-2 text-[0.76rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>Sin actividades.</div>
                  ) : (
                    <div className="overflow-x-auto border-t" style={{ borderColor: "var(--border)" }}>
                      <table className="w-full text-[0.76rem]">
                        <thead>
                          <tr className="text-left text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
                            <th className="px-3 py-1.5 font-semibold">Actividad</th>
                            <th className="px-3 py-1.5 font-semibold">Status</th>
                            <th className="px-3 py-1.5 font-semibold">Límite</th>
                            <th className="px-3 py-1.5 font-semibold">Nueva fecha</th>
                            <th className="px-3 py-1.5 font-semibold">Cierre real</th>
                            <th className="px-3 py-1.5 font-semibold">Responsable</th>
                          </tr>
                        </thead>
                        <tbody>{p.subitems.map((s) => <Actividad key={s.id} s={s} />)}</tbody>
                      </table>
                    </div>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
