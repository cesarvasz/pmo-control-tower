"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { authedFetch } from "@/lib/api";
import { useMe } from "@/context/PermissionsContext";
import { hasAction } from "@/lib/permissions";
import type { SurveyDoc } from "@/lib/survey";
import SurveyResultModal from "@/components/SurveyResultModal";
import { EmptyRow, ErrorBox, Loader, SectionHeader, StatCard } from "@/components/ui";

export default function EncuestasPage() {
  const [surveys, setSurveys] = useState<SurveyDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultToken, setResultToken] = useState<string | null>(null);
  const [onlyAnswered, setOnlyAnswered] = useState(false);
  const [busyToken, setBusyToken] = useState<string | null>(null);

  const { me } = useMe();
  const isAdmin = hasAction(me?.permissions, "manage_roles");

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
    if (!window.confirm("Se cancelará esta encuesta pendiente y el REQ volverá a mostrar el botón Enviar. ¿Continuar?")) return;
    setBusyToken(token);
    try {
      const res = await authedFetch(`/api/surveys/${token}`, { method: "DELETE" });
      if (res.ok) await load();
    } catch { /* noop */ }
    setBusyToken(null);
  };

  if (error) return <ErrorBox msg={error} />;
  if (!surveys) return <Loader />;

  const total = surveys.length;
  const answered = surveys.filter((s) => s.answered).length;
  const pending = total - answered;
  const rows = onlyAnswered ? surveys.filter((s) => s.answered) : surveys;

  const fmt = (iso: string) => (iso ? new Date(iso).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" }) : "—");

  return (
    <div>
      <div className="mb-7 grid grid-cols-3 gap-4 sm:max-w-xl">
        <StatCard value={total} label="Enviadas" />
        <StatCard value={answered} label="Contestadas" color="#10b981" borderColor="#10b981" active={onlyAnswered} onClick={() => setOnlyAnswered((v) => !v)} />
        <StatCard value={pending} label="Pendientes" color="#f59e0b" borderColor="#f59e0b" />
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
                <th>Estado</th><th>Enviada</th><th>Contestada</th><th></th>
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

      {resultToken && <SurveyResultModal token={resultToken} onClose={() => setResultToken(null)} />}
    </div>
  );
}
