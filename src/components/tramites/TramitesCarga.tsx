"use client";

// Sección 7 — Plantilla y carga. Personas REALES por periodo contra el tiempo
// medido (44 h por persona a la semana).
//
// La plantilla ya no se estima: se cuenta. Son las personas distintas que
// aparecen como Usuario o Analista en los expedientes de cada mes, sin duplicar
// a quien hace ambos papeles y sin contar ejecutores automatizados.
//
// La advertencia NO es decorativa: las etapas miden TIEMPO TRANSCURRIDO, no horas
// trabajadas. Un expediente abierto 5 h no consumió 5 h de una persona; en ese
// lapso llevaba otros en paralelo. La utilización por encima del 100% es
// precisamente la medida de ese paralelismo.

import type { FilaCarga } from "@/lib/tramites";

const fmtH = (h: number) => `${Math.round(h).toLocaleString("es-GT")} h`;
const fmtN = (n: number) => n.toLocaleString("es-GT");

export default function TramitesCarga({
  filas, simultaneos, onSimultaneos,
}: {
  filas: FilaCarga[];
  simultaneos: number;
  onSimultaneos: (n: number) => void;
}) {
  if (filas.length === 0) {
    return <p className="text-[0.82rem] text-[var(--text-muted)]">Sin periodos en el recorte actual.</p>;
  }

  const plantillas = filas.map((f) => f.personas);
  const minP = Math.min(...plantillas), maxP = Math.max(...plantillas);
  const promP = plantillas.reduce((s, x) => s + x, 0) / plantillas.length;
  const maxUso = Math.max(1, ...filas.map((f) => f.utilizacion));
  const excedidos = filas.filter((f) => f.excede);

  // Simultaneidad implícita: cuántos expedientes en paralelo explicarían el reloj.
  const usoMedio = filas.reduce((s, f) => s + f.utilizacion, 0) / filas.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Resumen de plantilla real */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { l: "Plantilla promedio", v: promP.toFixed(1), s: `entre ${minP} y ${maxP} personas` },
          { l: "Usuarios distintos", v: fmtN(Math.max(...filas.map((f) => f.usuarios))), s: "máximo en un periodo" },
          { l: "Analistas distintos", v: fmtN(Math.max(...filas.map((f) => f.analistas))), s: "máximo en un periodo" },
          { l: "Utilización media", v: `${Math.round(usoMedio * 100)}%`, s: usoMedio > 1 ? `≈ ${usoMedio.toFixed(1)} exp. en paralelo` : "dentro de jornada" },
        ].map((c) => (
          <div key={c.l} className="rounded-xl border p-3"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="text-[0.64rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{c.l}</div>
            <div className="mt-0.5 tabular-nums text-[1.4rem] font-extrabold leading-tight text-[var(--text-primary)]">{c.v}</div>
            <div className="text-[0.68rem] text-[var(--text-muted)]">{c.s}</div>
          </div>
        ))}
      </div>

      {/* Advertencia visible en la propia UI */}
      <div className="rounded-lg border px-4 py-3 text-[0.8rem]"
        style={{ background: "var(--pill-parahoy-bg)", borderColor: "var(--pill-parahoy-br)", color: "var(--pill-parahoy-fg)" }}>
        <strong>Las etapas miden tiempo transcurrido, no horas trabajadas.</strong>{" "}
        Un File abierto 5 h no consumió 5 h de una persona: durante ese lapso llevaba otros en
        paralelo. Por eso la utilización supera el 100% incluso contra la plantilla real —{" "}
        <strong>ese múltiplo es el paralelismo</strong>, no falta de personal. Ajusta{" "}
        <strong>Files simultáneos</strong> hasta que la utilización se acerque al 100%: ese
        valor es la carga observada.
      </div>

      {/* Control */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Files simultáneos por persona
          </label>
          <div className="flex items-center gap-2.5">
            <input
              type="range" min={1} max={40} step={1} value={simultaneos}
              onChange={(e) => onSimultaneos(Number(e.target.value))}
              style={{ width: 200, accentColor: "var(--accent)" }}
            />
            <input
              type="number" min={1} max={200} value={simultaneos}
              onChange={(e) => onSimultaneos(Math.max(1, Number(e.target.value) || 1))}
              className="w-20 rounded-lg border px-2 py-1.5 text-sm outline-none"
              style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
          </div>
        </div>
        <p className="text-[0.72rem] text-[var(--text-muted)]">
          {simultaneos === 1
            ? "1 = tiempo de reloj sin corregir por paralelismo"
            : `cada persona lleva ${simultaneos} Files a la vez`}
        </p>
      </div>

      <p className="text-[0.78rem] text-[var(--text-secondary)]">
        {excedidos.length === 0
          ? "Ningún periodo supera la capacidad de su plantilla real."
          : `${excedidos.length} de ${filas.length} periodos piden más horas de las que la plantilla real puede dar.`}
      </p>

      <div className="table-wrap">
        <table className="pmo">
          <thead>
            <tr>
              <th>Periodo</th>
              <th style={{ textAlign: "center" }}>Expedientes</th>
              <th style={{ textAlign: "center" }} title="Personas distintas: Usuario o Analista, sin duplicar">Personas</th>
              <th style={{ textAlign: "center" }}>Usuarios</th>
              <th style={{ textAlign: "center" }}>Analistas</th>
              <th style={{ textAlign: "center" }} title="Actuaron como Usuario y Analista en el mismo periodo">Ambos</th>
              <th style={{ textAlign: "center" }}>Exp./persona</th>
              <th style={{ textAlign: "center" }}>Demanda</th>
              <th style={{ textAlign: "center" }} title="Personas × 44 h/semana">Capacidad</th>
              <th style={{ textAlign: "center" }}>h/persona</th>
              <th style={{ minWidth: 150 }}>Utilización</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const color = f.utilizacion > 1 ? "var(--bad)" : f.utilizacion > 0.85 ? "var(--warn)" : "var(--ok)";
              return (
                <tr key={f.clave}>
                  <td className="whitespace-nowrap font-semibold">{f.label}</td>
                  <td className="tabular-nums text-center">{fmtN(f.volumen)}</td>
                  <td className="tabular-nums text-center font-bold">{fmtN(f.personas)}</td>
                  <td className="tabular-nums text-center text-[var(--text-secondary)]">{fmtN(f.usuarios)}</td>
                  <td className="tabular-nums text-center text-[var(--text-secondary)]">{fmtN(f.analistas)}</td>
                  <td className="tabular-nums text-center text-[var(--text-muted)]">{f.ambos || "—"}</td>
                  <td className="tabular-nums text-center">{f.expedientesPorPersona.toFixed(1)}</td>
                  <td className="tabular-nums text-center text-[var(--text-secondary)]">{fmtH(f.demandaAjustada)}</td>
                  <td className="tabular-nums text-center text-[var(--text-muted)]">{fmtH(f.capacidadHoras)}</td>
                  <td className="tabular-nums text-center">{fmtH(f.horasPorPersona)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
                        <div className="h-full rounded-full"
                          style={{ width: `${Math.min(100, (f.utilizacion / maxUso) * 100)}%`, background: color }} />
                        {/* Línea del 100% de jornada */}
                        <div className="absolute top-0 h-full"
                          style={{ left: `${Math.min(100, (1 / maxUso) * 100)}%`, width: 2, background: "var(--text-primary)", opacity: 0.55 }}
                          title="100% de la jornada disponible" />
                      </div>
                      <span className="tabular-nums text-[0.72rem] font-bold" style={{ color, minWidth: 46, textAlign: "right" }}>
                        {Math.round(f.utilizacion * 100)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[0.7rem] text-[var(--text-muted)]">
        Plantilla contada, no estimada: personas distintas que aparecen en los expedientes de cada
        periodo. Los ejecutores automatizados quedan fuera del conteo (tramitan, pero no consumen
        jornada). La línea vertical de cada barra marca el 100% de la jornada disponible.
      </p>
    </div>
  );
}
