"use client";

// Pestaña «VPA» de /calidad-cumplimiento: la tabla «Objetivos de Calidad» del VPA. Una fila
// por indicador (agrupados por objetivo, con su Meta y su Peso) y una columna por mes, desde
// VPA_INICIO. Cada mes un Admin califica cada indicador escribiendo un número de 0 a 100 (el %
// de la meta que se logró); sin nota queda vacío. La última fila es el total ponderado del
// mes. Los no-admin ven las notas de solo lectura. Ver lib/vpa.ts.

import { useEffect, useMemo, useState } from "react";
import { useMe } from "@/context/PermissionsContext";
import { authedFetch } from "@/lib/api";
import { hasAction } from "@/lib/permissions";
import { etiquetaMesCorta } from "@/lib/metodologia";
import {
  VPA_INDICADORES, VPA_PESO_TOTAL, conNotaVpa, normalizarNotaVpa, puntosVpa, vpaMeses,
  type IndicadorVpa, type VpaCalifs,
} from "@/lib/vpa";
import { ErrorBox, Loader, Pill } from "@/components/ui";

const tono = (pct: number) => (pct >= 90 ? "ok" : pct >= 75 ? "warn" : "bad");
const colorLogro = (logro: number) => (logro >= 0.9 ? "var(--ok)" : logro >= 0.75 ? "var(--warn)" : "var(--bad)");
/** 85 → «85», 85.5 → «85.5», 85.25 → «85.3». */
const num1 = (n: number) => String(Math.round(n * 10) / 10);

async function pedirCalifs(): Promise<VpaCalifs> {
  const res = await authedFetch("/api/vpa");
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return ((await res.json()) as { califs: VpaCalifs }).califs;
}

/** Campo de la nota de un indicador en un mes. Guarda al salir del campo o con Enter; vacío = quitar la nota. */
function NotaInput({ nota, etiqueta, onGuardar }: { nota: number | undefined; etiqueta: string; onGuardar: (n: number | null) => void }) {
  const texto = nota == null ? "" : String(nota);
  const [draft, setDraft] = useState(texto);

  const confirmar = () => {
    const t = draft.trim();
    if (t === "") { if (nota != null) onGuardar(null); return; }
    const n = normalizarNotaVpa(Number(t));
    if (n == null) { setDraft(texto); return; }     // fuera de 0-100 o ilegible: vuelve a lo guardado
    if (n === nota) { setDraft(String(n)); return; }
    onGuardar(n);
  };

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number" min={0} max={100} step="any" inputMode="decimal"
        value={draft} placeholder="—" aria-label={etiqueta}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="w-[4.5rem] rounded border bg-transparent px-1.5 py-0.5 text-right text-[0.78rem] font-semibold tabular-nums"
        style={{ borderColor: nota != null ? "var(--accent)" : "var(--border)", color: "var(--text-primary)" }}
        title={nota != null ? "Nota puesta por el Admin (vacío para quitarla)" : "Sin calificar: escribe un número de 0 a 100"}
      />
      <span className="text-[0.72rem] text-[var(--text-muted)]">%</span>
    </span>
  );
}

export default function VpaTab() {
  const { me } = useMe();
  const puedeCalificar = !!me && hasAction(me.permissions, "manage_users");
  const meses = useMemo(() => vpaMeses(), []);
  const vigente = meses[meses.length - 1];
  const [califs, setCalifs] = useState<VpaCalifs | null>(null);
  const [error, setError] = useState("");
  const [fallo, setFallo] = useState("");

  useEffect(() => {
    let vivo = true;
    pedirCalifs()
      .then((c) => { if (vivo) setCalifs(c); })
      .catch((err) => { if (vivo) setError(err instanceof Error ? err.message : "No se pudo cargar la calificación del VPA"); });
    return () => { vivo = false; };
  }, []);

  const guardar = async (mes: string, indicador: string, nota: number | null) => {
    setFallo("");
    setCalifs((prev) => conNotaVpa(prev ?? {}, mes, indicador, nota));   // optimista
    try {
      const res = await authedFetch("/api/vpa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes, indicador, score: nota }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setFallo("No se pudo guardar la nota; se restauró lo guardado.");
      try { setCalifs(await pedirCalifs()); } catch { /* sin conexión: se queda lo último que se vio */ }   // revierte al estado real del servidor
    }
  };

  // Los indicadores por objetivo, en el orden de la tabla.
  const grupos = useMemo(() => {
    const out: { objetivo: string; filas: IndicadorVpa[] }[] = [];
    for (const ind of VPA_INDICADORES) {
      const g = out.find((x) => x.objetivo === ind.objetivo);
      if (g) g.filas.push(ind); else out.push({ objetivo: ind.objetivo, filas: [ind] });
    }
    return out;
  }, []);

  if (error && !califs) return <ErrorBox msg={error} />;
  if (!califs) return <Loader />;

  const estiloPie: React.CSSProperties = { background: "var(--bg-surface)", padding: "11px 14px", fontWeight: 700, borderTop: "2px solid var(--border)" };

  return (
    <div>
      <p className="mb-3 text-[0.82rem] text-[var(--text-muted)]">
        Cada mes un Admin califica cada indicador con un número de 0 a 100 (el % de la meta que se logró). Sin nota queda vacío.
        El total ponderado del mes es la suma de nota × peso ÷ 100.
        {!puedeCalificar && " Solo un Admin puede calificar."}
      </p>
      {fallo && <div className="mb-3 text-[0.82rem]" style={{ color: "var(--bad)" }}>{fallo}</div>}

      <div className="table-wrap">
        <table className="pmo grouped">
          <thead>
            <tr>
              <th>Objetivos de Calidad</th>
              <th>Indicador</th>
              <th style={{ textAlign: "center" }}>Meta</th>
              <th style={{ textAlign: "center" }}>Peso</th>
              {meses.map((m) => (
                <th key={m} style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                  {etiquetaMesCorta(m)}
                  {m === vigente && <span className="ml-1 text-[0.6rem] font-normal text-[var(--accent-light)]">· vigente</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => g.filas.map((ind, i) => (
              <tr key={ind.key}>
                {i === 0 && (
                  <td rowSpan={g.filas.length} className="font-bold text-[var(--text-primary)]"
                    style={{ background: "var(--bg-hover)", verticalAlign: "middle" }}>
                    {g.objetivo}
                  </td>
                )}
                <td className="text-[var(--text-primary)]">{ind.indicador}</td>
                <td className="tabular-nums" style={{ textAlign: "center" }}>{ind.meta}%</td>
                <td className="tabular-nums" style={{ textAlign: "center" }}>{ind.peso}</td>
                {meses.map((m) => {
                  const nota = califs[m]?.notas[ind.key];
                  return (
                    <td key={m} style={{ textAlign: "center" }}>
                      {puedeCalificar ? (
                        // La nota en el key: al guardar (o revertir) el campo se vuelve a armar con lo real.
                        <NotaInput key={`${m}|${ind.key}|${nota ?? ""}`} nota={nota}
                          etiqueta={`${ind.indicador} · ${etiquetaMesCorta(m)}`}
                          onGuardar={(n) => guardar(m, ind.key, n)} />
                      ) : nota != null ? (
                        <Pill tone={tono((nota / ind.meta) * 100)}>{nota}%</Pill>
                      ) : (
                        <span className="text-[var(--text-disabled)]">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            )))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ ...estiloPie, textAlign: "right" }} className="text-[var(--text-primary)]">Total ponderado</td>
              <td style={{ ...estiloPie, textAlign: "center" }} className="tabular-nums text-[var(--text-primary)]">{VPA_PESO_TOTAL}</td>
              {meses.map((m) => {
                const p = puntosVpa(califs[m]?.notas);
                return (
                  <td key={m} style={{ ...estiloPie, textAlign: "center" }}>
                    {p.logro == null ? (
                      <span className="font-normal text-[var(--text-disabled)]">—</span>
                    ) : (
                      <>
                        <div className="tabular-nums" style={{ color: colorLogro(p.logro) }}
                          title={`${num1(p.puntos)} puntos de ${p.pesoCalificado} que pesan los indicadores calificados`}>
                          {num1(p.puntos)}<span className="font-normal text-[var(--text-muted)]"> / {VPA_PESO_TOTAL}</span>
                        </div>
                        {!p.completo && (
                          <div className="text-[0.62rem] font-normal text-[var(--text-muted)]">{p.calificados} de {p.total} calificados</div>
                        )}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
