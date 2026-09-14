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
    { label: "Documents Count", valor: nEs(d.docsCount), cap: "documentos digitalizados" },
    { label: "Pages Count", valor: nEs(d.pagesCount), cap: "páginas digitalizadas" },
    { label: "Licencias", valor: nEs(d.licencias), cap: "consumidas en el recorte" },
    { label: "Costo", valor: usdExacto(d.costo), cap: `${usdExacto(d.costoPorFile)} por file`, fuerte: true },
  ];

  return (
    <div className="rounded-xl border p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[0.8rem] font-bold text-[var(--text-primary)]">
          Documentos y licencias <span className="font-medium text-[var(--text-muted)]">· de la hoja, sin tarifa editable</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        {cols.map((c) => (
          <div key={c.label} className="flex flex-col">
            <div className="text-[0.64rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{c.label}</div>
            <div className="mt-1 tabular-nums text-[1.75rem] font-extrabold leading-none"
              style={{ color: c.fuerte ? "var(--accent-light)" : "var(--card-value-total)" }}>
              {c.valor}
            </div>
            <div className="mt-1.5 text-[0.68rem] text-[var(--text-muted)]">{c.cap}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t pt-2.5 text-[0.68rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
        {nEs(d.conLicencia)} de {nEs(k.files)} files con licencia ({pct1(k.files ? d.conLicencia / k.files : 0)})
      </div>
    </div>
  );
}
