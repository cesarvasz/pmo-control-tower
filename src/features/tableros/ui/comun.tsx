"use client";

// Piezas compartidas por las pestañas de Tableros.

import { useCallback, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { authedFetch } from "@/lib/api";

async function pedir<T>(url: string): Promise<T> {
  const r = await authedFetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Error ${r.status}`);
  return j as T;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "Error");

/** GET a una ruta de /api/tableros con la sesión. `recargar` (desde un evento) vuelve a pedirla. */
export function useCarga<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    pedir<T>(url)
      .then((d) => { if (vivo) { setData(d); setError(null); } })
      .catch((e) => { if (vivo) setError(mensaje(e)); });
    return () => { vivo = false; };
  }, [url]);

  const recargar = useCallback(async () => {
    try {
      setData(await pedir<T>(url));
      setError(null);
    } catch (e) {
      setError(mensaje(e));
    }
  }, [url]);

  return { data, error, cargando: data === null && error === null, recargar };
}

/** Envía JSON y devuelve la respuesta; lanza con el mensaje del servidor si falla. */
export async function enviar<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const r = await authedFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Error ${r.status}`);
  return j as T;
}

export function Boton({ primario, children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { primario?: boolean }) {
  return (
    <button
      {...rest}
      className={`rounded-lg border px-3.5 py-1.5 text-[0.82rem] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      style={primario
        ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }
        : { borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-surface)" }}
    >
      {children}
    </button>
  );
}

export function Tarjeta({ titulo, children, accion }: { titulo?: ReactNode; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      {(titulo || accion) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titulo && <h3 className="text-[0.92rem] font-semibold text-[var(--text-primary)]">{titulo}</h3>}
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

export function Nota({ tono = "info", children }: { tono?: "info" | "ok" | "mal"; children: ReactNode }) {
  const estilo = tono === "mal"
    ? { background: "var(--pill-atrasado-bg)", borderColor: "var(--pill-atrasado-br)", color: "var(--pill-atrasado-fg)" }
    : tono === "ok"
      ? { background: "var(--pill-entiempo-bg)", borderColor: "var(--pill-entiempo-br)", color: "var(--pill-entiempo-fg)" }
      : { background: "var(--bg-accent-soft)", borderColor: "var(--border)", color: "var(--text-secondary)" };
  return <div className="rounded-lg border px-4 py-2.5 text-[0.82rem]" style={estilo} role="note">{children}</div>;
}

export const estiloControl = {
  className: "rounded-lg border px-2 py-1 text-[0.8rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]",
  style: { borderColor: "var(--border)", background: "var(--bg-base)" },
};
