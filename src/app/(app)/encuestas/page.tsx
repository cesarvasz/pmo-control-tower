"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { authedFetch } from "@/lib/api";
import { useMe } from "@/context/PermissionsContext";
import { useData } from "@/context/DataContext";
import { hasAction } from "@/lib/permissions";
import type { SurveyDoc } from "@/lib/survey";
import { listPMs } from "@/lib/players";
import { calcNpsFromRecords, npsCfg } from "@/lib/nps";
import SurveyResultModal from "@/components/SurveyResultModal";
import NpsCommentsReport from "@/components/NpsCommentsReport";
import NpsDimensionsChart from "@/components/NpsDimensionsChart";
import { EmptyRow, ErrorBox, Loader, SectionHeader, StatCard } from "@/components/ui";

export default function EncuestasPage() {
  const [surveys, setSurveys] = useState<SurveyDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultToken, setResultToken] = useState<string | null>(null);
  const [onlyAnswered, setOnlyAnswered] = useState(false);
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [tab, setTab] = useState<"enviadas" | "comentarios" | "dimensiones">("enviadas");
  const [pmFilter, setPmFilter] = useState(""); // "" = todos los PM

  const { me } = useMe();
  const isAdmin = hasAction(me?.permissions, "manage_roles");
  const { data } = useData();
  const allPMs = data ? listPMs(data.ini, data.req) : [];
  const npsFiltered = data ? calcNpsFromRecords(data.npsRecords, pmFilter || undefined) : null;
  const npsColor = npsCfg(npsFiltered?.nps ?? null)?.color ?? "var(--card-value-total)";

  const load = useCallback(async () => {
    setError(null);
    try {
      const t = await auth.currentUser?.getIdToken();
      if (!t) throw new Error("Sesión no válida.");
      const res = await fetch("/api/surveys", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const list = (await res.json()) as SurveyDoc[];
      list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setSurveys(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar encuestas");
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial (sistema externo)
  useEffect(() => { load(); }, [load]);

  const patch = async (token: string, body: { invalidated?: boolean; reopen?: boolean }) => {
    setBusyToken(token);
    try {
      const res = await authedFetch(`/api/surveys/${token}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (res.ok) await load();
    } catch { /* noop */ }
    setBusyToken(null);
  };
  const reopen = (token: string) => {
    if (window.confirm("Esto borrará la respuesta actual y permitirá volver a contestar el mismo enlace. ¿Continuar?")) {
      patch(token, { reopen: true });
    }
  };
  const cancel = async (token: string) => {
    if (!window.confirm("Se cancelará esta encuesta pendiente y el PML volverá a mostrar el botón Enviar. ¿Continuar?")) return;
    setBusyToken(token);
    try {
      const res = await authedFetch(`/api/surveys/${token}`, { method: "DELETE" });
      if (res.ok) await load();
    } catch { /* noop */ }
    setBusyToken(null);
  };

  if (error) return <ErrorBox msg={error} />;
  if (!surveys) return <Loader />;

  const byPm = pmFilter ? surveys.filter((s) => s.pm === pmFilter) : surveys;
  const total = byPm.length;
  const answered = byPm.filter((s) => s.answered).length;
  const pending = total - answered;
  const rows = onlyAnswered ? byPm.filter((s) => s.answered) : byPm;

  const fmt = (iso: string) => (iso ? new Date(iso).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" }) : "—");

  // Nota NPS (0-10) de cada encuesta contestada — une por token con su NpsRecord
  // (ver surveys.ts:listNpsRecords, que ahora incluye `token`). Ausente = no
  // contestada o no se pudo parsear el puntaje.
  const npsScoreByToken = new Map<string, number>();
  for (const r of data?.npsRecords ?? []) {
    if (!r.token) continue;
    const raw = r.answers?.nps;
    const score = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (Number.isFinite(score)) npsScoreByToken.set(r.token, score);
  }
  const npsScoreColor = (score: number) => (score >= 9 ? "#10b981" : score >= 7 ? "#f59e0b" : "#ef4444");

  return (
    <div>
      {/* Tabs: Enviadas (gestión de encuestas) · Comentarios (reporte NPS) */}
      <div className="mb-6 flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {([["enviadas", "Enviadas"], ["comentarios", "Comentarios NPS"], ["dimensiones", "Dimensiones"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="rounded-t-lg px-4 py-2 text-[0.85rem] font-semibold transition-colors"
            style={tab === key
              ? { color: "var(--accent)", borderBottom: "2px solid var(--accent)" }
              : { color: "var(--text-muted)" }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "comentarios" ? (
        <NpsCommentsReport />
      ) : tab === "dimensiones" ? (
        <NpsDimensionsChart />
      ) : (
      <>
      {/* Filtro por PM — acota la tabla y las tarjetas de abajo, y recalcula
          el NPS (ver npsFiltered arriba, vía calcNpsFromRecords). */}
      <div className="mb-5 flex items-center gap-2">
        <label className="text-[0.78rem] font-semibold text-[var(--text-secondary)]">PM:</label>
        <select
          value={pmFilter}
          onChange={(e) => setPmFilter(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}
        >
          <option value="">Todos los PM</option>
          {allPMs.map((pm) => <option key={pm} value={pm}>{pm}</option>)}
        </select>
      </div>

      <div className="mb-7 grid grid-cols-4 gap-4 sm:max-w-2xl">
        <StatCard value={total} label="Enviadas" />
        <StatCard value={answered} label="Contestadas" color="#10b981" borderColor="#10b981" active={onlyAnswered} onClick={() => setOnlyAnswered((v) => !v)} />
        <StatCard value={pending} label="Pendientes" color="#f59e0b" borderColor="#f59e0b" />
        <StatCard value={npsFiltered?.nps ?? "—"} label={pmFilter ? `NPS · ${pmFilter}` : "NPS · Todos"} color={npsColor} borderColor={npsColor} />
      </div>

      <SectionHeader title="Encuestas enviadas" badge={`${rows.length} items`} />

      {rows.length === 0 ? (
        <EmptyRow />
      ) : (
        <div className="table-wrap">
          <table className="pmo">
            <thead>
              <tr>
                <th>ID</th><th>Name</th><th>PM</th><th>Destinatario</th>
                <th>Estado</th><th>NPS</th><th>Enviada</th><th>Contestada</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.token}>
                  <td className="ini-id">{s.reqCode || "—"}</td>
                  <td className="ini-name">{s.reqName || "—"}</td>
                  <td className="pm-name">{s.pm || "—"}</td>
                  <td style={{ fontSize: ".8rem", color: "var(--text-secondary)" }}>
                    {s.assignedName || "—"}
                    <div className="text-[0.68rem] text-[var(--text-muted)]">{s.assignedEmail}</div>
                  </td>
                  <td>
                    {s.invalidated
                      ? <span style={{ color: "#ef4444", fontWeight: 600, whiteSpace: "nowrap" }}>⊘ Invalidada</span>
                      : s.answered
                        ? <span style={{ color: "#10b981", fontWeight: 600, whiteSpace: "nowrap" }}>✓ Contestada</span>
                        : <span style={{ color: "#f59e0b", fontWeight: 600, whiteSpace: "nowrap" }}>⏳ Pendiente</span>}
                  </td>
                  <td>
                    {npsScoreByToken.has(s.token)
                      ? <span style={{ color: npsScoreColor(npsScoreByToken.get(s.token)!), fontWeight: 700 }}>{npsScoreByToken.get(s.token)}/10</span>
                      : <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td style={{ fontSize: ".78rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{fmt(s.createdAt)}</td>
                  <td style={{ fontSize: ".78rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{s.answeredAt ? fmt(s.answeredAt) : "—"}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {s.answered ? (
                        <>
                          <button
                            onClick={() => setResultToken(s.token)}
                            className="rounded-md border px-2.5 py-1 text-[0.7rem] font-semibold whitespace-nowrap"
                            style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                          >
                            Ver respuestas
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => patch(s.token, { invalidated: !s.invalidated })}
                                disabled={busyToken === s.token}
                                className="rounded-md border px-2.5 py-1 text-[0.7rem] font-semibold whitespace-nowrap disabled:opacity-50"
                                style={{ borderColor: "var(--border)", color: s.invalidated ? "#10b981" : "#ef4444" }}
                              >
                                {s.invalidated ? "Validar" : "Invalidar"}
                              </button>
                              <button
                                onClick={() => reopen(s.token)}
                                disabled={busyToken === s.token}
                                className="rounded-md border px-2.5 py-1 text-[0.7rem] font-semibold whitespace-nowrap disabled:opacity-50"
                                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                              >
                                Volver a enviar
                              </button>
                            </>
                          )}
                        </>
                      ) : (
                        isAdmin && (
                          <button
                            onClick={() => cancel(s.token)}
                            disabled={busyToken === s.token}
                            className="rounded-md border px-2.5 py-1 text-[0.7rem] font-semibold whitespace-nowrap disabled:opacity-50"
                            style={{ borderColor: "var(--border)", color: "#ef4444" }}
                          >
                            Cancelar
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}

      {resultToken && <SurveyResultModal token={resultToken} onClose={() => setResultToken(null)} />}
    </div>
  );
}
