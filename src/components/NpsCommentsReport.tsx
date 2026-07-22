"use client";

// Reporte de comentarios del NPS: agrupa las razones (answers.razon) por categoría
// (Promotor / Pasivo / Detractor) para leer patrones. Se puede descargar en PDF
// (abre una ventana de impresión autocontenida → "Guardar como PDF").

import { useData } from "@/context/DataContext";
import { npsCfg } from "@/lib/nps";
import type { NpsRecord } from "@/types";
import { Loader, ErrorBox } from "@/components/ui";

const CAT = {
  promoter:  { label: "Promotores",  color: "#10b981", range: "9–10" },
  passive:   { label: "Pasivos",     color: "#f59e0b", range: "7–8" },
  detractor: { label: "Detractores", color: "#ef4444", range: "0–6" },
} as const;
type Cat = keyof typeof CAT;
const CAT_ORDER: Cat[] = ["detractor", "passive", "promoter"]; // primero lo accionable

interface Comment {
  score: number;
  category: Cat;
  reason: string;
  pm: string;
  reqCode: string;
  date: string;
  respondentEmail: string;
  respondentName: string; // resuelto vía Directorio RH (vacío si no hay match)
}

function buildComments(records: NpsRecord[], nameByEmail: Map<string, string>): Comment[] {
  const out: Comment[] = [];
  for (const r of records) {
    if (r.invalidated) continue;
    const raw = r.answers?.nps;
    const score = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (!Number.isFinite(score)) continue;
    const reason = String(r.answers?.razon ?? "").trim();
    if (!reason) continue; // solo respuestas con comentario
    const category: Cat = score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor";
    const email = (r.respondentEmail ?? "").trim();
    out.push({
      score, category, reason, pm: r.pm, reqCode: r.reqCode, date: r.submittedAt,
      respondentEmail: email,
      respondentName: nameByEmail.get(email.toLowerCase()) ?? "",
    });
  }
  return out;
}

/** Etiqueta de quién respondió: nombre si se resolvió, si no el correo. */
const respondentLabel = (c: Comment) => c.respondentName || c.respondentEmail || "—";

const fmtDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/** HTML autocontenido para imprimir / guardar como PDF. */
function buildReportHtml(
  summary: { nps: number | null; label: string; promoters: number; passives: number; detractors: number; total: number },
  comments: Comment[],
): string {
  const generated = new Date().toLocaleDateString("es-GT", { day: "2-digit", month: "long", year: "numeric" });
  const sections = CAT_ORDER.map((cat) => {
    const list = comments.filter((c) => c.category === cat);
    const cards = list.length
      ? list.map((c) => `
          <div class="card">
            <div class="meta">
              <span class="badge" style="background:${CAT[cat].color}">nota ${c.score}/10</span>
              &nbsp; Respondió: <strong>${esc(respondentLabel(c))}</strong>${c.respondentName && c.respondentEmail ? ` <span class="email">(${esc(c.respondentEmail)})</span>` : ""}
              &nbsp;·&nbsp; PM: <strong>${esc(c.pm || "—")}</strong> &nbsp;·&nbsp; ${esc(c.reqCode || "—")} &nbsp;·&nbsp; ${esc(fmtDate(c.date))}
            </div>
            <div class="reason">${esc(c.reason)}</div>
          </div>`).join("")
      : `<div class="empty">Sin comentarios en esta categoría.</div>`;
    return `
      <h2 class="cat" style="border-color:${CAT[cat].color};color:${CAT[cat].color}">
        ${CAT[cat].label} <span class="cat-count">· ${list.length}</span>
      </h2>
      ${cards}`;
  }).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <title>Reporte de Comentarios NPS</title>
    <style>
      @page { margin: 16mm; }
      * { box-sizing: border-box; }
      body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1f2937; font-size: 12px; line-height: 1.55; margin: 0; }
      h1 { font-size: 20px; margin: 0 0 2px; }
      .sub { color: #6b7280; font-size: 12px; margin-bottom: 16px; }
      .summary { display: flex; align-items: center; gap: 20px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 18px; margin-bottom: 22px; }
      .summary .nps { font-size: 34px; font-weight: 800; line-height: 1; }
      .summary .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; font-weight: 700; }
      .dist span { display: inline-block; margin-right: 14px; font-weight: 600; }
      h2.cat { font-size: 14px; font-weight: 800; margin: 22px 0 10px; padding-bottom: 5px; border-bottom: 2px solid; }
      .cat-count { font-weight: 600; color: #9ca3af; }
      .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 13px; margin-bottom: 9px; page-break-inside: avoid; }
      .meta { font-size: 11px; color: #6b7280; margin-bottom: 5px; }
      .email { color: #9ca3af; font-weight: 400; }
      .badge { display: inline-block; padding: 1px 7px; border-radius: 9999px; font-weight: 700; font-size: 10px; color: #fff; }
      .reason { font-size: 12.5px; color: #111827; white-space: pre-wrap; }
      .empty { color: #9ca3af; font-style: italic; margin-bottom: 8px; }
    </style></head>
    <body>
      <h1>Reporte de Comentarios · NPS PMO</h1>
      <div class="sub">Generado el ${generated} · ${comments.length} comentario${comments.length !== 1 ? "s" : ""}</div>
      <div class="summary">
        <div>
          <div class="nps" style="color:${npsCfg(summary.nps)?.color ?? "#6b7280"}">${summary.nps ?? "—"}</div>
          <div class="lbl">${summary.label}</div>
        </div>
        <div class="dist">
          <span style="color:${CAT.promoter.color}">${summary.promoters} Promotores</span>
          <span style="color:${CAT.passive.color}">${summary.passives} Pasivos</span>
          <span style="color:${CAT.detractor.color}">${summary.detractors} Detractores</span>
          <span style="color:#6b7280">${summary.total} respuestas</span>
        </div>
      </div>
      ${sections}
    </body></html>`;
}

export default function NpsCommentsReport() {
  const { data, loading, error } = useData();
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const { nps } = data;
  const nameByEmail = new Map(data.directorio.map((d) => [d.email.trim().toLowerCase(), d.name]));
  const comments = buildComments(data.npsRecords, nameByEmail);
  const label = npsCfg(nps.nps)?.label ?? "Sin datos";
  const npsColor = npsCfg(nps.nps)?.color ?? "#6b7280";

  const downloadPdf = () => {
    const html = buildReportHtml(
      { nps: nps.nps, label, promoters: nps.promoters, passives: nps.passives, detractors: nps.detractors, total: nps.total },
      comments,
    );
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return; // bloqueado por el navegador
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* noop */ } }, 300);
  };

  return (
    <div>
      {/* Barra de resumen + descarga */}
      <div
        className="mb-6 flex flex-wrap items-center gap-5 rounded-xl border p-4"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <div className="text-center">
          <div className="text-[2.4rem] font-extrabold leading-none" style={{ color: npsColor }}>{nps.nps ?? "—"}</div>
          <div className="text-[0.68rem] font-bold uppercase tracking-wide" style={{ color: npsColor }}>{label}</div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.82rem] font-semibold">
          <span style={{ color: CAT.promoter.color }}>{nps.promoters} Promotores</span>
          <span style={{ color: CAT.passive.color }}>{nps.passives} Pasivos</span>
          <span style={{ color: CAT.detractor.color }}>{nps.detractors} Detractores</span>
          <span className="text-[var(--text-muted)]">{nps.total} respuestas · {comments.length} con comentario</span>
        </div>
        <button
          onClick={downloadPdf}
          disabled={comments.length === 0}
          className="ml-auto rounded-lg border px-3.5 py-2 text-[0.8rem] font-bold transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
          title="Abre el diálogo de impresión — elige “Guardar como PDF”"
        >
          ⬇ Descargar PDF
        </button>
      </div>

      {/* Comentarios agrupados por categoría */}
      {comments.length === 0 ? (
        <div className="py-16 text-center text-[var(--text-muted)]">Aún no hay comentarios de NPS.</div>
      ) : (
        <div className="flex flex-col gap-6">
          {CAT_ORDER.map((cat) => {
            const list = comments.filter((c) => c.category === cat);
            return (
              <section key={cat}>
                <div
                  className="mb-2.5 flex items-center gap-2 border-b pb-1.5 text-[0.9rem] font-extrabold"
                  style={{ borderColor: CAT[cat].color, color: CAT[cat].color }}
                >
                  {CAT[cat].label}
                  <span className="text-[0.75rem] font-semibold text-[var(--text-muted)]">· {list.length} · puntaje {CAT[cat].range}</span>
                </div>
                {list.length === 0 ? (
                  <div className="pb-2 pl-0.5 text-[0.82rem] italic text-[var(--text-muted)]">Sin comentarios en esta categoría.</div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {list.map((c, i) => (
                      <div
                        key={i}
                        className="rounded-lg border p-3.5"
                        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
                      >
                        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[0.72rem] text-[var(--text-muted)]">
                          <span
                            className="rounded-full px-2 py-0.5 text-[0.68rem] font-bold text-white"
                            style={{ background: CAT[cat].color }}
                          >
                            nota {c.score}/10
                          </span>
                          <span title={c.respondentEmail}>
                            Respondió: <strong className="text-[var(--text-secondary)]">{respondentLabel(c)}</strong>
                          </span>
                          <span>· PM: <strong className="text-[var(--text-secondary)]">{c.pm || "—"}</strong></span>
                          <span>· {c.reqCode || "—"}</span>
                          <span>· {fmtDate(c.date)}</span>
                        </div>
                        <div className="whitespace-pre-wrap text-[0.86rem] leading-relaxed text-[var(--text-primary)]">{c.reason}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
