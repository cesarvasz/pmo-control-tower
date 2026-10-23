"use client";

// Debajo de cada CKU en /players: QUÉ se mide en Cumplimiento de Entrega y en Calidad de
// Entregas — las unidades que entran, el resultado de cada una y cuánto pesa cada fuente
// (Iniciativas / PML / Proyectos, los mismos pesos del EVM). Todo sale de lib/ckuDetalle,
// con la misma cuenta que el scoreboard, así que el % de aquí es el de la tabla.

import { useMemo } from "react";
import { Pill, type Tone } from "@/components/ui";
import { fmtDate } from "@/lib/business";
import { detalleCalidad, detalleCumplimiento, FUENTE_LABEL, type DetalleMedicion, type FuenteMedida, type ItemFase, type UnidadMedida } from "@/lib/ckuDetalle";
import type { DelayMap } from "@/lib/delay";
import type { CkuScope } from "@/lib/players";

const ORDEN: FuenteMedida[] = ["proj", "req", "ini"];
const pctColor = (p: number | null) => (p === null ? "#6b7280" : p >= 90 ? "var(--ok)" : p >= 75 ? "var(--warn)" : "var(--bad)");
const pesoTxt = (w: number) => `${Math.round(w * 1000) / 10}%`;

export default function CkuMedicion({ scope, delays, delaysOriginal, reproceso, reprocesoOriginal }: {
  scope: CkuScope;
  /** Mapas con PM ↔ CKU intercambiado (deciden qué penaliza) y los originales (etiqueta real). */
  delays: DelayMap; delaysOriginal: DelayMap; reproceso: DelayMap; reprocesoOriginal: DelayMap;
}) {
  const cumplimiento = useMemo(() => detalleCumplimiento(scope, delays, delaysOriginal), [scope, delays, delaysOriginal]);
  const calidad = useMemo(() => detalleCalidad(scope, reproceso, reprocesoOriginal), [scope, reproceso, reprocesoOriginal]);

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 border-t p-4 lg:grid-cols-2" style={{ borderColor: "var(--border)" }}>
      <Panel
        titulo="Cumplimiento de Entrega" medida="% a tiempo" detalle={cumplimiento}
        soloFase3
        regla="Un atraso se excusa si tiene un responsable asignado distinto de CKU; sin asignar (o CKU) penaliza. Un PML o Iniciativa con atraso excusado no cuenta; la Fase 3 de un Proyecto con atraso excusado cuenta como a tiempo."
        fila={(u) => <ResultadoCumplimiento u={u} />}
      />
      <Panel
        titulo="Calidad de Entregas" medida="nota promedio" esCalidad detalle={calidad}
        regla="PML e Iniciativas: 100 si tienen un responsable distinto de CKU, 0 si no. Proyectos (entregables de Fase 3): +50 si tienen un responsable distinto de CKU y +50 si se recuperó (ningún hito quedó con Limit Date después del fin de su CPM)."
        fila={(u) => <ResultadoCalidad u={u} />}
      />
    </div>
  );
}

function Panel({ titulo, medida, esCalidad = false, soloFase3 = false, detalle, regla, fila }: {
  titulo: string; medida: string; esCalidad?: boolean;
  /** Proyectos cuentan solo con su Fase 3 (Launch) — se avisa en el encabezado del panel. */
  soloFase3?: boolean;
  detalle: DetalleMedicion; regla: string; fila: (u: UnidadMedida) => React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{titulo}</span>
        <span className="text-[1.05rem] font-extrabold tabular-nums" style={{ color: pctColor(detalle.pct) }}>
          {detalle.pct !== null ? `${detalle.pct}%` : "—"}
        </span>
      </div>
      <p className="mb-2 text-[0.68rem] leading-snug text-[var(--text-muted)]">
        Medido como el EVM: cada fuente saca su {medida} y se combinan Iniciativas 10% · PML 20% · Proyectos 70%.
        El peso de una fuente sin unidades se reparte entre las demás.
        {soloFase3 && <strong className="font-semibold text-[var(--text-secondary)]"> En Proyectos solo cuenta la Fase 3 (Launch) de los proyectos con plantilla nueva.</strong>}
      </p>

      {/* Peso real y resultado de cada fuente */}
      <ul className="mb-3 space-y-0.5 text-[0.76rem]">
        {ORDEN.map((f) => {
          const r = detalle.fuentes.find((x) => x.fuente === f)!;
          return (
            <li key={f} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-[var(--text-primary)]">{FUENTE_LABEL[f]}</span>
              {r.total === 0 ? (
                <span className="text-[var(--text-disabled)]">sin unidades · no pesa</span>
              ) : (
                <>
                  <span className="text-[var(--text-muted)]">pesa {pesoTxt(r.pesoEfectivo ?? 0)}</span>
                  <span className="text-[var(--text-secondary)]">
                    {esCalidad ? `${r.total} unidades · ${r.buenas} con nota 100` : `${r.buenas} de ${r.total} a tiempo`}
                  </span>
                  <span className="font-bold tabular-nums" style={{ color: pctColor(r.pct) }}>{r.pct}{esCalidad ? "" : "%"}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {/* Unidades que entran */}
      {detalle.unidades.length === 0 ? (
        <div className="text-[0.8rem] text-[var(--text-disabled)]">Sin unidades medidas todavía</div>
      ) : (
        <details open>
          <summary className="cursor-pointer select-none text-[0.72rem] font-semibold text-[var(--accent)]">
            {detalle.unidades.length} unidades medidas
          </summary>
          <div className="mt-1.5 space-y-2">
            {ORDEN.map((f) => {
              const us = detalle.unidades.filter((u) => u.fuente === f);
              if (us.length === 0) return null;
              return (
                <div key={f}>
                  <div className="mb-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{FUENTE_LABEL[f]}</div>
                  <ul className="space-y-0.5">
                    {us.map((u) => (
                      <li key={u.id} className="rounded px-1.5 py-1 hover:bg-[var(--bg-hover)]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[0.78rem] text-[var(--text-primary)]" title={u.nombre}>{u.nombre}</div>
                            {u.fase && <div className="truncate text-[0.64rem] text-[var(--text-muted)]">{u.fase}</div>}
                          </div>
                          <div className="shrink-0 text-right">{fila(u)}</div>
                        </div>
                        {u.items && u.items.length > 0 && <ItemsDeFase items={u.items} />}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </details>
      )}
      <p className="mt-2 text-[0.64rem] leading-snug text-[var(--text-disabled)]">{regla}</p>
    </div>
  );
}

const resp = (r: string | null) => (r ? `Resp.: ${r}` : "sin responsable");

/** Los items (entregables) de una Fase 3: cuáles salieron a tiempo, cuáles con atraso y cuáles
 *  siguen sin veredicto. La fase sale con atraso si cualquiera de ellos (o de sus hitos) lo tiene. */
function ItemsDeFase({ items }: { items: ItemFase[] }) {
  const tone = (e: ItemFase["estado"]): Tone => (e === "atraso" ? "bad" : e === "ok" ? "ok" : "neutral");
  const txt = (e: ItemFase["estado"]) => (e === "atraso" ? "✕ Con atraso" : e === "ok" ? "✓ A tiempo" : "• Pendiente");
  return (
    <details open className="mt-1 border-l pl-2" style={{ borderColor: "var(--border)" }}>
      <summary className="cursor-pointer select-none text-[0.64rem] font-semibold text-[var(--text-muted)]">
        {items.length} items de la fase
      </summary>
      <ul className="mt-1 space-y-0.5">
        {items.map((it) => (
          <li key={it.id} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[0.72rem] text-[var(--text-secondary)]" title={it.nombre}>{it.nombre}</div>
              <div className="truncate text-[0.6rem] text-[var(--text-muted)]">
                {[it.status, it.deadline && `límite ${fmtDate(it.deadline)}`, it.hitosEvaluados > 0 && `${it.hitosAtrasados} de ${it.hitosEvaluados} hitos con atraso`]
                  .filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className="shrink-0"><Pill tone={tone(it.estado)} small>{txt(it.estado)}</Pill></div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ResultadoCumplimiento({ u }: { u: UnidadMedida }) {
  if (u.estado === "ok") return <Pill tone="ok" small>✓ A tiempo</Pill>;
  if (u.estado === "excusado") {
    return (
      <>
        <Pill tone="info" small title={u.cuenta ? "Cuenta como a tiempo" : "No entra en la cuenta"}>↩ Excusado{u.cuenta ? "" : " · no cuenta"}</Pill>
        <div className="text-[0.62rem] text-[var(--text-muted)]">{resp(u.responsable)}</div>
      </>
    );
  }
  return (
    <>
      <Pill tone="bad" small>✕ Con atraso</Pill>
      <div className="text-[0.62rem] text-[var(--text-muted)]">{[u.extra, resp(u.responsable)].filter(Boolean).join(" · ")}</div>
    </>
  );
}

function ResultadoCalidad({ u }: { u: UnidadMedida }) {
  const tone: Tone = u.nota === 100 ? "ok" : u.nota === 0 ? "bad" : "warn";
  return (
    <>
      <Pill tone={tone} small>{u.nota}</Pill>
      <div className="text-[0.62rem] text-[var(--text-muted)]">
        {[u.enCurso && "en curso", resp(u.responsable)].filter(Boolean).join(" · ")}
      </div>
    </>
  );
}
