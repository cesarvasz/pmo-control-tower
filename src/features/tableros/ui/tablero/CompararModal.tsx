"use client";

// "Comparar con Monday": mide el tablero y su board de Monday con la MISMA lógica de la app y
// muestra las métricas lado a lado, más cualquier diferencia elemento por elemento.

import Modal from "@/components/Modal";
import { ErrorBox, Loader, Pill } from "@/components/ui";
import type { ResumenMetricas } from "../../dominio/paridad";
import { Nota, useCarga } from "../comun";

interface Comparacion { diferencias: string[]; monday: ResumenMetricas; app: ResumenMetricas; copiaDel: string | null }

const FILAS: { clave: keyof ResumenMetricas; etiqueta: string; formato?: "dinero" | "pct" | "indice" }[] = [
  { clave: "elementos", etiqueta: "Elementos" },
  { clave: "subelementos", etiqueta: "Subelementos" },
  { clave: "hechos", etiqueta: "Hechos (Done)" },
  { clave: "atrasados", etiqueta: "Atrasados" },
  { clave: "entregasATiempo", etiqueta: "Entregas a tiempo" },
  { clave: "entregasTarde", etiqueta: "Entregas tarde" },
  { clave: "costo", etiqueta: "Costo", formato: "dinero" },
  { clave: "beneficio", etiqueta: "Beneficio", formato: "dinero" },
  { clave: "ev", etiqueta: "EV (valor ganado)", formato: "dinero" },
  { clave: "pv", etiqueta: "PV (valor planeado)", formato: "dinero" },
  { clave: "ac", etiqueta: "AC (costo real)", formato: "dinero" },
  { clave: "spi", etiqueta: "SPI", formato: "indice" },
  { clave: "cpi", etiqueta: "CPI", formato: "indice" },
  { clave: "scope", etiqueta: "Alcance", formato: "pct" },
  { clave: "healthIndex", etiqueta: "Índice de salud (EVM)", formato: "indice" },
  { clave: "healthStatus", etiqueta: "Salud" },
];

function fmt(v: unknown, formato?: string): string {
  if (v === null || v === undefined) return "—";
  if (typeof v !== "number") return String(v);
  if (formato === "dinero") return `$${v.toLocaleString("es-GT", { maximumFractionDigits: 2 })}`;
  if (formato === "pct") return `${v}%`;
  if (formato === "indice") return v.toFixed(3);
  return v.toLocaleString("es-GT");
}

export default function CompararModal({ tableroId, onCerrar }: { tableroId: string; onCerrar(): void }) {
  const { data, error } = useCarga<Comparacion>(`/api/tableros/tableros/${tableroId}/comparar`);
  const iguales = data && data.diferencias.length === 0;
  return (
    <Modal open onClose={onCerrar} width={680} label="Comparar con Monday">
      <div className="flex flex-col gap-4 p-5">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Comparar con Monday</h2>
        {error && <ErrorBox msg={error} />}
        {!data && !error && <Loader />}
        {data && (
          <>
            {iguales
              ? <Nota tono="ok">Mide igual que Monday: todos los elementos y subelementos dan exactamente lo mismo en todas las métricas.</Nota>
              : <Nota tono="mal">Hay {data.diferencias.length} diferencia{data.diferencias.length === 1 ? "" : "s"} con Monday (abajo). Es normal si se editó el tablero después de importarlo.</Nota>}
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <table className="pmo">
                <thead><tr><th>Métrica</th><th style={{ textAlign: "right" }}>Monday</th><th style={{ textAlign: "right" }}>App</th><th /></tr></thead>
                <tbody>
                  {FILAS.map((f) => {
                    const a = data.monday[f.clave];
                    const b = data.app[f.clave];
                    const igual = JSON.stringify(a) === JSON.stringify(b);
                    return (
                      <tr key={f.clave}>
                        <td>{f.etiqueta}</td>
                        <td style={{ textAlign: "right" }}>{fmt(a, f.formato)}</td>
                        <td style={{ textAlign: "right" }}>{fmt(b, f.formato)}</td>
                        <td>{igual ? <Pill tone="ok" small>✓</Pill> : <Pill tone="bad" small>≠</Pill>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data.diferencias.length > 0 && (
              <ul className="max-h-48 overflow-y-auto rounded-lg border p-3 text-[0.78rem] text-[var(--text-secondary)]" style={{ borderColor: "var(--border)" }}>
                {data.diferencias.slice(0, 200).map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
            <p className="text-[0.72rem] text-[var(--text-muted)]">
              Monday se lee de la copia en Supabase{data.copiaDel ? ` (actualizada ${new Date(data.copiaDel).toLocaleString("es-GT")})` : ""}.
              Ambos lados se miden con el mismo código que usan hoy Control Tower, Players y Portafolio.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
