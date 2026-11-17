"use client";

// Timeline de una iniciativa: flechas encadenadas con la acción adentro y la fecha debajo (unidas por una línea
// punteada). Verde = acción completada · amarillo = la siguiente · gris = las que vienen después.
// Los pasos los arma dominio/nueva-iniciativa.ts (pasosIniciativa); aquí solo se dibujan.

import type { EstadoPaso, PasoTimeline } from "../../dominio/nueva-iniciativa";

const PUNTA = 18; // px de la punta de cada flecha (y de la muesca de la siguiente)

/** Colores derivados del tema: el verde se oscurece para que el texto blanco se lea; el amarillo lleva texto oscuro. */
const COLOR: Record<EstadoPaso, { fondo: string; texto: string; linea: string }> = {
  hecho: { fondo: "color-mix(in srgb, var(--ok) 82%, black)", texto: "#fff", linea: "var(--ok)" },
  siguiente: { fondo: "var(--warn)", texto: "color-mix(in srgb, var(--warn) 18%, black)", linea: "var(--warn)" },
  pendiente: { fondo: "var(--bg-hover)", texto: "var(--text-muted)", linea: "var(--border)" },
};

const ESTADO_TEXTO: Record<EstadoPaso, string> = { hecho: "completada", siguiente: "siguiente paso", pendiente: "pendiente" };

function forma(primera: boolean) {
  const muesca = primera ? "" : `, ${PUNTA}px 50%`;
  return `polygon(0 0, calc(100% - ${PUNTA}px) 0, 100% 50%, calc(100% - ${PUNTA}px) 100%, 0 100%${muesca})`;
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
  return (
    <ol className="flex w-full overflow-x-auto pb-1" aria-label="Timeline de la iniciativa">
      {pasos.map((p, i) => {
        const c = COLOR[p.estado];
        return (
          <li
            key={p.clave} className="flex min-w-[150px] flex-[0_1_230px] flex-col items-center"
            style={i > 0 ? { marginLeft: -(PUNTA - 6) } : undefined}
            aria-label={`${p.accion}: ${ESTADO_TEXTO[p.estado]}${p.fecha ? `, ${p.detalle ? `${p.detalle} ` : ""}${p.fecha}` : ""}`}
          >
            <div className="w-full" style={{ filter: "drop-shadow(0 2px 3px rgb(0 0 0 / 0.18))" }}>
              <div
                className="flex h-12 w-full items-center justify-center text-[0.95rem] font-extrabold tracking-wide"
                style={{ clipPath: forma(i === 0), background: c.fondo, color: c.texto, paddingLeft: i === 0 ? 8 : PUNTA + 4, paddingRight: PUNTA + 4 }}
              >
                {p.estado === "hecho" && <span aria-hidden className="mr-1.5">✓</span>}
                {p.accion}
              </div>
            </div>
            {/* Línea punteada hasta la fecha, como en el diseño de referencia */}
            <span aria-hidden className="h-4 border-l-2 border-dotted" style={{ borderColor: c.linea}} />
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: c.linea}} />
            <div className="mt-1 flex flex-col items-center text-center">
              <span className="text-[0.82rem] font-bold text-[var(--text-primary)]">{p.fecha ?? "—"}</span>
              {p.detalle && <span className="text-[0.68rem] uppercase tracking-wide text-[var(--text-muted)]">{p.detalle}</span>}
              {p.nota && <span className="mt-0.5 text-[0.72rem] font-semibold text-[var(--text-secondary)]">{p.nota}</span>}
            </div>
            {p.estado === "siguiente" && (p.clave === "meeting1" || p.clave === "meeting2") && onAgendar && (
              <button
                type="button" onClick={() => onAgendar(p)} aria-label={`Agendar ${p.accion}`}
                className="mt-2 rounded-full border px-3 py-1 text-[0.75rem] font-bold transition-colors hover:bg-[var(--bg-hover)]"
                style={{ borderColor: COLOR.siguiente.linea, color: "var(--text-primary)", background: "var(--bg-base)" }}
              >
                📅 Agendar
              </button>
            )}
            {p.estado === "siguiente" && (p.clave === "meeting1" || p.clave === "meeting2") && (onReprogramar || onCancelarReunion) && (
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {onReprogramar && (
                  <button
                    type="button" onClick={() => onReprogramar(p)} aria-label={`Reprogramar ${p.accion}`}
                    className="rounded-full border px-3 py-1 text-[0.75rem] font-bold transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ borderColor: COLOR.siguiente.linea, color: "var(--text-primary)", background: "var(--bg-base)" }}
                  >
                    📅 Reprogramar
                  </button>
                )}
                {onCancelarReunion && (
                  <button
                    type="button" onClick={() => onCancelarReunion(p)} aria-label={`Cancelar ${p.accion}`}
                    className="rounded-full border px-3 py-1 text-[0.75rem] font-bold transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-base)" }}
                  >
                    Cancelar reunión
                  </button>
                )}
              </div>
            )}
            {p.estado === "siguiente" && p.completable && onCompletar && (
              <button
                type="button" onClick={() => onCompletar(p)} aria-label={`Completar ${p.accion}`}
                className="mt-2 rounded-full border px-3 py-1 text-[0.75rem] font-bold transition-colors hover:bg-[var(--bg-hover)]"
                style={{ borderColor: COLOR.siguiente.linea, color: "var(--text-primary)", background: "var(--bg-base)" }}
              >
                ✓ Completar
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
