"use client";

// KPIs del reporte "Digitalización OCR": T1 (Creación→documentos) y T2
// (documentos→carta de licencia), en ventana hábil. Los promedios/medianas de
// T2 se calculan solo sobre los files que ya tienen la carta de licencia.

import type { KpisOcr } from "@/lib/digitalizacion";
import { fmtMin, nEs } from "./fmt";

function Card({ label, valor, sub, color }: {
  label: string; valor: React.ReactNode; sub?: React.ReactNode; color?: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border p-[18px] text-center"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="text-[0.64rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 tabular-nums text-[1.35rem] font-extrabold leading-none"
        style={{ color: color ?? "var(--card-value-total)" }}>
        {valor}
      </div>
      {sub != null && <div className="mt-1 text-[0.66rem] text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}

export default function KpisOcr({ k }: { k: KpisOcr }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      <Card label="Files" valor={nEs(k.files)}
        sub={<>{nEs(k.conT2)} con carta de licencia</>} />
      <Card label="T1 promedio" valor={fmtMin(k.t1.prom)} color="var(--etapa-1)"
        sub={<>P90 {fmtMin(k.t1.p90)} · {nEs(k.t1.n)} files</>} />
      <Card label="T1 mediana" valor={fmtMin(k.t1.mediana)} color="var(--etapa-1)"
        sub={<>máx {fmtMin(k.t1.max)}</>} />
      <Card label="T2 promedio" valor={fmtMin(k.t2.prom)} color="var(--etapa-3)"
        sub={<>P90 {fmtMin(k.t2.p90)} · {nEs(k.t2.n)} files</>} />
      <Card label="T2 mediana" valor={fmtMin(k.t2.mediana)} color="var(--etapa-3)"
        sub={<>máx {fmtMin(k.t2.max)}</>} />
      <Card label="Total promedio" valor={fmtMin(k.total.prom)} color="var(--card-value-total)"
        sub={<>mediana {fmtMin(k.total.mediana)} · {nEs(k.completos)} completos</>} />
      <Card label="T1 = 0" valor={nEs(k.t1.enCero)}
        sub="instantáneos / fin de semana" />
    </div>
  );
}
