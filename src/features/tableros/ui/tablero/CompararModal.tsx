"use client";

// "Comparar con Monday": mide el tablero y su board de Monday con la MISMA lógica de la app
// (Proyectos: EVM y entregas; Iniciativas, PML, Estrategia: su procesador) y muestra las
// métricas lado a lado, cualquier diferencia elemento por elemento y los avisos.

import Modal from "@/components/Modal";
import { ErrorBox, Loader, Pill } from "@/components/ui";
import { Nota, useCarga } from "../comun";

export interface FilaComparacion { etiqueta: string; monday: unknown; app: unknown; formato?: "dinero" | "pct" | "indice" }
export interface Comparacion { tipo: string; diferencias: string[]; avisos: string[]; filas: FilaComparacion[]; copiaDel: string | null }

export function fmtValor(v: unknown, formato?: string): string {
  if (v === null || v === undefined) return "—";
  if (typeof v !== "number") return String(v);
  if (formato === "dinero") return `$${v.toLocaleString("es-GT", { maximumFractionDigits: 2 })}`;
  if (formato === "pct") return `${v}%`;
  if (formato === "indice") return v.toFixed(3);
  return v.toLocaleString("es-GT");
}

export const filaIgual = (f: FilaComparacion) => JSON.stringify(f.monday) === JSON.stringify(f.app);

export default function CompararModal({ tableroId, onCerrar }: { tableroId: string; onCerrar(): void }) {
  const { data, error } = useCarga<Comparacion>(`/api/tableros/tableros/${tableroId}/comparar`);
  const distintas = data ? data.diferencias.length + data.filas.filter((f) => !filaIgual(f)).length : 0;
  return (
    <Modal open onClose={onCerrar} width={680} label="Comparar con Monday">
      <div className="flex flex-col gap-4 p-5">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Comparar con Monday</h2>
        {error && <ErrorBox msg={error} />}
        {!data && !error && <Loader />}
        {data && (
          <>
            {distintas === 0
              ? <Nota tono="ok">Mide igual que Monday: todos los elementos dan exactamente lo mismo con la lógica de la app.</Nota>
              : <Nota tono="mal">Hay {distintas} diferencia{distintas === 1 ? "" : "s"} con Monday (abajo). Es normal si se editó el tablero después de importarlo.</Nota>}
            {data.avisos.length > 0 && (
              <Nota>
                {data.avisos.length} valor{data.avisos.length === 1 ? "" : "es"} de Monday con personas que no están en el directorio (en la app
                quedan vacíos). Agrégalas al directorio y vuelve a importar si importan.
              </Nota>
            )}
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <table className="pmo">
                <thead><tr><th>Métrica</th><th style={{ textAlign: "right" }}>Monday</th><th style={{ textAlign: "right" }}>App</th><th /></tr></thead>
                <tbody>
                  {data.filas.map((f) => (
                    <tr key={f.etiqueta}>
                      <td>{f.etiqueta}</td>
                      <td style={{ textAlign: "right" }}>{fmtValor(f.monday, f.formato)}</td>
                      <td style={{ textAlign: "right" }}>{fmtValor(f.app, f.formato)}</td>
                      <td>{filaIgual(f) ? <Pill tone="ok" small>✓</Pill> : <Pill tone="bad" small>≠</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(data.diferencias.length > 0 || data.avisos.length > 0) && (
              <ul className="max-h-48 overflow-y-auto rounded-lg border p-3 text-[0.78rem] text-[var(--text-secondary)]" style={{ borderColor: "var(--border)" }}>
                {data.diferencias.slice(0, 200).map((d, i) => <li key={`d${i}`}>{d}</li>)}
                {data.avisos.slice(0, 50).map((d, i) => <li key={`a${i}`} className="text-[var(--text-muted)]">(persona fuera del directorio) {d}</li>)}
              </ul>
            )}
            <p className="text-[0.72rem] text-[var(--text-muted)]">
              Monday se lee de la copia en Supabase{data.copiaDel ? ` (actualizada ${new Date(data.copiaDel).toLocaleString("es-GT")})` : ""}.
              Ambos lados se procesan con el mismo código que usan hoy Control Tower, Players y Portafolio.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
