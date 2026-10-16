"use client";

// Pestaña "Metodología" de /calidad-cumplimiento. Una fila por PM (más Cesar
// Vasquez, que aún no tiene tarjeta de KPI) y una columna por mes. Cada mes nuevo
// aparece solo, con la nota en 100%; el Admin la va bajando a mano durante el mes.
// La nota VIGENTE (última columna, la del mes en curso) es la que alimenta el
// componente "Cumplimiento Metodología VALOR" (peso 15) del KPI del PM — ver
// lib/metodologia.ts. Los no-admin ven las notas de solo lectura.

import { useMemo, useState } from "react";
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

function NotaInput({ persona, mes, califs }: { persona: string; mes: string; califs: MetodologiaMap }) {
  const { setMetodologiaCalif, refresh } = useData();
  const key = metodologiaKey(mes, persona);
  const guardada = califs[key]?.score;
  const actual = guardada ?? METODOLOGIA_NOTA_DEFECTO;
  const [draft, setDraft] = useState<string>(String(actual));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = draft.trim();
    // Vacío = restablecer al 100% por defecto (se borra lo guardado).
    const n = trimmed === "" ? null : Number(trimmed);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100)) { setDraft(String(actual)); return; }
    const next = n === null ? null : Math.round(n);
    if ((next ?? METODOLOGIA_NOTA_DEFECTO) === actual) { setDraft(String(actual)); return; }
    setSaving(true);
    setMetodologiaCalif(key, next); // optimista
    setDraft(String(next ?? METODOLOGIA_NOTA_DEFECTO));
    try {
      const res = await authedFetch("/api/metodologia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona, mes, score: next }),
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
                  {meses.map((m) => (
                    <td key={m} style={{ textAlign: "center" }}>
                      {canRate
                        ? <NotaInput key={`${m}|${p}|${califs[metodologiaKey(m, p)]?.score ?? ""}`} persona={p} mes={m} califs={califs} />
                        : <Pill tone={tono(metodologiaNota(califs, p, m))}>{metodologiaNota(califs, p, m)}%</Pill>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
