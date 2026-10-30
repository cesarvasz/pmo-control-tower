"use client";

// Tarjeta del «Player» del VPA en el Control Tower, debajo de los Portafolios por PM. Mismo formato que la
// tarjeta de un PM: arriba el Player (el total ponderado del mes, de 0 a 100) y debajo, en una fila, la nota
// de cada uno de los 5 indicadores de «Objetivos de Calidad» con lo que aporta. Muestra el mes en curso y un
// selector para ver otro mes. Las notas las califica un Admin en la pestaña VPA de /calidad-cumplimiento
// (ver lib/vpa.ts); solo la ven quienes tienen esa página.

import { useEffect, useMemo, useState } from "react";
import { useMe } from "@/context/PermissionsContext";
import { authedFetch } from "@/lib/api";
import { canSeePage, pageByKey } from "@/lib/registry";
import { kpiColorFor } from "@/lib/kpi";
import { etiquetaMesLargo } from "@/lib/players";
import { VPA_INDICADORES, playerVpa, puntosIndicadorVpa, vpaMeses, type VpaCalifs } from "@/lib/vpa";
import MetricCell from "@/components/MetricCell";
import { playerPalette } from "@/components/PmScoreboard";

/** 85 → «85», 85.5 → «85.5», 85.25 → «85.3». */
const num1 = (n: number) => String(Math.round(n * 10) / 10);
const colorLogro = (logro: number) => (logro >= 0.9 ? "var(--ok)" : logro >= 0.75 ? "var(--warn)" : "var(--bad)");

export default function VpaPlayerCard() {
  const { me } = useMe();
  const puede = useMemo(() => {
    const pagina = pageByKey("calidad-cumplimiento");
    return !!me && !!pagina && canSeePage(me.permissions, pagina);
  }, [me]);

  const [califs, setCalifs] = useState<VpaCalifs | null>(null);
  const meses = useMemo(() => vpaMeses().reverse(), []);   // el más reciente primero
  const [mes, setMes] = useState<string>(meses[0]);

  useEffect(() => {
    if (!puede) return;
    let vivo = true;
    authedFetch("/api/vpa")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((d: { califs: VpaCalifs }) => { if (vivo) setCalifs(d.califs); })
      .catch((err) => console.warn("Player del VPA: no se pudo cargar:", err));
    return () => { vivo = false; };
  }, [puede]);

  // Sin permiso, o mientras no llegan las notas, no se muestra (no se avisa de un error a quien no la ve).
  if (!puede || !califs) return null;
  return <VpaPlayerVista califs={califs} meses={meses} mes={mes} onMes={setMes} />;
}

/** La tarjeta en sí, sin datos propios (`meses` del más reciente al más antiguo; el primero es el actual). */
export function VpaPlayerVista({ califs, meses, mes, onMes }: { califs: VpaCalifs; meses: string[]; mes: string; onMes: (mes: string) => void }) {
  const vigente = meses[0];
  const notas = califs[mes]?.notas;
  const p = playerVpa(notas);
  // Con indicadores sin calificar el total aún no es el del mes: se muestra sin el color de rango.
  const pill = p && p.completo ? playerPalette(p.player) : { bg: "var(--bg-hover)", fg: "var(--text-secondary)" };
  const borde = p && p.completo ? kpiColorFor(p.player / 100) : "var(--border)";

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div className="overflow-hidden rounded-xl border-2" style={{ background: "var(--bg-surface)", borderColor: borde }}>
        <div className="flex items-center justify-between gap-3 border-b px-[18px] py-3.5" style={{ borderColor: "var(--border)" }}>
          <div>
            <span className="text-[0.95rem] font-bold text-[var(--text-primary)]">VPA</span>
            <div className="mt-0.5 text-[0.75rem] text-[var(--text-muted)]">Objetivos de Calidad</div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <select
              value={mes} onChange={(e) => onMes(e.target.value)} aria-label="Mes del Player del VPA"
              className="rounded-lg border px-2 py-1 text-[0.75rem] font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}
            >
              {meses.map((m) => <option key={m} value={m}>{etiquetaMesLargo(m)}{m === vigente ? " (actual)" : ""}</option>)}
            </select>
            <span
              title={p ? `Player del VPA: ${p.player}/100${p.completo ? "" : ` · ${p.calificados} de ${p.total} indicadores calificados`}` : "Sin calificar este mes"}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.78rem] font-extrabold"
              style={{ color: pill.fg, background: pill.bg, boxShadow: "inset 0 0 0 1px rgba(128,128,128,0.35)" }}
            >
              Player {p ? p.player : "—"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-5">
          {VPA_INDICADORES.map((ind, i) => {
            const nota = notas?.[ind.key];
            return (
              <MetricCell
                key={ind.key} label={ind.corto} divider={i > 0}
                value={nota != null ? `${num1(nota)}%` : "—"}
                color={nota != null ? colorLogro(nota / ind.meta) : "#6b7280"}
                sub={nota != null ? `${num1(puntosIndicadorVpa(ind, nota))}/${ind.peso} pts` : "sin calificar"}
                title={`${ind.indicador} · ${ind.objetivo} · meta ${ind.meta}% · peso ${ind.peso}`}
              />
            );
          })}
        </div>

        {p && !p.completo && (
          <div className="border-t px-[18px] py-2 text-[0.72rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
            {p.calificados} de {p.total} indicadores calificados · el Player suma solo los calificados
          </div>
        )}
      </div>
    </div>
  );
}
