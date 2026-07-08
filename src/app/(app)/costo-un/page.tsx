"use client";

import { useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { lookupEstrategia } from "@/lib/process";
import { EmptyRow, ErrorBox, Loader, SectionHeader, StatCard } from "@/components/ui";

// El step (ítem) que contiene los Hitos como subelementos, en la fase "Launch | Desarrollo".
// El nombre varía entre boards ("Entrega CKU" / "Entregas CKU"), por eso se hace match por prefijo.
const HITOS_STEP = "desarrollo por iteraciones";

// Horas fijas por REQ (constantes de negocio; 17 + 6 = las 23 h conocidas del REQ).
// Los Hitos y Hrs Dev quedan vacíos por ahora.
const REQ_HRS_PM = 17;
const REQ_HRS_VGA = 6;

type Row = {
  kind: "REQ" | "Hito";
  boardId: string; // id del board de proyecto (solo Hitos; "" para REQ)
  id: string;
  name: string;
  estrategia: string;
  uNeg: string;
  pais: string;
  sponsor: string;
  cku: string;
  pm: string;
  developer: string;
  tld: string;
  hrsPm: number | null;
  hrsVga: number | null;
  hrsDev: number | null;
};

type Group = { label: string; req: number; hito: number; total: number };

// Agrupa las filas por una dimensión y cuenta REQ vs Hito. Ordena por total desc.
function groupCount(rows: Row[], key: (r: Row) => string): Group[] {
  const m = new Map<string, { req: number; hito: number }>();
  for (const r of rows) {
    const k = (key(r) || "").trim() || "(sin dato)";
    const e = m.get(k) ?? { req: 0, hito: 0 };
    if (r.kind === "REQ") e.req += 1;
    else e.hito += 1;
    m.set(k, e);
  }
  return [...m.entries()]
    .map(([label, v]) => ({ label, req: v.req, hito: v.hito, total: v.req + v.hito }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

// Gráfico de barras apiladas horizontales (REQ + Hito) por categoría. Medida: cantidad de ítems.
function Breakdown({ title, data }: { title: string; data: Group[] }) {
  const [tip, setTip] = useState<{ x: number; y: number } & Group | null>(null);
  const max = Math.max(1, ...data.map((d) => d.total));

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-3 text-[0.78rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{title}</div>

      {data.length === 0 ? (
        <div className="py-6 text-center text-[0.8rem] text-[var(--text-disabled)]">Sin datos</div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((g) => {
            const segs = (
              [
                g.req > 0 ? { kind: "req" as const, w: g.req } : null,
                g.hito > 0 ? { kind: "hito" as const, w: g.hito } : null,
              ].filter(Boolean) as { kind: "req" | "hito"; w: number }[]
            );
            return (
              <div key={g.label} className="flex items-center gap-3">
                <span
                  className="w-32 shrink-0 truncate text-right text-[0.78rem] text-[var(--text-secondary)]"
                  title={g.label}
                >
                  {g.label}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="viz-track" style={{ width: `${(g.total / max) * 100}%` }}>
                    {segs.map((s, i) => (
                      <div
                        key={s.kind}
                        className={`viz-seg ${segs.length === 1 ? "viz-seg--only" : i === 0 ? "viz-seg--first" : "viz-seg--last"}`}
                        style={{
                          width: `${(s.w / g.total) * 100}%`,
                          background: s.kind === "req" ? "var(--series-req)" : "var(--series-hito)",
                        }}
                        onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, ...g })}
                        onMouseLeave={() => setTip(null)}
                      />
                    ))}
                  </div>
                  <span className="shrink-0 text-[0.82rem] font-semibold tabular-nums text-[var(--text-primary)]">
                    {g.total}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tip && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border px-3 py-2 text-[0.72rem] shadow-xl"
          style={{ left: tip.x + 14, top: tip.y + 14, background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="mb-1 font-semibold text-[var(--text-primary)]">{tip.label}</div>
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "var(--series-req)" }} />
            REQ<span className="ml-6 font-semibold tabular-nums text-[var(--text-primary)]">{tip.req}</span>
          </div>
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "var(--series-hito)" }} />
            Hito<span className="ml-6 font-semibold tabular-nums text-[var(--text-primary)]">{tip.hito}</span>
          </div>
          <div className="mt-1 border-t pt-1 text-[var(--text-secondary)]" style={{ borderColor: "var(--border)" }}>
            Total<span className="ml-6 font-semibold tabular-nums text-[var(--text-primary)]">{tip.total}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Swatch({ v }: { v: string }) {
  return <span className="inline-block h-2.5 w-3.5 rounded-sm" style={{ background: v }} />;
}

export default function CostoUnidadNegocioPage() {
  const { data, loading, error } = useData();
  const [tab, setTab] = useState<"tabla" | "analisis">("tabla");
  const [fType, setFType] = useState<"" | "REQ" | "Proyecto">("");
  const [fItem, setFItem] = useState(""); // id de REQ o boardId de proyecto

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const { req, proj, projBoards, estrategiaMap } = data;
    const boardInfo = new Map(
      projBoards.map((b) => [b.id, { estrategia: b.estrategia || "", pm: b.pm || "", cku: b.cku || "" }]),
    );
    const out: Row[] = [];

    // Filas de REQ: ID/nombre/PM/TLD/CKU del propio board; Estrategia por relación directa.
    // El REQ no tiene columna "Desarrollador" → se deja vacío.
    for (const r of req) {
      const info = lookupEstrategia(estrategiaMap, r.estrategia);
      out.push({
        kind: "REQ",
        boardId: "",
        id: r.id,
        name: r.name,
        estrategia: r.estrategia,
        uNeg: info?.uNeg ?? "",
        pais: info?.pais ?? "",
        sponsor: info?.sponsor ?? "",
        cku: r.cku,
        pm: r.pm,
        developer: "",
        tld: r.tld,
        hrsPm: REQ_HRS_PM,
        hrsVga: REQ_HRS_VGA,
        hrsDev: null,
      });
    }

    // Filas de Hitos: subelementos del step "Desarrollo por iteraciones…" de cada proyecto.
    // Estrategia/PM/CKU se heredan del proyecto; Developer y TLD son del subelemento.
    for (const it of proj) {
      if (!it.name.toLowerCase().includes(HITOS_STEP)) continue;
      const b = boardInfo.get(it.boardId);
      const est = b?.estrategia ?? "";
      const info = lookupEstrategia(estrategiaMap, est);
      for (const sub of it.subitems) {
        out.push({
          kind: "Hito",
          boardId: it.boardId,
          id: sub.pmsId,
          name: sub.name,
          estrategia: est,
          uNeg: info?.uNeg ?? "",
          pais: info?.pais ?? "",
          sponsor: info?.sponsor ?? "",
          cku: b?.cku ?? "",
          pm: b?.pm ?? "",
          developer: sub.developer,
          tld: sub.tld,
          hrsPm: null,
          hrsVga: null,
          hrsDev: null,
        });
      }
    }

    out.sort((a, b) => {
      const ua = a.uNeg || "￿";
      const ub = b.uNeg || "￿";
      if (ua !== ub) return ua.localeCompare(ub);
      if (a.kind !== b.kind) return a.kind === "REQ" ? -1 : 1;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
    return out;
  }, [data]);

  const byUNeg = useMemo(() => groupCount(rows, (r) => r.uNeg), [rows]);
  const bySponsor = useMemo(() => groupCount(rows, (r) => r.sponsor), [rows]);
  const byTld = useMemo(() => groupCount(rows, (r) => r.tld), [rows]);

  // Opciones del dropdown dependiente: REQ (id — name) o Proyecto (código — nombre del board).
  const reqOptions = useMemo(
    () =>
      rows
        .filter((r) => r.kind === "REQ")
        .map((r) => ({ v: r.id, l: `${r.id || "—"} — ${r.name}` }))
        .sort((a, b) => a.l.localeCompare(b.l, undefined, { numeric: true })),
    [rows],
  );
  const projOptions = useMemo(() => {
    const boardName = new Map((data?.projBoards ?? []).map((b) => [b.id, b.name]));
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (r.kind !== "Hito" || !r.boardId || seen.has(r.boardId)) continue;
      const bn = boardName.get(r.boardId) || r.boardId;
      const i = bn.indexOf("|");
      const label = i >= 0 ? `${bn.slice(0, i).trim()} — ${bn.slice(i + 1).trim()}` : bn;
      seen.set(r.boardId, label);
    }
    return [...seen.entries()]
      .map(([v, l]) => ({ v, l }))
      .sort((a, b) => a.l.localeCompare(b.l, undefined, { numeric: true }));
  }, [rows, data]);

  // Filas visibles en la tabla según los filtros.
  const tableRows = useMemo(() => {
    let rs = rows;
    if (fType === "REQ") rs = rs.filter((r) => r.kind === "REQ");
    else if (fType === "Proyecto") rs = rs.filter((r) => r.kind === "Hito");
    if (fItem) {
      rs = rs.filter((r) => (fType === "Proyecto" ? r.boardId === fItem : r.id === fItem));
    }
    return rs;
  }, [rows, fType, fItem]);

  if (loading) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Loader />;

  const sinUNeg = rows.filter((r) => !r.uNeg).length;
  const nReq = rows.filter((r) => r.kind === "REQ").length;
  const nHito = rows.length - nReq;
  const muted = (v: string) => v || <span style={{ color: "var(--text-disabled)" }}>—</span>;
  const numCell = (v: number | null) =>
    v == null ? <span style={{ color: "var(--text-disabled)" }}>—</span> : v;
  const selectCls =
    "rounded-lg border px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

  return (
    <div>
      <SectionHeader
        title="Costo $ x Unid Neg"
        badge={`${rows.length} items${sinUNeg ? ` · ${sinUNeg} sin U Neg` : ""}`}
      />

      {/* Pestañas */}
      <div
        className="mb-5 mt-4 inline-flex rounded-lg border p-0.5"
        style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}
      >
        {(["tabla", "analisis"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="rounded-md px-4 py-1.5 text-sm font-medium transition-colors"
            style={tab === t ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}
          >
            {t === "tabla" ? "Tabla" : "Análisis"}
          </button>
        ))}
      </div>

      {tab === "tabla" ? (
        <>
          {/* Filtros */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <select
              value={fType}
              onChange={(e) => {
                setFType(e.target.value as "" | "REQ" | "Proyecto");
                setFItem("");
              }}
              className={selectCls}
              style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}
            >
              <option value="">Todos (REQ + Proyecto)</option>
              <option value="REQ">REQ</option>
              <option value="Proyecto">Proyecto</option>
            </select>

            {fType && (
              <select
                value={fItem}
                onChange={(e) => setFItem(e.target.value)}
                className={selectCls}
                style={{ borderColor: "var(--border)", background: "var(--bg-base)", maxWidth: "26rem" }}
              >
                <option value="">{fType === "REQ" ? "Todos los REQ" : "Todos los proyectos"}</option>
                {(fType === "REQ" ? reqOptions : projOptions).map((o) => (
                  <option key={o.v} value={o.v}>{o.l}</option>
                ))}
              </select>
            )}

            {(fType || fItem) && (
              <button
                onClick={() => { setFType(""); setFItem(""); }}
                className="rounded-lg border px-3 py-2 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                style={{ borderColor: "var(--border)" }}
              >
                Limpiar
              </button>
            )}

            <span className="ml-auto self-center text-sm text-[var(--text-muted)]">
              {tableRows.length} de {rows.length} items
            </span>
          </div>

          {tableRows.length === 0 ? (
            <EmptyRow />
          ) : (
            <div className="table-wrap">
            <table className="pmo">
              <thead>
                <tr>
                  <th>ID Req/Hito</th>
                  <th>Nombre Req/Hito</th>
                  <th>Estrategia</th>
                  <th>Unid Neg</th>
                  <th>País</th>
                  <th>Sponsor</th>
                  <th>CKU</th>
                  <th>PM</th>
                  <th>Hrs PM</th>
                  <th>Hrs VGA</th>
                  <th>Desarrollador</th>
                  <th>TLD</th>
                  <th>Hrs Dev</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r, i) => (
                  <tr key={`${r.kind}-${r.id || i}-${i}`}>
                    <td className="ini-id" style={{ whiteSpace: "nowrap" }}>{r.id || "—"}</td>
                    <td className="ini-name">{r.name || "—"}</td>
                    <td style={{ fontSize: ".82rem", color: "var(--text-secondary)" }}>{muted(r.estrategia)}</td>
                    <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                      {r.uNeg || <span style={{ color: "var(--text-disabled)", fontWeight: 400 }}>—</span>}
                    </td>
                    <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{muted(r.pais)}</td>
                    <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{muted(r.sponsor)}</td>
                    <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{muted(r.cku)}</td>
                    <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{muted(r.pm)}</td>
                    <td style={{ color: "var(--text-secondary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{numCell(r.hrsPm)}</td>
                    <td style={{ color: "var(--text-secondary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{numCell(r.hrsVga)}</td>
                    <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{muted(r.developer)}</td>
                    <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{muted(r.tld)}</td>
                    <td style={{ color: "var(--text-secondary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{numCell(r.hrsDev)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </>
      ) : (
        <div className="viz flex flex-col gap-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard value={rows.length} label="Ítems totales" />
            <StatCard value={nReq} label="REQ" />
            <StatCard value={nHito} label="Hitos" />
            <StatCard value={byUNeg.length} label="Unidades de Negocio" />
          </div>

          {/* Leyenda + medida */}
          <div className="flex flex-wrap items-center gap-4 text-[0.76rem] text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5"><Swatch v="var(--series-req)" /> REQ</span>
            <span className="flex items-center gap-1.5"><Swatch v="var(--series-hito)" /> Hito</span>
            <span className="text-[var(--text-muted)]">· Medida: cantidad de ítems (REQ + Hitos)</span>
          </div>

          {/* Gráficos */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown title="Por Unidad de Negocio" data={byUNeg} />
            <Breakdown title="Por TLD" data={byTld} />
          </div>
          <Breakdown title="Por Sponsor" data={bySponsor} />
        </div>
      )}
    </div>
  );
}
