"use client";

// Lo que comparten los editores de celda: sus props y un popover simple.

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import type { Columna } from "../../dominio/tablero";

export interface PersonaCorta { id: string; nombre: string; activo: boolean }

export interface ArchivoCelda { id: string; elementoId: string; columnaId: string | null; nombre: string; tamano: number | null }

/** Lo que necesitan las celdas que miran fuera de su elemento (relaciones, archivos, errores). */
export interface EntornoCelda {
  ligados: Record<string, { nombre: string; elementos: { id: string; nombre: string }[] }>;
  archivos: ArchivoCelda[];
  /** columnaId → error de su fórmula */
  errores: Map<string, string>;
  subir(elementoId: string, columnaId: string, archivo: File): Promise<void>;
  descargar(archivoId: string): Promise<void>;
  borrarArchivo(archivoId: string): Promise<void>;
}

export interface PropsCelda<V = unknown, C = unknown> {
  /** Elemento al que pertenece la celda. */
  elementoId?: string;
  entorno?: EntornoCelda;
  columna: Columna;
  /** Config ya validada por el tipo. */
  config: C;
  /** Valor ya validado (null = vacío). */
  valor: V | null;
  editable: boolean;
  personas: PersonaCorta[];
  /** null = vaciar la celda. */
  onCambiar(v: V | null): void;
}

export const claseCelda = "block min-h-[30px] w-full truncate px-2 py-1 text-left text-[0.82rem]";

/** Botón que ocupa toda la celda: muestra el valor y abre el editor (recibe el clic para anclar). */
export function BotonCelda({ editable, onClick, children, title }: {
  editable: boolean; onClick?: (e: MouseEvent<HTMLElement>) => void; children: ReactNode; title?: string;
}) {
  if (!editable) return <span className={claseCelda} title={title}>{children}</span>;
  return (
    <button type="button" onClick={onClick} title={title} className={`${claseCelda} rounded hover:bg-[var(--bg-hover)]`}>
      {children}
    </button>
  );
}

/** Rectángulo de la celda donde se hizo clic (para ubicar el popover). */
export const anclaDe = (e: MouseEvent<HTMLElement>) => e.currentTarget.getBoundingClientRect();

/**
 * Panel flotante junto a la celda. Va en posición fija (no lo recorta el scroll de la tabla);
 * se cierra con clic afuera, Escape o al desplazar la página.
 */
export function Popover({ ancla, onCerrar, children, ancho = 240 }: { ancla: DOMRect; onCerrar: () => void; children: ReactNode; ancho?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fuera = (e: globalThis.MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onCerrar(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    const scroll = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) onCerrar(); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [onCerrar]);
  const arriba = ancla.bottom + 320 > window.innerHeight && ancla.top > 320;
  const left = Math.max(8, Math.min(ancla.left, window.innerWidth - ancho - 8));
  return (
    <div
      ref={ref}
      className="fixed z-[300] rounded-lg border p-2 shadow-lg"
      style={{
        width: ancho, left, background: "var(--bg-surface)", borderColor: "var(--border)",
        ...(arriba ? { bottom: window.innerHeight - ancla.top + 4 } : { top: ancla.bottom + 4 }),
      }}
    >
      {children}
    </div>
  );
}

export const vacio = <span className="text-[var(--text-muted)] opacity-40">—</span>;
