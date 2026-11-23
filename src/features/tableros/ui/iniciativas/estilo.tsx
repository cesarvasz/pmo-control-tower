"use client";

// Piezas visuales compartidas por el pop-up de la iniciativa y sus paneles (Agendar, Completar, Invitados). Solo presentación.

import type { ReactNode } from "react";

/** Anillo de foco de teclado, igual en todos los controles del pop-up. */
export const foco = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

/** Etiqueta de un campo: corta, en minúscula normal y discreta. */
export const etiquetaPanel = "text-[0.74rem] font-medium text-[var(--text-secondary)]";

/** Control de formulario (input, select, textarea) del pop-up. */
export const controlPanel = `h-8 rounded-md border px-2 text-[0.82rem] text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--text-muted)] focus:border-[var(--accent)] disabled:opacity-60 ${foco}`;
export const estiloControlPanel = { borderColor: "var(--border)", background: "var(--bg-surface)" };

/** Tarjeta de un panel de acción (Agendar, Reprogramar, Completar) con su título y la «×» para cerrarlo. */
export function PanelAccion({ titulo, subtitulo, onCerrar, textoCerrar = "Cancelar", etiqueta, plano, children }: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  onCerrar(): void;
  /** Lo que lee el lector de pantalla en la «×». */
  textoCerrar?: string;
  etiqueta: string;
  /** Ocupa toda la pantalla del pop-up (sin tarjeta ni «×»: quien lo muestra pone su propio «← Volver»). */
  plano?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={plano ? "flex flex-col gap-5" : "flex flex-col gap-4 rounded-xl border p-4 shadow-sm"}
      style={plano ? undefined : { borderColor: "var(--border)", background: "var(--bg-base)" }} aria-label={etiqueta}
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className={`${plano ? "text-[1.05rem]" : "text-[0.92rem]"} font-semibold text-[var(--text-primary)]`}>{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-[0.76rem] text-[var(--text-muted)]">{subtitulo}</p>}
        </div>
        {!plano && <button
          type="button" onClick={onCerrar} aria-label={textoCerrar} title={textoCerrar}
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-[1rem] leading-none text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${foco}`}
        >
          ×
        </button>}
      </header>
      {children}
    </section>
  );
}

/** Iniciales de una persona («Ana López» → «AL»). */
export function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

/** Círculo con las iniciales; el color de fondo sale del nombre (siempre el mismo para la misma persona). */
export function Avatar({ nombre, tamano = 22, anillo }: { nombre: string; tamano?: number; anillo?: string }) {
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{
        width: tamano, height: tamano, fontSize: tamano * 0.42,
        // El texto se mezcla con el color de texto del tema: se lee bien en claro y en oscuro
        background: `hsl(${h} 55% 50% / 0.18)`, color: `color-mix(in srgb, hsl(${h} 60% 45%) 65%, var(--text-primary))`,
        boxShadow: anillo ? `0 0 0 2px ${anillo}` : undefined,
      }}
    >
      {iniciales(nombre)}
    </span>
  );
}
