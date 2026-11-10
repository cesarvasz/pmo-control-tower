"use client";

// Bitácora de un elemento (los "Updates" de Monday): leer, comentar, editar y borrar lo propio.

import { useState } from "react";
import { ErrorBox } from "@/components/ui";
import type { Comentario } from "../../dominio/bitacora";
import { Boton, enviar, estiloControl, Nota, useCarga } from "../comun";

const fmtFecha = (iso: string) => new Date(iso).toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" });

export default function Bitacora({ tableroId, elementoId, puedeComentar, esAdmin, onCambio }: {
  tableroId: string;
  elementoId: string;
  puedeComentar: boolean;
  esAdmin: boolean;
  onCambio(): void;
}) {
  const url = `/api/tableros/tableros/${tableroId}`;
  const { data, error, recargar } = useCarga<{ comentarios: Comentario[]; yo: string }>(`${url}/bitacora?elemento=${elementoId}`);
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
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

  return (
    <div className="flex flex-col gap-3">
      {puedeComentar && (
        <div className="flex flex-col gap-2">
          <textarea
            value={texto} rows={3} maxLength={10000} placeholder="Escribe una actualización…" onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && texto.trim()) void op({ op: "comentario.crear", elementoId, texto }).then((ok) => ok && setTexto("")); }}
            {...estiloControl}
          />
          <div className="flex items-center justify-between">
            <span className="text-[0.7rem] text-[var(--text-muted)]">Ctrl + Enter para publicar</span>
            <Boton primario disabled={!texto.trim() || enviando} onClick={async () => { if (await op({ op: "comentario.crear", elementoId, texto })) setTexto(""); }}>
              Publicar
            </Boton>
          </div>
        </div>
      )}
      {fallo && <Nota tono="mal">{fallo}</Nota>}
      {error && <ErrorBox msg={error} />}
      {!data && !error && <div className="text-[0.8rem] text-[var(--text-muted)]">Cargando…</div>}
      {data?.comentarios.length === 0 && <div className="text-[0.8rem] text-[var(--text-muted)]">Todavía no hay actualizaciones.</div>}
      <ol className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
        {data?.comentarios.map((c) => {
          const mio = c.autorId === data.yo;
          return (
            <li key={c.id} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="mb-1 flex flex-wrap items-baseline gap-x-2 text-[0.72rem] text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text-secondary)]">{c.autorNombre}</span>
                <span>{fmtFecha(c.creadoAt)}{c.editadoAt ? " · editado" : ""}{c.deMonday ? " · de Monday" : ""}</span>
                <span className="flex-1" />
                {mio && editando?.id !== c.id && <button type="button" className="hover:underline" onClick={() => setEditando({ id: c.id, texto: c.texto })}>Editar</button>}
                {(mio || esAdmin) && (
                  <button type="button" className="hover:text-[#ef4444] hover:underline"
                    onClick={() => { if (confirm("¿Borrar esta actualización?")) void op({ op: "comentario.borrar", comentarioId: c.id }); }}>
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
              ) : <div className="whitespace-pre-wrap text-[0.84rem] text-[var(--text-primary)]">{c.texto}</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
