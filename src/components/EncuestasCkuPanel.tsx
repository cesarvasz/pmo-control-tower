"use client";

// Encuestas NPS de CKU en /encuestas (vista aparte de las de PM, en el color «info»). Un Admin ve las de todos los CKUs y
// las gestiona; un CKU ve solo las suyas (el servidor lo garantiza). El NPS de cada una sale de sus respuestas válidas.

import { useCallback, useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/api";
import { useData } from "@/context/DataContext";
import { calcNpsFromRecords, npsCfg } from "@/lib/nps";
import { enlaceEncuestaCku, type CkuSurveyDoc } from "@/lib/surveyCku";
import CkuSurveyResultModal from "@/components/CkuSurveyResultModal";
import { EmptyRow, ErrorBox, Loader, SectionHeader, StatCard } from "@/components/ui";

export default function EncuestasCkuPanel({ puedeGestionar }: {
  /** Invalidar respuestas y eliminar encuestas: un Admin (todas) o un CKU (las suyas; el servidor lo valida). */
  puedeGestionar: boolean;
}) {
  const { data, refresh } = useData();
  const [surveys, setSurveys] = useState<CkuSurveyDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultToken, setResultToken] = useState<string | null>(null);
  const [ckuFilter, setCkuFilter] = useState("");
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authedFetch("/api/surveys-cku");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setSurveys((await res.json()) as CkuSurveyDoc[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar las encuestas");
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial (sistema externo)
  useEffect(() => { load(); }, [load]);

  // Las respuestas de CKU del dashboard, por encuesta (token): para el NPS de cada una.
  const recordsPorToken = useMemo(() => {
    const m = new Map<string, NonNullable<typeof data>["npsRecords"]>();
    for (const r of data?.npsRecords ?? []) {
      if (!r.ckuEncuesta || !r.token) continue;
      (m.get(r.token) ?? m.set(r.token, []).get(r.token)!).push(r);
    }
    return m;
  }, [data]);
  // calcNpsFromRecords deja fuera lo que trae `cku` (es para el Player); aquí se calcula sobre las de UNA encuesta.
  const npsDe = (recs: NonNullable<typeof data>["npsRecords"]) => calcNpsFromRecords(recs.map((r) => ({ ...r, cku: undefined })));

  if (error) return <ErrorBox msg={error} />;
  if (!surveys) return <Loader />;

  const ckus = [...new Set(surveys.map((s) => s.cku))].sort();
  const rows = ckuFilter ? surveys.filter((s) => s.cku === ckuFilter) : surveys;
  const totalRespuestas = rows.reduce((s, x) => s + x.respuestas, 0);
  const recsVisibles = rows.flatMap((s) => recordsPorToken.get(s.token) ?? []);
  const npsGlobal = recsVisibles.length ? npsDe(recsVisibles) : null;
  const npsColor = npsCfg(npsGlobal?.nps ?? null)?.color ?? "var(--card-value-total)";

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" });
  const scoreColor = (v: number) => (v >= 50 ? "#10b981" : v >= 0 ? "#f59e0b" : "#ef4444");

  const copiar = async (token: string) => {
    try {
      await navigator.clipboard.writeText(enlaceEncuestaCku(window.location.origin, token));
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1800);
    } catch { /* noop */ }
  };
  const eliminar = async (token: string) => {
    const s = surveys?.find((x) => x.token === token);
    const con = s && s.respuestas > 0 ? `Se eliminarán también sus ${s.respuestas} respuesta${s.respuestas === 1 ? "" : "s"} y el NPS del Player cambiará. ` : "";
    if (!window.confirm(`¿Eliminar la encuesta «${s?.nombre ?? ""}»? ${con}Su enlace dejará de funcionar y no se puede deshacer.`)) return;
    setBusyToken(token);
    try {
      const res = await authedFetch(`/api/surveys-cku/${token}`, { method: "DELETE" });
      if (res.ok) { await load(); refresh(); }
    } catch { /* noop */ }
    setBusyToken(null);
  };

  return (
    <div>
      {ckus.length > 1 && (
        <div className="mb-5 flex items-center gap-2">
          <label className="text-[0.78rem] font-semibold text-[var(--text-secondary)]">CKU:</label>
          <select
            value={ckuFilter} onChange={(e) => setCkuFilter(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--info)]"
            style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}
          >
            <option value="">Todos los CKU</option>
            {ckus.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      <div className="mb-7 grid grid-cols-3 gap-4 sm:max-w-xl">
        <StatCard value={rows.length} label="Encuestas" color="var(--info)" borderColor="var(--info)" />
        <StatCard value={totalRespuestas} label="Respuestas" color="#10b981" borderColor="#10b981" />
        <StatCard value={npsGlobal?.nps ?? "—"} label={ckuFilter ? `NPS · ${ckuFilter}` : "NPS · CKU"} color={npsColor} borderColor={npsColor} />
      </div>

      <SectionHeader title="Encuestas de CKU" badge={`${rows.length} items`} />

      {rows.length === 0 ? (
        <EmptyRow />
      ) : (
        <div className="table-wrap">
          <table className="pmo">
            <thead>
              <tr><th>Encuesta</th><th>CKU</th><th>Respuestas</th><th>NPS</th><th>Creada</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const recs = recordsPorToken.get(s.token) ?? [];
                const n = recs.length ? npsDe(recs).nps : null;
                return (
                  <tr key={s.token} style={{ boxShadow: "inset 3px 0 0 var(--info)" }}>
                    <td className="ini-name">
                      <span className="mr-2 rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase" style={{ color: "var(--info)", background: "var(--bg-hover)" }}>CKU</span>
                      {s.nombre}
                    </td>
                    <td className="pm-name">{s.cku}</td>
                    <td>{s.respuestas}</td>
                    <td>{n === null ? <span style={{ color: "var(--text-muted)" }}>—</span> : <span style={{ color: scoreColor(n), fontWeight: 700 }}>{n}</span>}</td>
                    <td style={{ fontSize: ".78rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{fmt(s.createdAt)}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setResultToken(s.token)} disabled={s.respuestas === 0}
                          className="rounded-md border px-2.5 py-1 text-[0.7rem] font-semibold whitespace-nowrap disabled:opacity-40"
                          style={{ borderColor: "var(--border)", color: "var(--info)" }}
                        >
                          Ver respuestas
                        </button>
                        <button
                          onClick={() => copiar(s.token)}
                          className="rounded-md border px-2.5 py-1 text-[0.7rem] font-semibold whitespace-nowrap"
                          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                        >
                          {copied === s.token ? "¡Copiado!" : "Copiar enlace"}
                        </button>
                        {puedeGestionar && (
                          <button
                            onClick={() => eliminar(s.token)} disabled={busyToken === s.token}
                            className="rounded-md border px-2.5 py-1 text-[0.7rem] font-semibold whitespace-nowrap disabled:opacity-50"
                            style={{ borderColor: "var(--border)", color: "#ef4444" }}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {resultToken && (
        <CkuSurveyResultModal
          token={resultToken} puedeGestionar={puedeGestionar}
          onClose={() => setResultToken(null)}
          onChanged={() => { load(); refresh(); }}
        />
      )}
    </div>
  );
}
