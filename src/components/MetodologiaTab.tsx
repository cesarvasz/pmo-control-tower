"use client";

// Pestaña "Metodología" de /calidad-cumplimiento. Una fila por PM y una columna por mes.
// Cada mes nuevo aparece solo, con la nota en 100% y su propia burbuja 💬; el Admin va bajando la
// nota a mano durante el mes y, con la burbuja, abre un pop up para escribir por
// qué (la explicación queda ligada a esa persona y a ese mes). La nota VIGENTE
// (última columna, la del mes en curso) es la que alimenta el componente
// "Cumplimiento Metodología VALOR" (peso 15) del KPI del PM — ver
// lib/metodologia.ts. Los no-admin ven las notas y las explicaciones de solo lectura.

import { useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { useMe } from "@/context/PermissionsContext";
import { authedFetch } from "@/lib/api";
import { hasAction } from "@/lib/permissions";
import {
  etiquetaMesCorta, metodologiaKey, metodologiaMeses, metodologiaNota,
  METODOLOGIA_NOTA_DEFECTO, type MetodologiaMap,
} from "@/lib/metodologia";
import { pmLabel } from "@/lib/players";
import { Pill } from "@/components/ui";
import Modal from "@/components/Modal";

const tono = (n: number) => (n >= 90 ? "ok" : n >= 75 ? "warn" : "bad");

const COMENTARIO_MAX_LEN = 500;

function NotaInput({ persona, mes, califs }: { persona: string; mes: string; califs: MetodologiaMap }) {
  const { setMetodologiaCalif, refresh } = useData();
  const key = metodologiaKey(mes, persona);
  const calif = califs[key];
  const guardada = calif?.score;
  const actual = guardada ?? METODOLOGIA_NOTA_DEFECTO;
  const [draft, setDraft] = useState<string>(String(actual));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = draft.trim();
    // Vacío = restablecer al 100% por defecto (se borra lo guardado, Y su comentario).
    const n = trimmed === "" ? null : Number(trimmed);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100)) { setDraft(String(actual)); return; }
    const next = n === null ? null : Math.round(n);
    if ((next ?? METODOLOGIA_NOTA_DEFECTO) === actual) { setDraft(String(actual)); return; }
    setSaving(true);
    setMetodologiaCalif(key, next); // optimista — conserva el comentario existente (ver DataContext)
    setDraft(String(next ?? METODOLOGIA_NOTA_DEFECTO));
    try {
      // Reenvía el comentario actual: el POST reemplaza el doc completo, así que
      // omitirlo lo borraría sin querer solo por cambiar la nota.
      const res = await authedFetch("/api/metodologia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona, mes, score: next, comentario: calif?.comentario ?? "" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      await refresh(); // revierte al estado real del servidor
      setDraft(String(actual));
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number" min={0} max={100} step={1} inputMode="numeric"
        value={draft} disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="w-16 rounded border bg-transparent px-1.5 py-0.5 text-right text-[0.78rem] font-semibold tabular-nums"
        style={{ borderColor: guardada != null ? "var(--accent)" : "var(--border)", color: "var(--text-primary)" }}
        title={guardada != null ? "Nota editada por el Admin" : "100% por defecto — aún sin cambios"}
      />
      <span className="text-[0.72rem] text-[var(--text-muted)]">%</span>
    </span>
  );
}

/** Burbuja 💬 junto a la nota de ese mes: al hacer clic abre un pop up con la explicación
 *  de por qué se puso esa nota (la escribe el Admin; los demás la leen). Resaltada cuando ya
 *  hay explicación. Reenvía la nota ACTUAL al guardar: el POST reemplaza el doc completo.
 *  Sin `canEdit` y sin explicación escrita no hay nada que mostrar, así que no se dibuja. */
function ComentarioBurbuja({ persona, mes, califs, canEdit }: { persona: string; mes: string; califs: MetodologiaMap; canEdit?: boolean }) {
  const { setMetodologiaCalif, refresh } = useData();
  const key = metodologiaKey(mes, persona);
  const calif = califs[key];
  const guardado = calif?.comentario ?? "";
  const score = calif?.score ?? METODOLOGIA_NOTA_DEFECTO;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(guardado);
  const [saving, setSaving] = useState(false);
  const [fallo, setFallo] = useState(false);

  if (!canEdit && !guardado) return null;

  const abrir = () => { setDraft(guardado); setFallo(false); setOpen(true); };
  const cerrar = () => { if (!saving) setOpen(false); };

  const guardar = async () => {
    const texto = draft.trim().slice(0, COMENTARIO_MAX_LEN);
    if (texto === guardado) { setOpen(false); return; }
    setSaving(true);
    setFallo(false);
    setMetodologiaCalif(key, score, texto); // optimista, misma nota
    try {
      const res = await authedFetch("/api/metodologia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona, mes, score, comentario: texto }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOpen(false);
    } catch {
      await refresh(); // revierte al estado real del servidor; el pop up sigue abierto con lo escrito
      setFallo(true);
    } finally {
      setSaving(false);
    }
  };

  const etiqueta = `${persona} · ${etiquetaMesCorta(mes)}`;
  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label={guardado ? `Ver la explicación de la nota de ${etiqueta}` : `Agregar explicación de la nota de ${etiqueta}`}
        title={guardado || "Agregar explicación de la nota"}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[0.78rem] leading-none transition-colors hover:bg-[var(--bg-hover)]"
        style={guardado
          ? { borderColor: "var(--accent)", color: "var(--accent)", background: "var(--bg-accent-soft)" }
          : { borderColor: "var(--border)", color: "var(--text-disabled)" }}
      >
        💬
      </button>

      <Modal open={open} onClose={cerrar} width={480} label={`Explicación de la nota · ${etiqueta}`}>
        <div className="shrink-0 border-b px-6 pb-4 pt-5" style={{ borderColor: "var(--border)", textAlign: "left" }}>
          <div className="text-[0.68rem] uppercase tracking-widest text-[var(--text-muted)]">Metodología VALOR · explicación de la nota</div>
          <div className="mt-0.5 text-[1.05rem] font-bold text-[var(--text-primary)]">{etiqueta}</div>
          <div className="mt-1 text-[0.8rem] text-[var(--text-secondary)]">
            Nota: <strong className="text-[var(--text-primary)]">{score}%</strong>{calif ? "" : " (100% por defecto)"}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5" style={{ textAlign: "left" }}>
          {canEdit ? (
            <>
              <textarea
                value={draft}
                disabled={saving}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={COMENTARIO_MAX_LEN}
                rows={7}
                placeholder="¿Por qué esta nota?"
                className="w-full resize-y rounded-lg border bg-transparent p-3 text-[0.85rem] outline-none focus:border-[var(--accent)]"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
              />
              <div className="mt-1.5 flex items-center justify-between gap-3 text-[0.68rem] text-[var(--text-muted)]">
                <span style={{ color: "var(--bad)" }}>{fallo ? "No se pudo guardar. Intenta de nuevo." : ""}</span>
                <span className="tabular-nums">{draft.length}/{COMENTARIO_MAX_LEN}</span>
              </div>
            </>
          ) : (
            <p className="whitespace-pre-wrap text-[0.88rem] leading-relaxed text-[var(--text-primary)]">{guardado}</p>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4" style={{ borderColor: "var(--border)" }}>
          <button
            type="button" onClick={cerrar} disabled={saving}
            className="rounded-lg border px-4 py-2 text-sm text-[var(--text-secondary)] disabled:opacity-60"
            style={{ borderColor: "var(--border)" }}
          >
            {canEdit ? "Cancelar" : "Cerrar"}
          </button>
          {canEdit && (
            <button
              type="button" onClick={guardar} disabled={saving}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}

export default function MetodologiaTab({ pms, califs }: { pms: string[]; califs: MetodologiaMap }) {
  const { me } = useMe();
  const canRate = !!me && hasAction(me.permissions, "manage_users");
  const meses = useMemo(() => metodologiaMeses(), []);
  const vigente = meses[meses.length - 1];

  return (
    <div>
      <p className="mb-3 text-[0.82rem] text-[var(--text-muted)]">
        Cada mes arranca en 100% y el Admin ajusta la nota durante el mes. La nota del mes en curso
        {vigente ? ` (${etiquetaMesCorta(vigente)})` : ""} es la que cuenta en el KPI de cada PM.
        Con la burbuja 💬 se escribe (o se lee) por qué se puso esa nota.
        {!canRate && " Solo un Admin puede editarla."}
      </p>

      {meses.length === 0 ? (
        <div className="rounded-xl border p-4 text-[0.82rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
          La medición de Metodología empieza en un mes futuro.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="pmo">
            <thead>
              <tr>
                <th>Persona</th>
                {meses.map((m) => (
                  <th key={m} style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                    {etiquetaMesCorta(m)}
                    {m === vigente && <span className="ml-1 text-[0.6rem] font-normal text-[var(--accent-light)]">· vigente</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pms.map((p) => (
                <tr key={p}>
                  <td className="pm-name">
                    {pmLabel(p) !== p ? (
                      <div className="leading-tight">
                        <div>{p}</div>
                        <div className="text-[0.66rem] text-[var(--text-muted)]">{pmLabel(p)}</div>
                      </div>
                    ) : p}
                  </td>
                  {meses.map((m) => {
                    const calif = califs[metodologiaKey(m, p)];
                    const rowKey = `${m}|${p}|${calif?.score ?? ""}|${calif?.comentario ?? ""}`;
                    return (
                      <td key={m} style={{ textAlign: "center" }}>
                        <span className="inline-flex items-center gap-1.5">
                          {canRate ? (
                            <NotaInput key={rowKey} persona={p} mes={m} califs={califs} />
                          ) : (
                            <Pill tone={tono(metodologiaNota(califs, p, m))}>{metodologiaNota(califs, p, m)}%</Pill>
                          )}
                          {/* Key estable (sin la nota/comentario): si cambiara, el pop up se cerraría al guardar. */}
                          <ComentarioBurbuja key={`${m}|${p}`} persona={p} mes={m} califs={califs} canEdit={canRate} />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
