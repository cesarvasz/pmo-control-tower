"use client";

// Bitácora de un elemento (los "Updates" de Monday): leer, comentar, responder, adjuntar archivos,
// editar y borrar lo propio.

import { useRef, useState } from "react";
import { ErrorBox } from "@/components/ui";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { armarHilos, MAX_ADJUNTOS_COMENTARIO, tamanoLegible, type AdjuntoComentario, type Comentario } from "../../dominio/bitacora";
import { Boton, enviar, estiloControl, Nota, useCarga } from "../comun";

const fmtFecha = (iso: string) => new Date(iso).toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" });
const MAX_ARCHIVO = 50 * 1024 * 1024;

/** Caja para escribir una actualización (o una respuesta) con archivos adjuntos. */
function Redactor({ url, elementoId, respuestaA, placeholder, onListo, onCancelar }: {
  url: string;
  elementoId: string;
  respuestaA?: string;
  placeholder: string;
  /** Se publicó. `conFallos`: algún archivo no se pudo subir (el comentario sí quedó). */
  onListo(conFallos: boolean): void;
  onCancelar?(): void;
}) {
  const [texto, setTexto] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const puede = (texto.trim() !== "" || archivos.length > 0) && !enviando;

  function agregar(lista: FileList | null) {
    if (!lista) return;
    const nuevos = [...archivos, ...Array.from(lista)];
    const grande = nuevos.find((a) => a.size > MAX_ARCHIVO);
    if (grande) { setFallo(`«${grande.name}» pasa de 50 MB`); return; }
    if (nuevos.length > MAX_ADJUNTOS_COMENTARIO) { setFallo(`Máximo ${MAX_ADJUNTOS_COMENTARIO} archivos por comentario`); return; }
    setFallo(null);
    setArchivos(nuevos);
    if (entrada.current) entrada.current.value = "";
  }

  async function publicar() {
    setFallo(null); setEnviando(true);
    try {
      const { id } = await enviar<{ id: string }>(url, "POST", {
        op: "comentario.crear", elementoId, texto, respuestaA, conArchivos: archivos.length > 0,
      });
      // Los archivos suben directo a Storage con una URL firmada, uno por uno.
      const fallidos: string[] = [];
      for (const a of archivos) {
        try {
          const p = await enviar<{ archivoId: string; ruta: string; token: string }>(url, "POST", {
            op: "archivo.preparar", elementoId, comentarioId: id, nombre: a.name, tamano: a.size, tipoMime: a.type,
          });
          const r = await getSupabaseBrowser().storage.from("tableros").uploadToSignedUrl(p.ruta, p.token, a, { contentType: a.type || undefined });
          if (r.error) throw new Error(r.error.message);
          await enviar(url, "POST", { op: "archivo.confirmar", archivoId: p.archivoId });
        } catch (e) {
          fallidos.push(`${a.name} (${e instanceof Error ? e.message : "error"})`);
        }
      }
      setTexto(""); setArchivos([]);
      if (fallidos.length) setFallo(`Se publicó, pero no se pudo subir: ${fallidos.join("; ")}`);
      onListo(fallidos.length > 0);
    } catch (e) {
      setFallo(e instanceof Error ? e.message : "Error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={texto} rows={respuestaA ? 2 : 3} maxLength={10000} placeholder={placeholder} onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && puede) void publicar(); }}
        {...estiloControl}
      />
      {archivos.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {archivos.map((a, i) => (
            <li key={`${a.name}-${i}`} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.72rem] text-[var(--text-secondary)]" style={{ borderColor: "var(--border)" }}>
              📎 {a.name} <span className="text-[var(--text-muted)]">{tamanoLegible(a.size)}</span>
              <button type="button" aria-label={`Quitar ${a.name}`} className="hover:text-[#ef4444]" onClick={() => setArchivos(archivos.filter((_, j) => j !== i))}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {fallo && <Nota tono="mal">{fallo}</Nota>}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={entrada} type="file" multiple hidden onChange={(e) => agregar(e.target.files)} />
        <Boton disabled={enviando || archivos.length >= MAX_ADJUNTOS_COMENTARIO} onClick={() => entrada.current?.click()}>📎 Adjuntar</Boton>
        <span className="flex-1 text-[0.7rem] text-[var(--text-muted)]">Ctrl + Enter para publicar</span>
        {onCancelar && <Boton onClick={onCancelar} disabled={enviando}>Cancelar</Boton>}
        <Boton primario disabled={!puede} onClick={publicar}>{enviando ? "Publicando…" : respuestaA ? "Responder" : "Publicar"}</Boton>
      </div>
    </div>
  );
}

export default function Bitacora({ tableroId, elementoId, puedeComentar, esAdmin, bloquearDeMonday = false, onCambio }: {
  tableroId: string;
  elementoId: string;
  puedeComentar: boolean;
  esAdmin: boolean;
  /** Convivencia con Monday: lo que viene de Monday (actualizaciones y archivos) no se borra aquí. */
  bloquearDeMonday?: boolean;
  onCambio(): void;
}) {
  const url = `/api/tableros/tableros/${tableroId}`;
  const { data, error, recargar } = useCarga<{ comentarios: Comentario[]; yo: string }>(`${url}/bitacora?elemento=${elementoId}`);
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function op(datos: Record<string, unknown>) {
    setFallo(null); setEnviando(true);
    try {
      await enviar(url, "POST", datos);
      await recargar();
      onCambio();
      return true;
    } catch (e) {
      setFallo(e instanceof Error ? e.message : "Error");
      return false;
    } finally {
      setEnviando(false);
    }
  }

  async function descargar(archivoId: string) {
    try {
      const { url: firmada } = await enviar<{ url: string }>(url, "POST", { op: "archivo.descargar", archivoId });
      window.open(firmada, "_blank", "noopener");
    } catch (e) { setFallo(e instanceof Error ? e.message : "Error"); }
  }

  function adjuntos(c: Comentario, yo: string) {
    if (!c.archivos.length) return null;
    const puedeBorrar = (a: AdjuntoComentario) => (a.subidoPor === yo || esAdmin) && !(bloquearDeMonday && a.deMonday);
    return (
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {c.archivos.map((a) => (
          <li key={a.id} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.74rem]" style={{ borderColor: "var(--border)" }}>
            <button type="button" className="max-w-[16rem] truncate text-[var(--accent)] hover:underline" title={`Descargar ${a.nombre}`} onClick={() => descargar(a.id)}>
              📎 {a.nombre}
            </button>
            <span className="text-[var(--text-muted)]">{tamanoLegible(a.tamano)}</span>
            {puedeBorrar(a) && (
              <button type="button" aria-label={`Borrar ${a.nombre}`} className="text-[var(--text-muted)] hover:text-[#ef4444]"
                onClick={() => { if (confirm(`¿Borrar el archivo «${a.nombre}»?`)) void op({ op: "archivo.borrar", archivoId: a.id }); }}>✕</button>
            )}
          </li>
        ))}
      </ul>
    );
  }

  function tarjeta(c: Comentario, yo: string, esRespuesta: boolean) {
    const mio = c.autorId === yo;
    return (
      <div className={esRespuesta ? "border-l-2 pl-3" : "rounded-lg border px-3 py-2"} style={{ borderColor: "var(--border-subtle)" }}>
        <div className="mb-1 flex flex-wrap items-baseline gap-x-2 text-[0.72rem] text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-secondary)]">{c.autorNombre}</span>
          <span>{fmtFecha(c.creadoAt)}{c.editadoAt ? " · editado" : ""}{c.deMonday ? " · de Monday" : ""}</span>
          <span className="flex-1" />
          {puedeComentar && !esRespuesta && respondiendo !== c.id && <button type="button" className="hover:underline" onClick={() => setRespondiendo(c.id)}>Responder</button>}
          {mio && editando?.id !== c.id && <button type="button" className="hover:underline" onClick={() => setEditando({ id: c.id, texto: c.texto })}>Editar</button>}
          {(mio || esAdmin) && !(bloquearDeMonday && c.deMonday) && (
            <button type="button" className="hover:text-[#ef4444] hover:underline"
              onClick={() => { if (confirm(esRespuesta ? "¿Borrar esta respuesta?" : "¿Borrar esta actualización (con sus respuestas y archivos)?")) void op({ op: "comentario.borrar", comentarioId: c.id }); }}>
              Borrar
            </button>
          )}
        </div>
        {editando?.id === c.id ? (
          <div className="flex flex-col gap-1.5">
            <textarea value={editando.texto} rows={3} onChange={(e) => setEditando({ id: c.id, texto: e.target.value })} {...estiloControl} />
            <div className="flex justify-end gap-1.5">
              <Boton onClick={() => setEditando(null)}>Cancelar</Boton>
              <Boton primario disabled={enviando} onClick={async () => { if (await op({ op: "comentario.editar", comentarioId: c.id, texto: editando.texto })) setEditando(null); }}>Guardar</Boton>
            </div>
          </div>
        ) : c.texto
          ? <div className="whitespace-pre-wrap text-[0.84rem] text-[var(--text-primary)]">{c.texto}</div>
          : c.archivos.length > 0 ? null : <div className="text-[0.8rem] text-[var(--text-muted)]">(sin texto)</div>}
        {adjuntos(c, yo)}
      </div>
    );
  }

  const hilos = data ? armarHilos(data.comentarios) : [];
  const alCambiar = () => { void recargar(); onCambio(); };

  return (
    <div className="flex flex-col gap-3">
      {puedeComentar && <Redactor url={url} elementoId={elementoId} placeholder="Escribe una actualización…" onListo={alCambiar} />}
      {fallo && <Nota tono="mal">{fallo}</Nota>}
      {error && <ErrorBox msg={error} />}
      {!data && !error && <div className="text-[0.8rem] text-[var(--text-muted)]">Cargando…</div>}
      {data && hilos.length === 0 && <div className="text-[0.8rem] text-[var(--text-muted)]">Todavía no hay actualizaciones.</div>}
      <ol className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
        {data && hilos.map(({ comentario: c, respuestas }) => (
          <li key={c.id} className="flex flex-col gap-2">
            {tarjeta(c, data.yo, false)}
            {(respuestas.length > 0 || respondiendo === c.id) && (
              <div className="ml-4 flex flex-col gap-2">
                {respuestas.map((r) => <div key={r.id}>{tarjeta(r, data.yo, true)}</div>)}
                {respondiendo === c.id && (
                  <Redactor url={url} elementoId={elementoId} respuestaA={c.id} placeholder="Escribe una respuesta…"
                    onListo={(conFallos) => { alCambiar(); if (!conFallos) setRespondiendo(null); }} onCancelar={() => setRespondiendo(null)} />
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
