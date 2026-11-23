"use client";

// Timeline de una iniciativa: un indicador de pasos compacto (círculos unidos por una línea) con la fecha y el detalle debajo.
// Verde con ✓ = acción completada · anillo amarillo = la siguiente · gris = las que vienen después. Debajo, una barra
// «Siguiente paso» junta los botones de la acción amarilla (Agendar / Reprogramar / Cancelar reunión / Completar).
// Los pasos los arma dominio/nueva-iniciativa.ts (pasosIniciativa); aquí solo se dibujan.

import type { EstadoPaso, PasoTimeline } from "../../dominio/nueva-iniciativa";

const VERDE = "color-mix(in srgb, var(--ok) 82%, black)";
const ESTADO_TEXTO: Record<EstadoPaso, string> = { hecho: "completada", siguiente: "siguiente paso", pendiente: "pendiente" };
const foco = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

/** Botón de la barra de siguiente paso. `fuerte` = la acción principal. */
function BotonPaso({ fuerte, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { fuerte?: boolean }) {
  return (
    <button
      type="button" {...rest}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[0.78rem] font-semibold transition-colors hover:bg-[var(--bg-hover)] active:scale-[0.98] ${foco}`}
      style={fuerte
        ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#fff" }
        : { borderColor: "var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
    >
      {children}
    </button>
  );
}

export default function TimelineIniciativa({ pasos, onCompletar, onAgendar, onReprogramar, onCancelarReunion }: {
  pasos: PasoTimeline[];
  /** Si viene, la reunión amarilla (Meeting 1 o Meeting 2) lleva el botón «📅 Agendar». */
  onAgendar?(paso: PasoTimeline): void;
  /** Si vienen, la reunión amarilla ya agendada desde la app lleva «Reprogramar» y «Cancelar reunión». */
  onReprogramar?(paso: PasoTimeline): void;
  onCancelarReunion?(paso: PasoTimeline): void;
  /** Si viene, la acción amarilla que se puede completar lleva el botón «✓ Completar». */
  onCompletar?(paso: PasoTimeline): void;
}) {
  const sig = pasos.find((p) => p.estado === "siguiente");
  const esReunion = !!sig && (sig.clave === "meeting1" || sig.clave === "meeting2");
  const conAgendar = esReunion && !!onAgendar;
  const conReunion = esReunion && (!!onReprogramar || !!onCancelarReunion);
  const conCompletar = !!sig?.completable && !!onCompletar;

  return (
    <div className="flex flex-col gap-2.5">
      <ol className="flex w-full items-start overflow-x-auto pb-0.5" aria-label="Timeline de la iniciativa">
        {pasos.map((p, i) => {
          const actual = p.estado === "siguiente";
          return (
            <li
              key={p.clave} className="relative flex min-w-[108px] flex-1 flex-col items-center px-1 text-center"
              aria-label={`${p.accion}: ${ESTADO_TEXTO[p.estado]}${p.fecha ? `, ${p.detalle ? `${p.detalle} ` : ""}${p.fecha}` : ""}`}
            >
              {/* Tramo que une con el paso anterior (verde si ya se llegó hasta aquí) */}
              {i > 0 && (
                <span aria-hidden className="absolute left-[-50%] top-[11px] h-[2px] w-full" style={{ background: p.estado === "pendiente" ? "var(--border)" : VERDE }} />
              )}
              <span
                aria-hidden
                className="relative z-[1] grid h-6 w-6 place-items-center rounded-full text-[0.68rem] font-bold transition-colors"
                style={p.estado === "hecho"
                  ? { background: VERDE, color: "#fff" }
                  : actual
                    ? { background: "var(--bg-surface)", border: "2px solid var(--warn)", boxShadow: "0 0 0 4px color-mix(in srgb, var(--warn) 18%, transparent)" }
                    : { background: "var(--bg-surface)", border: "2px solid var(--border)", color: "var(--text-muted)" }}
              >
                {p.estado === "hecho" ? "✓" : actual ? <span className="h-2 w-2 rounded-full" style={{ background: "var(--warn)" }} /> : i + 1}
              </span>
              <span className={`mt-1.5 text-[0.8rem] leading-tight ${p.estado === "pendiente" ? "font-medium text-[var(--text-muted)]" : "font-semibold text-[var(--text-primary)]"}`}>
                {p.accion}
              </span>
              <span className="mt-0.5 text-[0.74rem] tabular-nums text-[var(--text-secondary)]">{p.fecha ?? "—"}</span>
              {p.detalle && <span className="text-[0.66rem] leading-tight text-[var(--text-muted)]">{p.detalle}</span>}
              {p.nota && <span className="mt-0.5 text-[0.68rem] font-medium leading-tight text-[var(--text-secondary)]">{p.nota}</span>}
            </li>
          );
        })}
      </ol>

      {/* Barra de la siguiente acción: lo que se puede hacer ahora, junto */}
      {sig && (conAgendar || conReunion || conCompletar) && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2"
          style={{ borderColor: "color-mix(in srgb, var(--warn) 40%, var(--border))", background: "color-mix(in srgb, var(--warn) 8%, var(--bg-surface))" }}
        >
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Siguiente paso</span>
            <span className="text-[0.85rem] font-semibold text-[var(--text-primary)]">{sig.accion}</span>
            {(sig.detalle || sig.fecha) && (
              <span className="truncate text-[0.76rem] text-[var(--text-secondary)]">{[sig.detalle, sig.fecha].filter(Boolean).join(" · ")}</span>
            )}
          </div>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {conAgendar && <BotonPaso fuerte onClick={() => onAgendar!(sig)} aria-label={`Agendar ${sig.accion}`}>📅 Agendar</BotonPaso>}
            {conReunion && onReprogramar && <BotonPaso onClick={() => onReprogramar(sig)} aria-label={`Reprogramar ${sig.accion}`}>📅 Reprogramar</BotonPaso>}
            {conReunion && onCancelarReunion && (
              <BotonPaso onClick={() => onCancelarReunion(sig)} aria-label={`Cancelar ${sig.accion}`}>Cancelar reunión</BotonPaso>
            )}
            {conCompletar && <BotonPaso fuerte={!conAgendar} onClick={() => onCompletar!(sig)} aria-label={`Completar ${sig.accion}`}>✓ Completar</BotonPaso>}
          </div>
        </div>
      )}
    </div>
  );
}
