"use client";

// Acordeón: cuánto cuesta un expediente, con qué plantilla se haría el mismo
// trabajo al 95% de ocupación, y cómo se ve el resto del año.
//
// Mide el MISMO tramo que el filtro global de "Tiempo" (el `costo` que recibe
// ya viene calculado con ese alcance) — el mismo que usa Capacidad instalada,
// así que "personas que hoy participan" cuadra con su tile "Personas".
//
// Todo cuelga del recorte ya filtrado, así que se recalcula solo al mover
// cualquier filtro — el acordeón no guarda copia de nada.

import { useState } from "react";
import type { Costo, Unitario, PuntoProyectado } from "@/lib/tramites";
import { UTILIZACION_OBJETIVO, etiquetaAlcance, recorridoAlcance } from "@/lib/tramites";

const usd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)} M`
    : n >= 10_000 ? `$${Math.round(n / 1000).toLocaleString("es-GT")} K`
      : `$${n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usdExacto = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => Math.round(n).toLocaleString("es-GT");

export default function CostoUnitario({
  costo, unitario, proyeccion, onSeleccionarPeriodo,
}: {
  costo: Costo;
  unitario: Unitario;
  proyeccion: PuntoProyectado[];
  onSeleccionarPeriodo: (clave: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);

  const maxCosto = Math.max(1, ...proyeccion.map((p) => p.costo));
  const estimados = proyeccion.filter((p) => p.estimado);
  const dif = unitario.personasActuales - unitario.personasNecesarias;
  const tramo = etiquetaAlcance(costo.alcance);
  const recorrido = recorridoAlcance(costo.alcance);

  return (
    <div className="rounded-xl border" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      {/* Cabecera: siempre visible, con lo esencial */}
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
      >
        <span className="text-[0.8rem] transition-transform" style={{ transform: abierto ? "rotate(90deg)" : undefined }}>▶</span>
        <span className="text-[0.9rem] font-bold text-[var(--text-primary)]">Costo por expediente</span>
        {tramo && (
          <span className="rounded-md px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider"
            style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
            tramo {tramo}
          </span>
        )}
        <span className="tabular-nums rounded-md px-2 py-0.5 text-[0.82rem] font-extrabold"
          style={{ background: "var(--bg-accent-soft)", color: "var(--accent-light)" }}>
          {usdExacto(unitario.porExpediente)}
        </span>
        <span className="text-[0.72rem] text-[var(--text-muted)]">
          {num(unitario.expedientes)} expedientes · {num(unitario.personasNecesarias)} personas al{" "}
          {Math.round(UTILIZACION_OBJETIVO * 100)}%
        </span>
        <span className="ml-auto text-[0.72rem] text-[var(--text-muted)]">
          {abierto ? "Ocultar" : "Ver detalle"}
        </span>
      </button>

      {abierto && (
        <div className="border-t px-4 py-4" style={{ borderColor: "var(--border)" }}>
          {tramo && (
            <p className="mb-3 rounded-lg px-3 py-2 text-[0.72rem] leading-relaxed"
              style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
              Este bloque mide el tramo <strong>{tramo}</strong> ({recorrido}) elegido en el filtro
              &quot;Tiempo&quot; — el mismo tramo que usa Capacidad instalada, así que las{" "}
              <strong>personas</strong> de ambos bloques cuadran entre sí. Los{" "}
              <strong>expedientes</strong> no siempre cuadran exacto: aquí solo se cuentan los que
              tuvieron tiempo en horario hábil (L–V), mientras que la columna &quot;Expedientes&quot;
              de Capacidad instalada cuenta por marca de reloj — un trámite hecho de noche o fin de
              semana puede aparecer ahí con 0 horas hábiles y por eso no sumar aquí.
            </p>
          )}

          {/* Desglose del costo unitario. Cada tile trae su fórmula en el hover (title). */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { l: "Por expediente", v: usdExacto(unitario.porExpediente), s: "todo incluido", fuerte: true,
                tip: `Costo por expediente = Operativo + Licencias (misma base)\n= ${usdExacto(unitario.operativoPorExpediente)} + ${usdExacto(unitario.licenciasPorExpediente)} = ${usdExacto(unitario.porExpediente)}\n\nNumerador = horas·tarifa + costo de licencias; denominador = ${num(unitario.expedientes)} expedientes con tiempo medido.` },
              { l: "Operativo", v: usdExacto(unitario.operativoPorExpediente), s: `${unitario.horasPorExpediente.toFixed(1)} h × $${costo.tarifa}${tramo ? ` · ${tramo}` : ""}`,
                tip: `Operativo por expediente = horas de reloj × tarifa ÷ expedientes\n= ${unitario.horasPorExpediente.toFixed(1)} h × $${costo.tarifa} = ${usdExacto(unitario.operativoPorExpediente)}${tramo ? `\n(solo el tramo ${tramo})` : ""}` },
              { l: "Licencias", v: usdExacto(unitario.licenciasPorExpediente), s: `${costo.licenciasBase.total.toLocaleString("es-GT")} licencias`,
                tip: `Licencias por expediente = costo de licencias ÷ expedientes medidos\n= ${usdExacto(costo.licenciasBase.costo)} ÷ ${num(unitario.expedientes)} = ${usdExacto(unitario.licenciasPorExpediente)}\n\nEl costo viene de la hoja (columna "Costo"), tomado como MÁXIMO por expediente (no suma) y sumado solo sobre los ${num(unitario.expedientes)} con tiempo medido — la misma base que el denominador.\n\n${costo.licenciasBase.total.toLocaleString("es-GT")} licencias · ≈ ${usdExacto(costo.licenciasBase.precioUnitario)} por licencia` },
              { l: "Expedientes", v: num(unitario.expedientes), s: tramo ? `con ${tramo} medido` : "con tiempo medido",
                tip: `Expedientes con tiempo medido${tramo ? ` en ${tramo}` : ""} (n).\nEs la base del denominador: el numerador (horas + licencias) y el denominador usan este mismo conjunto para no mezclar bases.` },
            ].map((c) => (
              <div key={c.l} title={c.tip} className="cursor-help rounded-lg px-3 py-2 transition-colors hover:bg-[var(--bg-accent-soft)]" style={{ background: "var(--bg-hover)" }}>
                <div className="flex items-center gap-1 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {c.l}<span className="opacity-50" aria-hidden>ⓘ</span>
                </div>
                <div className="tabular-nums text-[1.2rem] font-extrabold leading-tight"
                  style={{ color: c.fuerte ? "var(--accent-light)" : "var(--text-primary)" }}>{c.v}</div>
                <div className="text-[0.64rem] text-[var(--text-muted)]">{c.s}</div>
              </div>
            ))}
          </div>

          {/* Plantilla necesaria */}
          <div className="mt-4 rounded-lg border p-3.5" style={{ borderColor: "var(--border)" }}>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-[0.8rem] font-bold text-[var(--text-primary)]">
                Plantilla para el mismo trabajo al {Math.round(UTILIZACION_OBJETIVO * 100)}% de ocupación
              </span>
              <span className="tabular-nums text-[1.7rem] font-extrabold leading-none text-[var(--card-value-total)]">
                {num(unitario.personasNecesarias)}
              </span>
              <span className="text-[0.76rem] text-[var(--text-muted)]">
                personas, contra {num(unitario.personasActuales)} que hoy participan
                {tramo ? ` en ${tramo}` : ""}
              </span>
              {dif > 0.5 && (
                <span className="rounded-md px-2 py-0.5 text-[0.74rem] font-bold"
                  style={{ background: "var(--bg-hover)", color: "var(--warn)" }}>
                  {num(dif)} de holgura
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="relative h-3 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
                <div className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (unitario.personasNecesarias / Math.max(1, unitario.personasActuales)) * 100)}%`,
                    background: "var(--accent)",
                  }} />
              </div>
              <span className="tabular-nums text-[0.74rem] font-bold text-[var(--text-secondary)]">
                {Math.round((unitario.personasNecesarias / Math.max(1, unitario.personasActuales)) * 100)}%
              </span>
            </div>
            <p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--text-muted)]">
              {num(costo.horas)} h de reloj{tramo ? ` en ${tramo}` : ""} ÷ ({num(costo.ventana.horas)} h hábiles ×{" "}
              {Math.round(UTILIZACION_OBJETIVO * 100)}%) = {unitario.personasNecesarias.toFixed(1)} personas.
              Es una cuenta de capacidad: supone que el trabajo puede repartirse libremente en el
              tiempo, cosa que en la práctica no siempre pasa — los picos existen. Léelo como el
              piso teórico, no como un objetivo de recorte.
            </p>
          </div>

          {/* Timeline con proyección */}
          {proyeccion.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <span className="text-[0.8rem] font-bold text-[var(--text-primary)]">
                  Costo por mes{tramo ? ` · ${tramo}` : ""}
                </span>
                <span className="text-[0.7rem] text-[var(--text-muted)]">
                  barra sólida = medido · rayada = estimado
                  {estimados.length > 0 && ` (${estimados.length} ${estimados.length === 1 ? "mes" : "meses"})`}
                </span>
              </div>

              <div className="table-wrap pb-1">
                <div className="flex min-w-max items-end gap-1" style={{ height: 160 }}>
                  {proyeccion.map((p) => {
                    const alto = Math.max(2, (p.costo / maxCosto) * 118);
                    return (
                      <div
                        key={p.clave}
                        onClick={() => { if (!p.estimado) onSeleccionarPeriodo(p.clave); }}
                        title={`${p.label}${p.estimado ? p.parcial ? " · mes en curso, completado" : " · estimado" : ""}\n${usdExacto(p.costo)} · ${num(p.volumen)} expedientes · ${usdExacto(p.costoPorExpediente)} c/u`}
                        className={`flex flex-col items-center justify-end ${p.estimado ? "cursor-default" : "cursor-pointer"}`}
                        style={{ width: 56 }}
                      >
                        <span className="mb-0.5 tabular-nums text-[0.6rem] font-bold text-[var(--text-secondary)]">
                          {usd(p.costoPorExpediente)}
                        </span>
                        <div
                          className="w-full rounded-t-sm transition-opacity hover:opacity-80"
                          style={{
                            height: alto,
                            background: p.estimado
                              ? "repeating-linear-gradient(45deg, var(--accent) 0 4px, transparent 4px 8px)"
                              : "var(--accent)",
                            border: p.estimado ? "1px dashed var(--accent)" : undefined,
                            opacity: p.estimado ? 0.75 : 0.85,
                          }} />
                        <span className="mt-1 whitespace-nowrap text-[0.62rem] text-[var(--text-muted)]">{p.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--text-muted)]">
                El número sobre cada barra es el costo <strong>por expediente</strong> de ese mes.
                Los meses estimados repiten el promedio de los últimos tres meses completos; el mes
                en curso se completa por regla de tres sobre las horas hábiles transcurridas. No se
                extrapola tendencia a propósito: con una caída fuerte de tiempos, una recta daría
                números que parecen precisos sin serlo.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
