"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/api";
import type { AnalyticsData } from "@/app/api/analytics/data/route";
import { Loader, ErrorBox, SectionHeader } from "@/components/ui";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const uniqueUsers = new Set(data.views.map((v) => v.userId)).size;

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader title="Analíticas">
        <span className="text-sm text-[var(--text-muted)]">Visitas y navegación de usuarios autenticados</span>
      </SectionHeader>

      {/* KPI chips */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Visitas registradas", value: data.total },
          { label: "Páginas únicas", value: data.byPage.length },
          { label: "Usuarios únicos", value: uniqueUsers },
          { label: "Visitas hoy", value: data.views.filter((v) => v.timestamp.startsWith(new Date().toISOString().slice(0, 10))).length },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="flex flex-col gap-1 rounded-xl border p-4"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <span className="text-2xl font-bold text-[var(--accent)]">{kpi.value}</span>
            <span className="text-xs text-[var(--text-muted)]">{kpi.label}</span>
          </div>
        ))}
      </div>

      {/* Por página */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Páginas más visitadas
        </h2>
        <div
          className="overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b text-left text-xs uppercase tracking-wide text-[var(--text-muted)]"
                style={{ borderColor: "var(--border)", background: "var(--bg-header)" }}
              >
                <th className="px-4 py-3">Página</th>
                <th className="px-4 py-3 text-right">Visitas</th>
                <th className="px-4 py-3 text-right">Usuarios únicos</th>
              </tr>
            </thead>
            <tbody>
              {data.byPage.map((row) => (
                <tr
                  key={row.page}
                  className="border-b last:border-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="px-4 py-3 text-[var(--text-primary)]">
                    <span className="font-medium">{row.label}</span>
                    <span className="ml-2 text-xs text-[var(--text-muted)]">{row.page}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--text-primary)]">{row.count}</td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--text-muted)]">{row.uniqueUsers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Por usuario */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Actividad por usuario
        </h2>
        <div
          className="overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b text-left text-xs uppercase tracking-wide text-[var(--text-muted)]"
                style={{ borderColor: "var(--border)", background: "var(--bg-header)" }}
              >
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3 text-right">Visitas</th>
                <th className="px-4 py-3">Última actividad</th>
              </tr>
            </thead>
            <tbody>
              {data.byUser.map((row) => (
                <tr
                  key={row.email}
                  className="border-b last:border-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="px-4 py-3 text-[var(--text-primary)]">{row.email}</td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--text-primary)]">{row.count}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{fmt(row.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Feed reciente */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Actividad reciente
        </h2>
        <div
          className="overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b text-left text-xs uppercase tracking-wide text-[var(--text-muted)]"
                style={{ borderColor: "var(--border)", background: "var(--bg-header)" }}
              >
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Página</th>
                <th className="px-4 py-3">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {data.views.slice(0, 100).map((row) => (
                <tr
                  key={row.id}
                  className="border-b last:border-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{row.userEmail}</td>
                  <td className="px-4 py-3 text-[var(--text-primary)]">{row.pageLabel}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{fmt(row.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
