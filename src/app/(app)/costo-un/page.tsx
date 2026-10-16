"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { lookupEstrategia, splitBoardName } from "@/lib/proj";
import { CLASES, PAISES_TODOS, PROYECTO_SIN_ID, claseDeCodigo, type Clase } from "@/lib/claseProyecto";
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
            PML<span className="ml-6 font-semibold tabular-nums text-[var(--text-primary)]">{tip.req}</span>
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

type HorasGroup = { label: string; pm: number; vga: number; total: number; proyectos: number };

// Horas (PM + VGA) y proyectos por país. "Proyectos" = boards distintos de los Hitos del país;
// los PML no pertenecen a un board de proyecto, así que no entran en ese conteo.
function groupHoras(rows: Row[], key: (r: Row) => string): HorasGroup[] {
  const m = new Map<string, { pm: number; vga: number; boards: Set<string> }>();
  for (const r of rows) {
    const k = (key(r) || "").trim() || "(sin dato)";
    const e = m.get(k) ?? { pm: 0, vga: 0, boards: new Set<string>() };
    e.pm += r.hrsPm ?? 0;
    e.vga += r.hrsVga ?? 0;
    if (r.kind === "Hito" && r.boardId) e.boards.add(r.boardId);
    m.set(k, e);
  }
  return [...m.entries()]
    .map(([label, v]) => ({ label, pm: v.pm, vga: v.vga, total: v.pm + v.vga, proyectos: v.boards.size }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

// Barras horizontales apiladas (Hrs PM + Hrs VGA) por categoría. Medida: horas.
function HorasBreakdown({ title, data }: { title: string; data: HorasGroup[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-1 text-[0.78rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{title}</div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[0.72rem] text-[var(--text-secondary)]">
        <span className="flex items-center gap-1.5"><Swatch v="var(--series-req)" /> Hrs PM</span>
        <span className="flex items-center gap-1.5"><Swatch v="var(--series-hito)" /> Hrs VGA</span>
        <span className="text-[var(--text-muted)]">· Hrs Dev aún sin dato</span>
      </div>

      {data.length === 0 ? (
        <div className="py-6 text-center text-[0.8rem] text-[var(--text-disabled)]">Sin datos</div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((g) => (
            <div key={g.label} className="flex items-center gap-3"
              title={`${g.label}\nHrs PM: ${g.pm}\nHrs VGA: ${g.vga}\nTotal: ${g.total} h\nProyectos con Hitos: ${g.proyectos}`}>
              <span className="w-32 shrink-0 truncate text-right text-[0.78rem] text-[var(--text-secondary)]">{g.label}</span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="viz-track" style={{ width: `${(g.total / max) * 100}%` }}>
                  {g.total > 0 && (
                    <>
                      <div className={`viz-seg ${g.vga > 0 ? "viz-seg--first" : "viz-seg--only"}`}
                        style={{ width: `${(g.pm / g.total) * 100}%`, background: "var(--series-req)" }} />
                      {g.vga > 0 && (
                        <div className={`viz-seg ${g.pm > 0 ? "viz-seg--last" : "viz-seg--only"}`}
                          style={{ width: `${(g.vga / g.total) * 100}%`, background: "var(--series-hito)" }} />
                      )}
                    </>
                  )}
                </div>
                <span className="shrink-0 text-[0.82rem] font-semibold tabular-nums text-[var(--text-primary)]">
                  {g.total.toLocaleString("es-GT")} h
                </span>
                <span className="shrink-0 text-[0.7rem] text-[var(--text-muted)]">· {g.proyectos} proy.</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CLASE_COLOR: Record<Clase, string> = {
  A: "var(--accent)",
  B: "var(--series-hito)",
  C: "var(--series-req)",
  "Sin clasificar": "var(--text-disabled)",
};

type ClaseItem = { nombre: string; clase: Clase; paises: readonly string[] };
type FilaClase = { label: string } & Record<Clase, number> & { total: number; nombres: Record<Clase, string[]> };
const nombresVacios = (): Record<Clase, string[]> => ({ A: [], B: [], C: [], "Sin clasificar": [] });

// Barras apiladas por clase. Cada fila es una categoría (clase o país) con su conteo por clase.
// Clic en un color abre un pop up con los nombres que lo componen.
function ClaseBars({ title, nota, data }: { title: string; nota?: string; data: FilaClase[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const [det, setDet] = useState<{ fila: string; clase: Clase; nombres: string[] } | null>(null);
  useEffect(() => {
    if (!det) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setDet(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [det]);
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-1 text-[0.78rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{title}</div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[0.72rem] text-[var(--text-secondary)]">
        {CLASES.map((c) => (
          <span key={c} className="flex items-center gap-1.5"><Swatch v={CLASE_COLOR[c]} /> {c === "Sin clasificar" ? c : `Clase ${c}`}</span>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {data.map((g) => {
          const segs = CLASES.filter((c) => g[c] > 0);
          return (
            <div key={g.label} className="flex items-center gap-3"
              title={`${g.label}\n${CLASES.map((c) => `${c}: ${g[c]}`).join("\n")}\nTotal: ${g.total}`}>
              <span className="w-32 shrink-0 truncate text-right text-[0.78rem] text-[var(--text-secondary)]">{g.label}</span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="viz-track" style={{ width: `${(g.total / max) * 100}%` }}>
                  {segs.map((c, i) => (
                    <div key={c}
                      onClick={() => setDet({ fila: g.label, clase: c, nombres: g.nombres[c] })}
                      className={`viz-seg cursor-pointer hover:opacity-80 ${segs.length === 1 ? "viz-seg--only" : i === 0 ? "viz-seg--first" : i === segs.length - 1 ? "viz-seg--last" : ""}`}
                      style={{ width: `${(g[c] / g.total) * 100}%`, background: CLASE_COLOR[c] }} />
                  ))}
                </div>
                <span className="shrink-0 text-[0.82rem] font-semibold tabular-nums text-[var(--text-primary)]">{g.total}</span>
                <span className="shrink-0 text-[0.7rem] text-[var(--text-muted)]">
                  {segs.map((c) => `${c === "Sin clasificar" ? "S/C" : c} ${g[c]}`).join(" · ")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {nota && <p className="mt-3 text-[0.7rem] leading-relaxed text-[var(--text-muted)]">{nota}</p>}
      <p className="mt-1 text-[0.68rem] text-[var(--text-disabled)]">Clic en un color para ver los nombres.</p>

      {det && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.5)" }}
          onClick={() => setDet(null)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border shadow-2xl"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="flex items-start gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <span className="mt-1 inline-block h-3 w-4 shrink-0 rounded-sm" style={{ background: CLASE_COLOR[det.clase] }} />
              <div className="min-w-0 flex-1">
                <div className="text-[0.9rem] font-bold text-[var(--text-primary)]">
                  {det.fila} · {det.clase === "Sin clasificar" ? det.clase : `Clase ${det.clase}`}
                </div>
                <div className="text-[0.72rem] text-[var(--text-muted)]">{det.nombres.length} {det.nombres.length === 1 ? "elemento" : "elementos"}</div>
              </div>
              <button onClick={() => setDet(null)} aria-label="Cerrar"
                className="rounded-md px-2 text-[1.1rem] leading-none text-[var(--text-muted)] hover:text-[var(--text-primary)]">×</button>
            </div>
            <ul className="overflow-y-auto px-4 py-3 text-[0.8rem] text-[var(--text-secondary)]">
              {det.nombres.map((n, i) => (
                <li key={`${n}-${i}`} className="border-b py-1.5 last:border-b-0" style={{ borderColor: "var(--border)" }}>{n}</li>
              ))}
            </ul>
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
  const [fPais, setFPais] = useState(""); // filtro de país del bloque "Proyectos"
  const [aTipo, setATipo] = useState<"" | "REQ" | "Proyecto">(""); // filtro de la pestaña Análisis

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

  // Proyectos propiamente dichos (un board = un proyecto, sin contar Hitos) con su
  // país vía la Estrategia. Independiente del filtro PML/Proyectos de arriba.
  const proyectos = useMemo(() => {
    if (!data) return [];
    return data.projBoards.map((b) => {
      const info = lookupEstrategia(data.estrategiaMap, b.estrategia || "");
      return { id: b.id, name: b.name, pais: (info?.pais ?? "").trim() || "(sin dato)" };
    });
  }, [data]);
  const proyPaises = useMemo(
    () => [...new Set(proyectos.map((p) => p.pais))].sort((a, b) => a.localeCompare(b)),
    [proyectos],
  );
  const proyFiltrados = useMemo(
    () => (fPais ? proyectos.filter((p) => p.pais === fPais) : proyectos),
    [proyectos, fPais],
  );
  const proyPorPais = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of proyFiltrados) m.set(p.pais, (m.get(p.pais) ?? 0) + 1);
    return [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }, [proyFiltrados]);

  // Clasificación A/B/C. Proyectos: cada board según su código PM-XXX + el proyecto
  // sin ID. Clase C: todos los PML (su país sale de la Estrategia). Un proyecto
  // fuera de la tabla queda "Sin clasificar" y no se sabe a qué países aplica.
  const clasificados = useMemo<ClaseItem[]>(() => {
    const out: ClaseItem[] = [];
    for (const b of data?.projBoards ?? []) {
      const { code } = splitBoardName(b.name);
      const info = claseDeCodigo(code);
      out.push({ nombre: b.name, clase: info?.clase ?? "Sin clasificar", paises: info?.paises ?? [] });
    }
    out.push({ nombre: PROYECTO_SIN_ID.nombre, clase: PROYECTO_SIN_ID.info.clase, paises: PROYECTO_SIN_ID.info.paises });
    for (const r of rows) {
      if (r.kind === "REQ") out.push({ nombre: r.id ? `${r.id} — ${r.name}` : r.name, clase: "C", paises: [r.pais.trim() || "(sin dato)"] });
    }
    return out;
  }, [data, rows]);

  const porClase = useMemo<FilaClase[]>(() => CLASES.map((c) => {
    const nombres = nombresVacios();
    nombres[c] = clasificados.filter((x) => x.clase === c).map((x) => x.nombre).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return { label: c === "Sin clasificar" ? c : `Clase ${c}`, A: 0, B: 0, C: 0, "Sin clasificar": 0, [c]: nombres[c].length, total: nombres[c].length, nombres } as FilaClase;
  }), [clasificados]);

  const porClasePais = useMemo<FilaClase[]>(() => {
    const m = new Map<string, FilaClase>();
    const fila = (p: string) => {
      let f = m.get(p);
      if (!f) { f = { label: p, A: 0, B: 0, C: 0, "Sin clasificar": 0, total: 0, nombres: nombresVacios() }; m.set(p, f); }
      return f;
    };
    for (const p of PAISES_TODOS) fila(p);
    for (const x of clasificados) {
      for (const p of x.paises) { const f = fila(p); f[x.clase] += 1; f.total += 1; f.nombres[x.clase].push(x.nombre); }
    }
    for (const f of m.values()) for (const c of CLASES) f.nombres[c].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const orden = (l: string) => { const i = (PAISES_TODOS as readonly string[]).indexOf(l); return i < 0 ? 99 : i; };
    return [...m.values()].sort((a, b) => orden(a.label) - orden(b.label) || a.label.localeCompare(b.label));
  }, [clasificados]);
  // Proyectos (no PML) que abarcan algún país distinto de GT, con esos países.
  const fueraDeGT = useMemo(
    () => clasificados
      .filter((x) => x.clase !== "C")
      .map((x) => ({ ...x, otros: x.paises.filter((p) => p !== "GT"), conGT: x.paises.includes("GT") }))
      .filter((x) => x.otros.length > 0)
      .sort((a, b) => b.otros.length - a.otros.length || a.nombre.localeCompare(b.nombre, undefined, { numeric: true })),
    [clasificados],
  );
  const sinClasificar = clasificados.filter((x) => x.clase === "Sin clasificar");

  // Filas del Análisis: PML, Proyecto (Hitos de sus boards) o ambos.
  const aRows = useMemo(
    () => (aTipo === "REQ" ? rows.filter((r) => r.kind === "REQ")
      : aTipo === "Proyecto" ? rows.filter((r) => r.kind === "Hito") : rows),
    [rows, aTipo],
  );
  const byUNeg = useMemo(() => groupCount(aRows, (r) => r.uNeg), [aRows]);
  const byPais = useMemo(() => groupCount(aRows, (r) => r.pais), [aRows]);
  const horasPais = useMemo(() => groupHoras(aRows, (r) => r.pais), [aRows]);
  const nProyectos = useMemo(
    () => new Set(aRows.filter((r) => r.kind === "Hito" && r.boardId).map((r) => r.boardId)).size,
    [aRows],
  );
  const bySponsor = useMemo(() => groupCount(aRows, (r) => r.sponsor), [aRows]);
  const byTld = useMemo(() => groupCount(aRows, (r) => r.tld), [aRows]);

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
  const nReq = aRows.filter((r) => r.kind === "REQ").length;
  const nHito = aRows.length - nReq;
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
              <option value="">Todos (PML + Proyecto)</option>
              <option value="REQ">PML</option>
              <option value="Proyecto">Proyecto</option>
            </select>

            {fType && (
              <select
                value={fItem}
                onChange={(e) => setFItem(e.target.value)}
                className={selectCls}
                style={{ borderColor: "var(--border)", background: "var(--bg-base)", maxWidth: "26rem" }}
              >
                <option value="">{fType === "REQ" ? "Todos los PML" : "Todos los proyectos"}</option>
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
          {/* Proyectos (sin Hitos) por país */}
          <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="text-[0.78rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                Proyectos por País
              </span>
              <select
                value={fPais}
                onChange={(e) => setFPais(e.target.value)}
                className={selectCls}
                style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}
              >
                <option value="">Todos los países</option>
                {proyPaises.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <span className="ml-auto text-right">
                <span className="tabular-nums text-[1.8rem] font-extrabold leading-none text-[var(--card-value-total)]">
                  {proyFiltrados.length}
                </span>
                <span className="ml-2 text-[0.76rem] text-[var(--text-muted)]">
                  proyectos{fPais ? ` en ${fPais}` : ""} (sin Hitos)
                </span>
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {proyPorPais.map((g) => (
                <div key={g.label} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-right text-[0.78rem] text-[var(--text-secondary)]" title={g.label}>
                    {g.label}
                  </span>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="viz-track" style={{ width: `${(g.n / Math.max(1, proyPorPais[0].n)) * 100}%` }}>
                      <div className="viz-seg viz-seg--only" style={{ width: "100%", background: "var(--series-hito)" }} />
                    </div>
                    <span className="shrink-0 text-[0.82rem] font-semibold tabular-nums text-[var(--text-primary)]">{g.n}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Filtro: PML, Proyectos o ambos */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={aTipo}
              onChange={(e) => setATipo(e.target.value as "" | "REQ" | "Proyecto")}
              className={selectCls}
              style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}
            >
              <option value="">Ambos (PML + Proyectos)</option>
              <option value="REQ">Solo PML</option>
              <option value="Proyecto">Solo Proyectos</option>
            </select>
            <span className="text-sm text-[var(--text-muted)]">{aRows.length} de {rows.length} ítems</span>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard value={aRows.length} label="Ítems totales" />
            <StatCard value={nReq} label="PML" />
            <StatCard value={nHito} label="Hitos" />
            <StatCard value={byUNeg.length} label="Unidades de Negocio" />
            <StatCard value={nProyectos} label="Proyectos con Hitos" />
            <StatCard value={byPais.filter((g) => g.label !== "(sin dato)").length} label="Países" />
            <StatCard value={horasPais.reduce((s, g) => s + g.total, 0).toLocaleString("es-GT")} label="Horas PM + VGA" />
          </div>

          {/* Leyenda + medida */}
          <div className="flex flex-wrap items-center gap-4 text-[0.76rem] text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5"><Swatch v="var(--series-req)" /> PML</span>
            <span className="flex items-center gap-1.5"><Swatch v="var(--series-hito)" /> Hito</span>
            <span className="text-[var(--text-muted)]">· Medida: cantidad de ítems (PML + Hitos)</span>
          </div>

          {/* Gráficos */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown title="Por Unidad de Negocio" data={byUNeg} />
            <Breakdown title="Por TLD" data={byTld} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown title="Cantidad por País" data={byPais} />
            <HorasBreakdown title="Costo en horas por País" data={horasPais} />
          </div>
          <Breakdown title="Por Sponsor" data={bySponsor} />

          {/* Clasificación A / B / C (Clase C = todos los PML) */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ClaseBars
              title="Cantidad por Clase"
              nota={`Clase A y B = proyectos; Clase C = PML. El proyecto "${PROYECTO_SIN_ID.nombre}" no tiene PM ID y cuenta en Clase A.${sinClasificar.length ? ` Sin clasificar: ${sinClasificar.map((x) => splitBoardName(x.nombre).code || x.nombre).join(", ")}.` : ""}`}
              data={porClase}
            />
            <ClaseBars
              title="Por País y Clase"
              nota="Un proyecto cuenta una vez en cada país al que aplica (por eso la suma supera el total de proyectos). Los PML cuentan en su país de Estrategia. Los proyectos sin clasificar no tienen países asignados y no aparecen aquí."
              data={porClasePais}
            />
          </div>

          {/* Proyectos que abarcan países distintos de GT */}
          <div className="rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
            <div className="mb-1 flex flex-wrap items-baseline gap-3">
              <span className="text-[0.78rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                Proyectos que abarcan países fuera de GT
              </span>
              <span className="ml-auto">
                <span className="tabular-nums text-[1.8rem] font-extrabold leading-none text-[var(--card-value-total)]">{fueraDeGT.length}</span>
                <span className="ml-2 text-[0.76rem] text-[var(--text-muted)]">proyectos</span>
              </span>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-4 text-[0.72rem] text-[var(--text-secondary)]">
              {(["A", "B"] as const).map((c) => (
                <span key={c} className="flex items-center gap-1.5"><Swatch v={CLASE_COLOR[c]} /> Clase {c}</span>
              ))}
              <span className="text-[var(--text-muted)]">· Largo de la barra = países fuera de GT</span>
            </div>
            <div className="flex flex-col gap-2">
              {fueraDeGT.map((x) => (
                <div key={x.nombre} className="flex items-center gap-3">
                  <span className="w-48 shrink-0 truncate text-right text-[0.78rem] text-[var(--text-secondary)]" title={x.nombre}>
                    {x.nombre}
                  </span>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="viz-track" style={{ width: `${(x.otros.length / Math.max(1, fueraDeGT[0].otros.length)) * 100}%` }}>
                      <div className="viz-seg viz-seg--only" style={{ width: "100%", background: CLASE_COLOR[x.clase] }} />
                    </div>
                    <span className="shrink-0 text-[0.82rem] font-semibold tabular-nums text-[var(--text-primary)]">{x.otros.length}</span>
                    <span className="shrink-0 text-[0.72rem] text-[var(--text-muted)]">
                      {x.otros.join(", ")}{x.conGT ? " · y GT" : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[0.7rem] leading-relaxed text-[var(--text-muted)]">
              Solo proyectos clasificados (A y B) con países asignados. &quot;y GT&quot; indica que además aplican a Guatemala.
              PM-006 no aparece hasta que se definan sus países.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
