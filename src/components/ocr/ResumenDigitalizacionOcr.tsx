"use client";

// Tarjeta de Documents Count / Pages Count / Licencias / Costo, a la par de la
// tarjeta de tiempo (ResumenTiempoOcr). Suma sobre el recorte YA FILTRADO — no
// tiene selector propio ni cruza con otra hoja: los valores vienen calculados
// en la propia pestaña "009" (ver digitalizacion.ts::calcularKpis).

import type { KpisOcr } from "@/lib/digitalizacion";
import { nEs, usdExacto, pct1 } from "./fmt";

export default function ResumenDigitalizacionOcr({ k }: { k: KpisOcr }) {
  const d = k.digitalizacion;
  const cols = [
    { label: "Docs", valor: nEs(d.docsCount), cap: "documentos digitalizados" },
    { label: "Págs", valor: nEs(d.pagesCount), cap: "páginas digitalizadas" },
    { label: "Licencias", valor: nEs(d.licencias), cap: "consumidas en el recorte" },
    { label: "Costo", valor: usdExacto(d.costo), cap: `${usdExacto(d.costoPorFile)} por file`, fuerte: true },
  ];

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="min-w-0 text-[0.74rem] font-bold text-[var(--text-primary)]">
          Documentos y licencias
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cols.map((c) => (
          <div key={c.label} className="flex min-w-0 flex-col">
            <div className="text-[0.58rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{c.label}</div>
            <div className="mt-1 truncate tabular-nums text-[1.3rem] font-extrabold leading-tight"
              style={{ color: c.fuerte ? "var(--accent-light)" : "var(--card-value-total)" }} title={c.valor}>
              {c.valor}
            </div>
            <div className="mt-1 break-words text-[0.62rem] leading-snug text-[var(--text-muted)]">{c.cap}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t pt-2 text-[0.62rem] leading-snug text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
        {nEs(d.conLicencia)} de {nEs(k.files)} files con licencia ({pct1(k.files ? d.conLicencia / k.files : 0)})
      </div>
    </div>
  );
}
