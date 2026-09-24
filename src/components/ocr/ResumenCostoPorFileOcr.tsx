"use client";

// Tarjeta "Costo por file": junta el costo de licencias (de la hoja) y el
// costo de tiempo (horas × tarifa fija) del recorte FILTRADO, y los reparte
// entre los files — para comparar contra el filtro "Datos de licencia" (ver
// FiltrosOcr) y ver cuánto cambia el costo por file con/sin esos datos.

import type { KpisOcr } from "@/lib/digitalizacion";
import { nEs, pct1, usdExacto } from "./fmt";

export default function ResumenCostoPorFileOcr({ k }: { k: KpisOcr }) {
  const c = k.costoFile;
  const d = k.digitalizacion;
  const cols = [
    { label: "Por licencia", valor: c.porFileLicencia, color: "var(--etapa-3)" },
    { label: "Por tiempo", valor: c.porFileTiempo, color: "var(--etapa-1)" },
    { label: "Suma", valor: c.porFile, color: "var(--accent-light)", fuerte: true },
  ];

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="min-w-0 text-[0.74rem] font-bold text-[var(--text-primary)]">
          Costo por file <span className="font-medium text-[var(--text-muted)]">· licencias + tiempo</span>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {cols.map((x) => (
          <div key={x.label} className="flex min-w-0 flex-col">
            <div className="text-[0.58rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{x.label}</div>
            <div className="mt-1 truncate tabular-nums text-[1.3rem] font-extrabold leading-tight"
              style={{ color: x.fuerte ? x.color : "var(--card-value-total)" }} title={usdExacto(x.valor)}>
              {usdExacto(x.valor)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t pt-2 text-[0.62rem] leading-snug text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
        {nEs(d.sinDatos)} de {nEs(k.files)} files sin datos de consumo de licencia ({pct1(k.files ? d.sinDatos / k.files : 0)})
        — usa el filtro &quot;Datos de licencia&quot; para comparar el costo con y sin ellos.
      </div>
    </div>
  );
}
