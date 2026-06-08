"use client";

import { useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/api";
import type { AnalyticsData, PageView } from "@/app/api/analytics/data/route";
import { Loader, ErrorBox, SectionHeader } from "@/components/ui";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const selectCls =
  "rounded-lg border bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]";

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterUser, setFilterUser] = useState("");
  const [filterPage, setFilterPage] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await authedFetch("/api/analytics/data");
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const users = useMemo(
    () => [...new Set((data?.views ?? []).map((v) => v.userEmail))].sort(),
    [data],
  );
  const pages = useMemo(
    () =>
      [...new Map((data?.views ?? []).map((v) => [v.page, v.pageLabel])).entries()]
        .sort((a, b) => a[1].localeCompare(b[1])),
    [data],
  );

  const rows: PageView[] = useMemo(() => {
    if (!data) return [];
    return data.views.filter(
      (v) =>
        (!filterUser || v.userEmail === filterUser) &&
        (!filterPage || v.page === filterPage),
    );
  }, [data, filterUser, filterPage]);

  if (loading) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Analíticas" />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className={selectCls}
          style={{ borderColor: "var(--border)" }}
        >
          <option value="">Todos los usuarios</option>
          {users.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>

        <select
          value={filterPage}
          onChange={(e) => setFilterPage(e.target.value)}
          className={selectCls}
          style={{ borderColor: "var(--border)" }}
        >
          <option value="">Todas las páginas</option>
          {pages.map(([path, label]) => (
            <option key={path} value={path}>{label}</option>
          ))}
        </select>

        {(filterUser || filterPage) && (
          <button
            onClick={() => { setFilterUser(""); setFilterPage(""); }}
            className="rounded-lg border px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            style={{ borderColor: "var(--border)" }}
          >
            Limpiar filtros
          </button>
        )}

        <span className="ml-auto self-center text-sm text-[var(--text-muted)]">
          {rows.length} registro{rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr
              className="border-b text-left text-xs uppercase tracking-wide text-[var(--text-muted)]"
              style={{ borderColor: "var(--border)", background: "var(--bg-header)" }}
            >
              <th className="px-4 py-3">Página</th>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Fecha y hora</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  Sin registros
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b last:border-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="px-4 py-3 text-[var(--text-primary)]">{row.pageLabel}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{row.userEmail}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{fmt(row.timestamp)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
