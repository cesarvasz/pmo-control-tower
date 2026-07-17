"use client";

import { Component, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

/** Captura errores de render de las páginas para que un fallo no deje la app en
 *  blanco: muestra un fallback dentro del layout (sidebar/topbar siguen usables).
 *  Se resetea al navegar si se le pasa `key={pathname}`. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary capturó un error de render:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <div className="text-4xl opacity-30">⚠️</div>
          <div className="text-lg font-semibold text-[var(--text-primary)]">
            Algo salió mal en esta sección
          </div>
          <div className="max-w-md text-sm text-[var(--text-muted)]">
            {this.state.error.message || "Error inesperado al renderizar."}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors hover:bg-[var(--bg-hover)]"
            style={{ borderColor: "var(--border)", color: "var(--accent)" }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
