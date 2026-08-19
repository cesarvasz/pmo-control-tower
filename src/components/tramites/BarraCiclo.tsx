"use client";

// Barra apilada del ciclo: una sola línea con el tiempo total del expediente,
// dividida por la cuota que aporta cada etapa. Responde a todos los filtros.
//
// El número grande es el Total REAL por expediente (métrica elegida). Las cuotas
// salen del tiempo agregado de cada etapa, no de aplicar la métrica a cada una
// por separado — así los tramos suman exactamente el total que encabeza
// la barra (ver composicionCiclo en lib/tramites.ts).

import { fmtHHMMSS, enDiasHabiles } from "@/lib/horario";
import type { Composicion, EtapaKey } from "@/lib/tramites";

const MIN_PCT_ETIQUETA = 7; // por debajo de esto la etiqueta no cabe dentro del tramo

export default function BarraCiclo({
  comp, metricaLabel, activa, onActivar, tramo,
}: {
  comp: Composicion;
  metricaLabel: string;
  activa: EtapaKey | null;
  onActivar: (k: EtapaKey | null) => void;
  /** Etiqueta del filtro global de "Tiempo" (ej. "T1–T3"); vacío si son todas. */
  tramo?: string;
}) {
  const dias = enDiasHabiles(comp.total);
  const visibles = comp.segmentos.filter((s) => s.pct > 0);

  return (
    <div className="viz-etapas rounded-xl border p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      {/* Encabezado: el total real del ciclo (o del tramo elegido) */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.66rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {metricaLabel} {tramo ? `del tramo ${tramo}` : "del ciclo completo"}
          </div>
          <div className="mt-0.5 flex items-baseline gap-2.5">
            <span className="tabular-nums text-[2rem] font-extrabold leading-none text-[var(--card-value-total)]">
              {fmtHHMMSS(comp.total)}
            </span>
            {dias != null && (
              <span className="text-[0.82rem] text-[var(--text-muted)]">{dias.toFixed(1)} días hábiles</span>
            )}
          </div>
        </div>
        <div className="text-right text-[0.72rem] text-[var(--text-muted)]">
          <div>{comp.n.toLocaleString("es-GT")} expedientes con el ciclo completo</div>
          <div style={{ color: comp.cobertura >= 0.9 ? "var(--ok)" : comp.cobertura >= 0.7 ? "var(--warn)" : "var(--bad)" }}>
            cobertura {Math.round(comp.cobertura * 100)}%
          </div>
        </div>
      </div>

      {comp.n === 0 ? (
        <div className="py-6 text-center text-[0.82rem] text-[var(--text-muted)]">
          Ningún expediente del recorte recorrió las {comp.segmentos.length} etapas.
        </div>
      ) : (
        <>
          {/* Corchete de los tramos con nombre (Ducafast: T1 a T3) */}
          {comp.grupos.filter((g) => g.anchoPct > 0).map((g) => (
            <div key={g.key} className="relative mb-1" style={{ height: 26 }}>
              <div
                className="absolute top-0"
                style={{ left: `${g.desdePct}%`, width: `${g.anchoPct}%` }}
                title={`${g.label} · ${g.etapas.join(" + ").toUpperCase()}\n${g.pct.toFixed(1)}% del ciclo · ${fmtHHMMSS(g.aporte)}\n${metricaLabel} real del tramo: ${fmtHHMMSS(g.valor)}`}
              >
                <div className="flex items-baseline justify-center gap-1.5 whitespace-nowrap pb-0.5 text-[0.7rem]">
                  <span className="font-bold text-[var(--text-primary)]">{g.label}</span>
                  <span className="tabular-nums font-semibold text-[var(--accent-light)]">{fmtHHMMSS(g.valor)}</span>
                  <span className="text-[var(--text-muted)]">· {g.pct.toFixed(0)}%</span>
                </div>
                {/* Corchete: patitas a los extremos y línea que une */}
                <div className="relative" style={{ height: 6 }}>
                  <div className="absolute bottom-0 left-0 right-0" style={{ height: 1.5, background: "var(--text-disabled)" }} />
                  <div className="absolute bottom-0 left-0" style={{ width: 1.5, height: 6, background: "var(--text-disabled)" }} />
                  <div className="absolute bottom-0 right-0" style={{ width: 1.5, height: 6, background: "var(--text-disabled)" }} />
                </div>
              </div>
            </div>
          ))}

          {/* La barra */}
          <div className="flex h-11 w-full overflow-hidden rounded-lg" onMouseLeave={() => onActivar(null)}>
            {visibles.map((s, i) => {
              const atenuado = activa != null && activa !== s.key;
              return (
                <div
                  key={s.key}
                  onMouseEnter={() => onActivar(s.key)}
                  title={`${s.corto} · ${s.label}\n${s.pct.toFixed(1)}% del ciclo · ${fmtHHMMSS(s.aporte)}`}
                  className="flex cursor-default items-center justify-center transition-opacity"
                  style={{
                    width: `${s.pct}%`,
                    background: s.color,
                    opacity: atenuado ? 0.35 : 1,
                    boxShadow: i < visibles.length - 1 ? "inset -1px 0 0 var(--bg-surface)" : undefined,
                  }}
                >
                  {s.pct >= MIN_PCT_ETIQUETA && (
                    <span className="px-1 text-[0.74rem] font-bold text-white drop-shadow">
                      {s.pct.toFixed(0)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Leyenda: cuota y tramo de tiempo de cada etapa */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {comp.segmentos.map((s) => {
              const atenuado = activa != null && activa !== s.key;
              return (
                <div
                  key={s.key}
                  onMouseEnter={() => onActivar(s.key)}
                  onMouseLeave={() => onActivar(null)}
                  className="rounded-lg px-2.5 py-2 transition-opacity"
                  style={{ background: "var(--bg-hover)", opacity: atenuado ? 0.45 : 1 }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                    <span className="text-[0.7rem] font-bold text-[var(--text-primary)]">{s.corto}</span>
                    <span className="ml-auto tabular-nums text-[0.72rem] font-bold" style={{ color: s.color }}>
                      {s.pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[0.66rem] text-[var(--text-muted)]" title={s.label}>
                    {s.label}
                  </div>
                  <div className="tabular-nums text-[0.78rem] font-semibold text-[var(--text-secondary)]">
                    {fmtHHMMSS(s.aporte)}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-[0.7rem] text-[var(--text-muted)]">
            Los {comp.segmentos.length} tramos suman exactamente el total de arriba. Las cuotas salen del tiempo
            agregado de cada etapa sobre los expedientes de ciclo completo; la {metricaLabel.toLowerCase()} de
            cada etapa por separado no sumaría el ciclo real (una mediana de etapas no es la mediana del total).
            {comp.grupos.filter((g) => g.anchoPct > 0).map((g) => (
              <span key={g.key}>
                {" "}El corchete <strong>{g.label}</strong> abarca {g.etapas.join(", ").toUpperCase()} y muestra
                la {metricaLabel.toLowerCase()} real del tramo por expediente ({fmtHHMMSS(g.valor)}), que por
                esa misma razón no es la suma de sus tres segmentos ({fmtHHMMSS(g.aporte)}).
              </span>
            ))}
          </p>
        </>
      )}
    </div>
  );
}
