"use client";

// Pestaña "Metodología" de /calidad-cumplimiento. Una fila por PM (más Cesar
// Vasquez, que aún no tiene tarjeta de KPI) y dos columnas por mes (Nota +
// Explicación). Cada mes nuevo aparece solo, con la nota en 100%; el Admin la
// va bajando a mano durante el mes. La nota VIGENTE (última columna, la del
// mes en curso) es la que alimenta el componente "Cumplimiento Metodología
// VALOR" (peso 15) del KPI del PM — ver lib/metodologia.ts. Los no-admin ven
// las notas y explicaciones de solo lectura.

import { Fragment, useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { useMe } from "@/context/PermissionsContext";
import { authedFetch } from "@/lib/api";
import { hasAction } from "@/lib/permissions";
import {
  etiquetaMesCorta, metodologiaKey, metodologiaMeses, metodologiaNota, metodologiaPersonas,
  METODOLOGIA_NOTA_DEFECTO, type MetodologiaMap,
} from "@/lib/metodologia";
import { pmLabel } from "@/lib/players";
import { Pill } from "@/components/ui";

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

/** Input de texto, siempre visible, con la explicación de por qué se puso esa
 *  nota. Reenvía la nota ACTUAL al guardar (mismo motivo que arriba: el POST
 *  reemplaza el doc completo). Sin `canEdit`, solo lectura. */
function ComentarioInput({ persona, mes, califs, canEdit }: { persona: string; mes: string; califs: MetodologiaMap; canEdit?: boolean }) {
  const { setMetodologiaCalif, refresh } = useData();
  const key = metodologiaKey(mes, persona);
  const calif = califs[key];
  const comentarioGuardado = calif?.comentario ?? "";
  const score = calif?.score ?? METODOLOGIA_NOTA_DEFECTO;
  const [draft, setDraft] = useState(comentarioGuardado);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = draft.trim().slice(0, COMENTARIO_MAX_LEN);
    if (trimmed === comentarioGuardado) { setDraft(comentarioGuardado); return; }
    setSaving(true);
    setMetodologiaCalif(key, score, trimmed); // optimista, mismo score
    try {
      const res = await authedFetch("/api/metodologia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona, mes, score, comentario: trimmed }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      await refresh();
      setDraft(comentarioGuardado);
    } finally {
      setSaving(false);
    }
  };

  return (
    <input
      type="text"
      value={draft}
      disabled={saving || !canEdit}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(comentarioGuardado);
      }}
      maxLength={COMENTARIO_MAX_LEN}
      placeholder={canEdit ? "¿Por qué esta nota?" : ""}
      title={comentarioGuardado}
      className="w-80 rounded border bg-transparent px-1.5 py-0.5 text-[0.74rem]"
      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
    />
  );
}

export default function MetodologiaTab({ pms, califs }: { pms: string[]; califs: MetodologiaMap }) {
  const { me } = useMe();
  const canRate = !!me && hasAction(me.permissions, "manage_users");
  const personas = useMemo(() => metodologiaPersonas(pms), [pms]);
  const meses = useMemo(() => metodologiaMeses(), []);
  const vigente = meses[meses.length - 1];

  return (
    <div>
      <p className="mb-3 text-[0.82rem] text-[var(--text-muted)]">
        Cada mes arranca en 100% y el Admin ajusta la nota durante el mes. La nota del mes en curso
        {vigente ? ` (${etiquetaMesCorta(vigente)})` : ""} es la que cuenta en el KPI de cada PM.
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
                <th rowSpan={2}>Persona</th>
                {meses.map((m) => (
                  <th key={m} colSpan={2} style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                    {etiquetaMesCorta(m)}
                    {m === vigente && <span className="ml-1 text-[0.6rem] font-normal text-[var(--accent-light)]">· vigente</span>}
                  </th>
                ))}
              </tr>
              <tr>
                {meses.map((m) => (
                  <Fragment key={m}>
                    <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>Nota</th>
                    <th style={{ textAlign: "left", whiteSpace: "nowrap" }}>Explicación</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {personas.map((p) => (
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
                      <Fragment key={m}>
                        <td style={{ textAlign: "center" }}>
                          {canRate ? (
                            <NotaInput key={rowKey} persona={p} mes={m} califs={califs} />
                          ) : (
                            <Pill tone={tono(metodologiaNota(califs, p, m))}>{metodologiaNota(califs, p, m)}%</Pill>
                          )}
                        </td>
                        <td>
                          <ComentarioInput key={rowKey} persona={p} mes={m} califs={califs} canEdit={canRate} />
                        </td>
                      </Fragment>
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
