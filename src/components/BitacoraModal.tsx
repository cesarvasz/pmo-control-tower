"use client";

// Popup de bitácora (Updates de Monday) para un item/hito de Proyectos: lista
// los comentarios existentes y permite publicar uno nuevo directo en Monday
// (mutación create_update, vía POST /api/proj-updates/[itemId]). El botón que
// abre este modal ya solo se muestra a quien tiene la acción "edit_proj_status"
// (ver /proyectos), así que este componente no vuelve a chequear permisos.

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { authedFetch } from "@/lib/api";
import type { ProjUpdate } from "@/types";

export default function BitacoraModal({ itemId, itemName, itemEmail, onClose }: {
  itemId: string;
  itemName: string;
  /** Email único del item/hito en Monday: cualquier correo enviado ahí se agrega
   *  como comentario a esta misma bitácora (canal alterno al textarea de abajo). */
  itemEmail?: string;
  onClose: () => void;
}) {
  const [updates, setUpdates] = useState<ProjUpdate[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState("");
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    if (!itemEmail) return;
    try {
      await navigator.clipboard.writeText(itemEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard no disponible — el email sigue visible para copiar a mano */ }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch(`/api/proj-updates/${itemId}`);
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
        const body = (await res.json()) as { updates: ProjUpdate[] };
        if (!cancelled) setUpdates(body.updates);
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Error al cargar la bitácora");
      }
    })();
    return () => { cancelled = true; };
  }, [itemId]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setSendErr("");
    try {
      const res = await authedFetch(`/api/proj-updates/${itemId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const resBody = (await res.json()) as { updates: ProjUpdate[] };
      setUpdates(resBody.updates);
      setText("");
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : "Error al enviar el comentario");
    }
    setSending(false);
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleString("es", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Modal open onClose={onClose} width={520} label="Bitácora">
      <div className="flex items-start justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0">
          <div className="text-[0.68rem] uppercase tracking-widest text-[var(--text-muted)]">Bitácora · Monday</div>
          <div className="mt-0.5 truncate text-[1rem] font-bold text-[var(--text-primary)]">{itemName}</div>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-lg px-2 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
      </div>

      {itemEmail && (
        <div className="border-b px-6 py-3" style={{ borderColor: "var(--border)" }}>
          <div className="text-[0.68rem] uppercase tracking-wide text-[var(--text-muted)]">
            O envía un correo a este email — se agrega solo a la bitácora
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              readOnly
              value={itemEmail}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border bg-[var(--bg-hover)] px-2.5 py-1.5 text-[0.72rem] text-[var(--text-secondary)]"
              style={{ borderColor: "var(--border)" }}
            />
            <button
              onClick={copyEmail}
              className="shrink-0 rounded-md border px-2.5 py-1.5 text-[0.7rem] font-semibold"
              style={{ borderColor: "var(--border)", color: copied ? "var(--ok)" : "var(--accent)" }}
            >
              {copied ? "✓ Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {loadErr ? (
          <div className="text-[0.8rem]" style={{ color: "var(--bad)" }}>{loadErr}</div>
        ) : updates === null ? (
          <div className="text-[0.82rem] text-[var(--text-muted)]">Cargando…</div>
        ) : updates.length === 0 ? (
          <div className="rounded-lg px-4 py-6 text-center text-[0.82rem] text-[var(--text-muted)]">
            Aún no hay comentarios en la bitácora.
          </div>
        ) : (
          <div className="space-y-3">
            {updates.map((u) => (
              <div key={u.id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-[0.75rem] font-semibold text-[var(--text-primary)]">{u.creatorName}</span>
                  <span className="shrink-0 text-[0.65rem] text-[var(--text-muted)]">{fmt(u.createdAt)}</span>
                </div>
                <div className="whitespace-pre-wrap text-[0.8rem] text-[var(--text-secondary)]">{u.textBody}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Escribe un comentario para la bitácora…"
          className="w-full resize-none rounded-lg border bg-[var(--bg-hover)] px-3 py-2 text-[0.82rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          style={{ borderColor: "var(--border)" }}
        />
        {sendErr && <div className="mt-2 text-[0.8rem]" style={{ color: "var(--bad)" }}>{sendErr}</div>}
        <div className="mt-2 flex justify-end">
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="rounded-lg px-4 py-2 text-[0.85rem] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {sending ? "Enviando…" : "Enviar comentario"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
