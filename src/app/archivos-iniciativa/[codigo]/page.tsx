"use client";

// Página que abre el botón «📎 Subir archivo» del formulario «Nueva iniciativa» del bot de Google Chat (Chat no tiene un
// control para subir archivos dentro de un formulario). Sin sesión: la protege el código firmado del enlace. Cada archivo
// sube directo a Storage con una URL firmada (como la bitácora); al crear la iniciativa, el bot lo pega a su bitácora.
// Reglas en features/google-chat/flujos/iniciativa/subida.ts.

import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { tamanoLegible } from "@/features/tableros/dominio/bitacora";
import { API_SUBIDA } from "@/features/google-chat/flujos/iniciativa/subida";

interface Archivo { id: string; nombre: string; tamano: number | null }
interface Datos { email: string; archivos: Archivo[]; max: number; maxBytes: number }
interface EnCurso { clave: string; nombre: string; error: string | null }
type Fase = "cargando" | "lista" | "vencido" | "error";

async function pedir<T>(metodo: "GET" | "POST", codigo: string, cuerpo?: Record<string, unknown>): Promise<T> {
  const r = metodo === "GET"
    ? await fetch(`${API_SUBIDA}?c=${encodeURIComponent(codigo)}`, { cache: "no-store" })
    : await fetch(API_SUBIDA, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ c: codigo, ...cuerpo }) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
  return j;
}

export default function ArchivosIniciativaPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const [fase, setFase] = useState<Fase>("cargando");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [enCurso, setEnCurso] = useState<EnCurso[]>([]);
  const [error, setError] = useState("");
  const [encima, setEncima] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  // Mismo tema institucional que las encuestas.
  useEffect(() => { document.documentElement.setAttribute("data-theme", "c807"); }, []);

  const cargar = useCallback(async () => {
    try {
      setDatos(await pedir<Datos>("GET", codigo));
      setFase("lista");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setFase((e as { status?: number }).status === 410 ? "vencido" : "error");
    }
  }, [codigo]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial (sistema externo)
  useEffect(() => { void cargar(); }, [cargar]);

  const subiendo = enCurso.some((x) => !x.error);
  const lleno = !!datos && datos.archivos.length >= datos.max;

  async function subirUno(archivo: File, clave: string) {
    let archivoId: string | null = null;
    try {
      if (datos && archivo.size > datos.maxBytes) throw new Error("pasa de 50 MB");
      const p = await pedir<{ archivoId: string; ruta: string; token: string }>("POST", codigo, {
        op: "preparar", nombre: archivo.name, tamano: archivo.size, tipoMime: archivo.type,
      });
      archivoId = p.archivoId;
      const r = await getSupabaseBrowser().storage.from("tableros").uploadToSignedUrl(p.ruta, p.token, archivo, { contentType: archivo.type || undefined });
      if (r.error) throw new Error("no se pudo subir; revisa tu conexión e intenta de nuevo");
      await pedir("POST", codigo, { op: "confirmar", archivoId });
      setEnCurso((l) => l.filter((x) => x.clave !== clave));
    } catch (e) {
      // Si quedó a medias, se quita del borrador para que no ocupe lugar.
      if (archivoId) await pedir("POST", codigo, { op: "quitar", archivoId }).catch(() => {});
      const motivo = e instanceof Error ? e.message : "no se pudo subir";
      setEnCurso((l) => l.map((x) => (x.clave === clave ? { ...x, error: motivo } : x)));
    }
  }

  async function subir(lista: FileList | null) {
    if (!lista?.length || !datos) return;
    setError("");
    const libres = datos.max - datos.archivos.length;
    const archivos = Array.from(lista);
    if (archivos.length > libres) setError(`Solo caben ${libres} archivo${libres === 1 ? "" : "s"} más (máximo ${datos.max}).`);
    const tanda = archivos.slice(0, Math.max(libres, 0)).map((a, i) => ({ archivo: a, clave: `${Date.now()}-${i}-${a.name}` }));
    setEnCurso((l) => [...l.filter((x) => !x.error), ...tanda.map((t) => ({ clave: t.clave, nombre: t.archivo.name, error: null }))]);
    for (const t of tanda) {
      await subirUno(t.archivo, t.clave);
      await cargar();
    }
  }

  async function quitar(a: Archivo) {
    if (!confirm(`¿Quitar «${a.nombre}»?`)) return;
    try {
      await pedir("POST", codigo, { op: "quitar", archivoId: a.id });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar");
    }
  }

  function soltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setEncima(false);
    if (!lleno && !subiendo) void subir(e.dataTransfer.files);
  }

  return (
    <div className="flex min-h-screen justify-center px-4 py-8 sm:py-12" style={{ background: "var(--bg-base)" }}>
      <div className="h-fit w-full max-w-xl overflow-hidden rounded-2xl border shadow-xl" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <div className="border-b px-6 py-5 sm:px-8" style={{ borderColor: "var(--border)", background: "var(--bg-accent-soft)" }}>
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pmo-logo.png" alt="PMO" className="h-11 w-11 shrink-0 object-contain" />
            <div className="min-w-0">
              <div className="text-[0.66rem] uppercase tracking-[0.15em] text-[var(--text-muted)]">Nueva iniciativa · Google Chat</div>
              <div className="text-[1.15rem] font-bold leading-tight text-[var(--text-primary)]">Archivos de tu iniciativa</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-6 py-6 sm:px-8">
          {fase === "cargando" && <div className="py-6 text-center text-[0.85rem] text-[var(--text-muted)]">Cargando…</div>}
          {fase === "vencido" && <Aviso tono="warn">{error}</Aviso>}
          {fase === "error" && <Aviso tono="warn">{error || "Ocurrió un error."}</Aviso>}

          {fase === "lista" && datos && (
            <>
              <p className="text-[0.85rem] leading-relaxed text-[var(--text-secondary)]">
                Sube aquí el archivo con el detalle de tu iniciativa. Cuando la crees en Google Chat, se pega a su bitácora junto con la descripción.
              </p>

              <div
                onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
                onDragLeave={() => setEncima(false)}
                onDrop={soltar}
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors"
                style={{ borderColor: encima ? "var(--accent)" : "var(--border)", background: encima ? "var(--bg-accent-soft)" : "var(--bg-hover)" }}
              >
                <div className="text-3xl">📎</div>
                <button
                  type="button" disabled={lleno || subiendo} onClick={() => entrada.current?.click()}
                  className="rounded-lg px-4 py-2 text-[0.85rem] font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ background: "var(--accent)" }}
                >
                  {subiendo ? "Subiendo…" : "Elegir archivos"}
                </button>
                <div className="text-[0.74rem] text-[var(--text-muted)]">
                  {lleno ? `Ya subiste el máximo (${datos.max}).` : `o arrástralos aquí · hasta ${datos.max} archivos de ${tamanoLegible(datos.maxBytes)} cada uno`}
                </div>
                <input ref={entrada} type="file" multiple hidden onChange={(e) => { void subir(e.target.files); e.target.value = ""; }} />
              </div>

              {error && <Aviso tono="warn">{error}</Aviso>}

              {(datos.archivos.length > 0 || enCurso.length > 0) && (
                <ul className="flex flex-col gap-1.5">
                  {datos.archivos.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[0.82rem]" style={{ borderColor: "var(--border)" }}>
                      <span className="text-[var(--ok)]">✓</span>
                      <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]" title={a.nombre}>{a.nombre}</span>
                      <span className="shrink-0 text-[0.72rem] text-[var(--text-muted)]">{tamanoLegible(a.tamano)}</span>
                      <button type="button" aria-label={`Quitar ${a.nombre}`} disabled={subiendo} onClick={() => void quitar(a)}
                        className="shrink-0 px-1 text-[var(--text-muted)] hover:text-[var(--bad)] disabled:opacity-40">✕</button>
                    </li>
                  ))}
                  {enCurso.map((x) => (
                    <li key={x.clave} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[0.82rem]" style={{ borderColor: x.error ? "var(--bad)" : "var(--border)" }}>
                      <span className={x.error ? "text-[var(--bad)]" : "animate-pulse text-[var(--text-muted)]"}>{x.error ? "⚠️" : "⏳"}</span>
                      <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]" title={x.nombre}>{x.nombre}</span>
                      <span className="shrink-0 text-[0.72rem] text-[var(--text-muted)]">{x.error ?? "subiendo…"}</span>
                      {x.error && (
                        <button type="button" aria-label="Ocultar" onClick={() => setEnCurso((l) => l.filter((y) => y.clave !== x.clave))}
                          className="shrink-0 px-1 text-[var(--text-muted)]">✕</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {datos.archivos.length > 0 && !subiendo && (
                <Aviso tono="ok">
                  ✅ Listo. Vuelve a Google Chat y toca <b>«🔄 Actualizar»</b> para verlo en el formulario, o directamente <b>«Crear iniciativa»</b>. Ya puedes cerrar esta pestaña.
                </Aviso>
              )}
              <div className="text-[0.7rem] text-[var(--text-muted)]">Subiendo como {datos.email}. Este enlace vence en unas horas.</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Aviso({ tono, children }: { tono: "ok" | "warn"; children: ReactNode }) {
  return (
    <div className="rounded-lg border px-4 py-3 text-[0.83rem] leading-relaxed"
      style={tono === "ok"
        ? { borderColor: "var(--ok)", background: "var(--health-on-track-bg)", color: "var(--text-primary)" }
        : { borderColor: "var(--warn)", background: "var(--bg-hover)", color: "var(--text-primary)" }}>
      {children}
    </div>
  );
}
