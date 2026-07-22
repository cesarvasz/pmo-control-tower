"use client";

// Análisis de las dimensiones PMO (preguntas Likert). Calcula estadísticos por
// dimensión (media, mediana, moda, desviación estándar, top/bottom-2-box) desde las
// respuestas crudas (data.npsRecords) y las presenta con las gráficas adecuadas para
// datos Likert:
//   1) Barra divergente apilada → distribución (des/acuerdo centrado en el neutral).
//   2) Media ± σ → tendencia central vs. dispersión (consenso vs. polarización).
//   3) Tabla de estadísticos.
// La escala Likert va de 1 (Totalmente en desacuerdo) a 5 (Totalmente de acuerdo);
// en % se usa 20% por nivel (misma convención que el resto de la app).

import { useData } from "@/context/DataContext";
import { SURVEY_QUESTIONS, LIKERT_OPTIONS } from "@/lib/survey";
import type { NpsRecord } from "@/types";
import { Loader, ErrorBox } from "@/components/ui";

const pctColor = (p: number) => (p >= 80 ? "var(--ok)" : p >= 60 ? "var(--warn)" : "var(--bad)");

// Niveles Likert (clave interna → etiqueta + color). Verde = acuerdo, rojo = desacuerdo,
// gris = neutral; dentro de cada polo el tono más oscuro es el extremo.
const LV = {
  ta: { label: "Totalmente de acuerdo", color: "#15803d" },
  a:  { label: "De acuerdo", color: "#22c55e" },
  n:  { label: "Neutral", color: "#9ca3af" },
  d:  { label: "En desacuerdo", color: "#f87171" },
  td: { label: "Totalmente en desacuerdo", color: "#b91c1c" },
} as const;
type Lv = keyof typeof LV;
const BAR_ORDER: Lv[] = ["td", "d", "n", "a", "ta"]; // izquierda → derecha
const SCORE_KEY = ["td", "d", "n", "a", "ta"] as const; // score 1..5 → clave

// Etiqueta corta por dimensión (para no saturar las gráficas; el texto completo va en el tooltip).
const SHORT: Record<string, string> = {
  G1: "Contribuye a la estrategia del área",
  G2: "Decisiones directivas con datos",
  I1: "Proyectos alineados a objetivos",
  I2: "Comunica desvíos a tiempo",
  P1: "Adapta metodología por complejidad",
  P2: "Mejora calidad y predictibilidad",
  T1: "Dashboards y reportes útiles",
  T2: "Herramientas facilitan la colaboración",
  H1: "Liderazgo, escucha y orientación",
  H2: "Gestiona el cambio organizacional",
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const OPT = LIKERT_OPTIONS.map(norm); // [TA, A, N, D, TD] (índice 0..4)
const toScore = (v: unknown): number | null => {
  const i = OPT.indexOf(norm(String(v ?? "")));
  return i === -1 ? null : 5 - i; // TA=5 … TD=1
};

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mode = (a: number[]) => { const m = new Map<number, number>(); let best = a[0], bc = 0; for (const x of a) { const k = (m.get(x) ?? 0) + 1; m.set(x, k); if (k > bc) { bc = k; best = x; } } return best; };
const stdev = (a: number[]) => { if (a.length < 2) return 0; const m = avg(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

interface DimStat {
  code: string; short: string; label: string;
  n: number;
  c: Record<Lv, number>; // conteos por nivel
  mean: number; meanPct: number; median: number; mode: number; sd: number;
  fav: number; neu: number; unfav: number; net: number; // % top-2-box / neutral / bottom-2-box / neto
}

function computeStats(records: NpsRecord[]): DimStat[] {
  const likert = SURVEY_QUESTIONS.filter((q) => q.type === "likert" && q.code);
  const valid = records.filter((r) => !r.invalidated);
  const out: DimStat[] = [];
  for (const q of likert) {
    const code = q.code as string;
    const scores: number[] = [];
    for (const r of valid) {
      const s = toScore(r.answers?.[code]);
      if (s != null) scores.push(s);
    }
    if (!scores.length) continue;
    const c: Record<Lv, number> = { ta: 0, a: 0, n: 0, d: 0, td: 0 };
    for (const s of scores) c[SCORE_KEY[s - 1]]++;
    const n = scores.length;
    const m = avg(scores);
    const fav = ((c.a + c.ta) / n) * 100;
    const unfav = ((c.d + c.td) / n) * 100;
    out.push({
      code, short: SHORT[code] ?? code, label: q.label,
      n, c, mean: m, meanPct: Math.round(m * 20), median: median(scores), mode: mode(scores), sd: stdev(scores),
      fav, neu: (c.n / n) * 100, unfav, net: fav - unfav,
    });
  }
  return out;
}

// ── Barra divergente apilada (distribución) ──────────────────────────────
function DivergingBar({ d }: { d: DimStat }) {
  const p: Record<Lv, number> = { ta: (d.c.ta / d.n) * 100, a: (d.c.a / d.n) * 100, n: (d.c.n / d.n) * 100, d: (d.c.d / d.n) * 100, td: (d.c.td / d.n) * 100 };
  const neg = p.td + p.d + p.n / 2;          // extensión hacia el lado "desacuerdo"
  const barLeft = (100 - neg) / 2;            // el eje −100..+100 se mapea a 0..100% (cero en 50%)
  const segs = BAR_ORDER.map((k) => ({ k, pct: p[k] })).filter((s) => s.pct > 0.001);
  return (
    <div>
      <div className="mb-1 text-[0.78rem] text-[var(--text-secondary)]" title={d.label}>
        <span className="font-bold text-[var(--text-primary)]">{d.code}</span> · {d.short}
      </div>
      <div className="flex items-center gap-2">
        <span className="w-9 shrink-0 text-right text-[0.72rem] font-bold tabular-nums" style={{ color: d.unfav > 0 ? "var(--bad)" : "var(--text-disabled)" }}>
          {Math.round(d.unfav)}%
        </span>
        <div className="relative h-6 flex-1">
          <div className="absolute inset-y-0 w-px" style={{ left: "50%", background: "var(--text-muted)", opacity: 0.5 }} />
          <div className="absolute inset-y-1 flex overflow-hidden rounded" style={{ left: `${barLeft}%`, width: "50%" }}>
            {segs.map((s) => (
              <div
                key={s.k}
                className="h-full shrink-0"
                title={`${LV[s.k].label}: ${Math.round(s.pct)}% (${d.c[s.k]})`}
                style={{ width: `${s.pct}%`, background: LV[s.k].color, boxShadow: "inset -1px 0 0 var(--bg-surface)" }}
              />
            ))}
          </div>
        </div>
        <span className="w-9 shrink-0 text-left text-[0.72rem] font-bold tabular-nums" style={{ color: d.fav >= 60 ? "var(--ok)" : "var(--text-secondary)" }}>
          {Math.round(d.fav)}%
        </span>
      </div>
    </div>
  );
}

// ── Media con dispersión (±σ) ────────────────────────────────────────────
function DispersionRow({ d, overallPct }: { d: DimStat; overallPct: number }) {
  const sdPct = d.sd * 20;
  const lo = Math.max(0, d.meanPct - sdPct);
  const hi = Math.min(100, d.meanPct + sdPct);
  const color = pctColor(d.meanPct);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-[0.78rem] text-[var(--text-secondary)]" title={d.label}>
          <span className="font-bold text-[var(--text-primary)]">{d.code}</span> · {d.short}
        </span>
        <span className="shrink-0 text-[0.72rem] tabular-nums text-[var(--text-muted)]">{d.meanPct}% · σ {d.sd.toFixed(2)}</span>
      </div>
      <div className="relative h-4">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ background: "var(--bg-hover)" }} />
        <div className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ left: `${lo}%`, width: `${hi - lo}%`, background: color, opacity: 0.45 }} title={`±1σ: ${Math.round(lo)}%–${Math.round(hi)}%`} />
        <div className="absolute top-0 bottom-0 w-px" style={{ left: `${overallPct}%`, background: "var(--text-muted)", opacity: 0.4 }} title={`Media general ${overallPct}%`} />
        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${d.meanPct}%`, background: color, boxShadow: "0 0 0 2px var(--bg-surface)" }} />
      </div>
    </div>
  );
}

function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col rounded-xl border p-4 text-center" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="text-[0.66rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-[1.7rem] font-extrabold leading-none" style={{ color: color ?? "var(--text-primary)" }}>{value}</div>
      {sub && <div className="mt-1 text-[0.72rem] text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}

export default function NpsDimensionsChart() {
  const { data, loading, error } = useData();
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const dims = computeStats(data.npsRecords);
  if (dims.length === 0) {
    return <div className="py-16 text-center text-[var(--text-muted)]">Aún no hay respuestas a las dimensiones de la encuesta.</div>;
  }

  const n = dims[0].n;
  const overallPct = Math.round(avg(dims.map((d) => d.mean)) * 20);
  const overallFav = Math.round(avg(dims.map((d) => d.fav)));
  const byMean = [...dims].sort((a, b) => b.meanPct - a.meanPct);
  const byNet = [...dims].sort((a, b) => b.net - a.net || b.meanPct - a.meanPct);
  const best = byMean[0];
  const worst = byMean[byMean.length - 1];
  const mostPolarized = [...dims].sort((a, b) => b.sd - a.sd)[0];

  const cell = "px-2.5 py-1.5 tabular-nums";

  return (
    <div className="flex flex-col gap-7">
      {/* Estadísticos clave */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Media general" value={`${overallPct}%`} sub={`${(overallPct / 20).toFixed(1)} / 5 · ${n} resp.`} color={pctColor(overallPct)} />
        <StatTile label="Favorable (de acuerdo+)" value={`${overallFav}%`} sub="top-2-box promedio" color={pctColor(overallFav)} />
        <StatTile label="Más fuerte" value={`${best.meanPct}%`} sub={`${best.code} · ${best.short}`} color="var(--ok)" />
        <StatTile label="Más baja" value={`${worst.meanPct}%`} sub={`${worst.code} · ${worst.short}`} color={pctColor(worst.meanPct)} />
      </div>

      {/* 1) Distribución (barra divergente) */}
      <section>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[0.95rem] font-bold text-[var(--text-primary)]">Distribución de respuestas</h3>
          <span className="text-[0.72rem] text-[var(--text-muted)]">centrado en el neutral · | = punto medio · ordenado por favorabilidad neta</span>
        </div>
        {/* Leyenda */}
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1">
          {BAR_ORDER.map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-[0.72rem] text-[var(--text-secondary)]">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LV[k].color }} />
              {LV[k].label}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-4 rounded-xl border p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          {byNet.map((d) => <DivergingBar key={d.code} d={d} />)}
        </div>
        <p className="mt-2 text-[0.72rem] text-[var(--text-muted)]">
          Izquierda (rojo) = desacuerdo · centro (gris) = neutral · derecha (verde) = acuerdo. Los % a los lados son bottom-2-box y top-2-box.
        </p>
      </section>

      {/* 2) Media con dispersión */}
      <section>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[0.95rem] font-bold text-[var(--text-primary)]">Media y dispersión (±1σ)</h3>
          <span className="text-[0.72rem] text-[var(--text-muted)]">barra corta = consenso · barra larga = opiniones divididas</span>
        </div>
        <div className="flex flex-col gap-4 rounded-xl border p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          {byMean.map((d) => <DispersionRow key={d.code} d={d} overallPct={overallPct} />)}
        </div>
        <p className="mt-2 text-[0.72rem] text-[var(--text-muted)]">
          El punto es la media de cada dimensión; la banda es ±1 desviación estándar. La línea vertical tenue marca la media general ({overallPct}%).
          Mayor dispersión → menos consenso (la más polarizada: <strong>{mostPolarized.code}</strong>, σ {mostPolarized.sd.toFixed(2)}).
        </p>
      </section>

      {/* 3) Tabla de estadísticos */}
      <section>
        <h3 className="mb-3 text-[0.95rem] font-bold text-[var(--text-primary)]">Estadísticos por dimensión</h3>
        <div className="overflow-x-auto rounded-xl border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <table className="w-full text-[0.78rem]">
            <thead>
              <tr className="border-b text-left text-[var(--text-secondary)]" style={{ background: "var(--bg-hover)", borderColor: "var(--border)" }}>
                <th className="px-2.5 py-2 font-semibold">Dim.</th>
                <th className={`${cell} text-center font-semibold`}>n</th>
                <th className={`${cell} text-center font-semibold`}>Media</th>
                <th className={`${cell} text-center font-semibold`}>Mediana</th>
                <th className={`${cell} text-center font-semibold`}>Moda</th>
                <th className={`${cell} text-center font-semibold`}>σ</th>
                <th className={`${cell} text-center font-semibold`} style={{ color: "var(--ok)" }}>Favor.</th>
                <th className={`${cell} text-center font-semibold`}>Neutral</th>
                <th className={`${cell} text-center font-semibold`} style={{ color: "var(--bad)" }}>Desfav.</th>
              </tr>
            </thead>
            <tbody>
              {dims.map((d) => (
                <tr key={d.code} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2.5 py-1.5">
                    <span className="font-bold text-[var(--text-primary)]">{d.code}</span>
                    <span className="ml-1.5 text-[0.72rem] text-[var(--text-muted)]">{d.short}</span>
                  </td>
                  <td className={`${cell} text-center text-[var(--text-muted)]`}>{d.n}</td>
                  <td className={`${cell} text-center font-bold`} style={{ color: pctColor(d.meanPct) }}>{d.mean.toFixed(2)}</td>
                  <td className={`${cell} text-center text-[var(--text-secondary)]`}>{d.median}</td>
                  <td className={`${cell} text-center text-[var(--text-secondary)]`}>{d.mode}</td>
                  <td className={`${cell} text-center text-[var(--text-secondary)]`}>{d.sd.toFixed(2)}</td>
                  <td className={`${cell} text-center font-semibold`} style={{ color: "var(--ok)" }}>{Math.round(d.fav)}%</td>
                  <td className={`${cell} text-center text-[var(--text-muted)]`}>{Math.round(d.neu)}%</td>
                  <td className={`${cell} text-center font-semibold`} style={{ color: d.unfav > 0 ? "var(--bad)" : "var(--text-disabled)" }}>{Math.round(d.unfav)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[0.72rem] text-[var(--text-muted)]">
          Escala 1–5 (Totalmente en desacuerdo → Totalmente de acuerdo). Favor. = % de acuerdo + totalmente de acuerdo (top-2-box); Desfav. = bottom-2-box.
          n = {n}: cifras descriptivas/direccionales, no inferenciales.
        </p>
      </section>
    </div>
  );
}
