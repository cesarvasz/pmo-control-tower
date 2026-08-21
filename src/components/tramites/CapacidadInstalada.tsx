"use client";

// Capacidad instalada: cuántas personas trabajaron en el tramo de tiempo
// elegido y cuántas horas REALES usó cada una — sin sumar traslapes. Si una
// persona trabajó 3 expedientes en la misma ventana de 2 horas, cuenta 2 h, no
// 3×2: los tramos de cada persona se UNEN antes de medir (ver unirIntervalos /
// costoPorPersona en lib/tramites.ts), porque el reloj de una persona corre una
// sola vez aunque lleve varios trámites a la vez.
//
// La disponibilidad es de 44 h por semana por persona (HORAS_SEMANA_PERSONA):
// aquí se muestra escalada a la ventana del recorte (si el recorte cubre 3
// semanas, la disponibilidad de cada persona es ~132 h), y cuánto de eso
// realmente se usó, en horas y en dinero.

import { useState } from "react";
import type { FilaPersona, Ventana } from "@/lib/tramites";
import { HORAS_SEMANA_PERSONA } from "@/lib/tramites";
import { BadgeBot } from "@/components/tramites/TramitesTablas";

const usd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)} M`
    : n >= 10_000 ? `$${Math.round(n / 1000).toLocaleString("es-GT")} K`
      : `$${Math.round(n).toLocaleString("es-GT")}`;
const usdExacto = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const horas = (n: number) => `${Math.round(n).toLocaleString("es-GT")} h`;

type RolFiltro = "todos" | "usuario" | "analista";

export default function CapacidadInstalada({
  personas, ventana, tarifa, tramo, onFiltrarPersona,
}: {
  personas: FilaPersona[];
  ventana: Ventana;
  tarifa: number;
  /** Etiqueta del filtro global de "Tiempo" (ej. "T1–T3"); vacío si son todas. */
  tramo?: string;
  /** Callback al hacer click en una persona para filtrar. */
  onFiltrarPersona?: (clave: string, rol: "usuario" | "analista") => void;
}) {
  const [rol, setRol] = useState<RolFiltro>("todos");

  // Los ejecutores automatizados tramitan pero no consumen jornada: la
  // capacidad instalada (44 h/semana) es un concepto de personas, no de bots.
  const humanos = personas.filter((p) => !p.automatizado);

  // Filtro Usuario/Analista: una persona puede tener ambos roles (en un
  // expediente fue Usuario y en otro Analista) — "Todos" no filtra por rol,
  // solo evita contar dos veces a quien cae en ambos filtros a la vez.
  const porRol = (p: FilaPersona) => rol === "todos" || (rol === "usuario" ? p.esUsuario : p.esAnalista);
  const nUsuario = humanos.filter((p) => p.esUsuario).length;
  const nAnalista = humanos.filter((p) => p.esAnalista).length;
  const visibles = humanos.filter(porRol);
  const rolLabel = rol === "usuario" ? "como Usuario" : rol === "analista" ? "como Analista" : "";
  // La tabla SÍ incluye a los bots (con su marca ⚙) — solo los tiles de arriba
  // (Personas/Necesarias/Utilización) son un concepto de jornada humana y los
  // dejan fuera. `personas` ya viene ordenada por horasReales; filtrar sobre
  // ella conserva ese orden con los bots intercalados donde les toque.
  const filasTabla = personas.filter(porRol);
  const botsVisibles = filasTabla.filter((p) => p.automatizado);

  const horasReales = visibles.reduce((s, p) => s + p.horasReales, 0);
  const horasSuma = visibles.reduce((s, p) => s + p.horasSuma, 0);
  const costoUsado = visibles.reduce((s, p) => s + p.costo, 0);
  const costoDisponible = visibles.length * ventana.horas * tarifa;
  const utilizacion = costoDisponible > 0 ? costoUsado / costoDisponible : 0;
  const semanas = ventana.horas / HORAS_SEMANA_PERSONA;
  // Personas necesarias: si alguien usara el 100% de su ventana disponible en
  // esto, ¿cuántas bastarían para cubrir las horas reales medidas? Es un piso
  // teórico (supone que el trabajo se reparte libremente), no un objetivo.
  const personasNecesarias = ventana.horas > 0 ? horasReales / ventana.horas : 0;
  const difPersonas = visibles.length - personasNecesarias;

  if (personas.length === 0) {
    return (
      <div className="rounded-xl border py-10 text-center text-[0.82rem] text-[var(--text-muted)]"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        Sin personas con tiempo medido{tramo ? ` en el tramo ${tramo}` : ""} para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="viz-etapas">
      {/* Qué se está contando y por qué no es la suma de los Files */}
      <div className="mb-4 rounded-lg border-l-[3px] px-3.5 py-2.5 text-[0.76rem] leading-relaxed"
        style={{ borderColor: "var(--ok)", background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
        <strong>Se cuentan horas de reloj, no la suma de los Files.</strong>{" "}
        Quien lleva varios trámites a la vez no trabaja la suma de todos: el reloj corre una sola
        vez. Por eso los tramos de cada persona se <em>unen</em> antes de contar — si trabajó 3
        Files en la misma ventana de 2 horas, son 2 horas reales, no 6.
      </div>

      {/* Filtro por rol: una persona puede aparecer en ambos si en un
          expediente fue Usuario y en otro Analista. */}
      <div className="mb-4 flex flex-col gap-1.5">
        <label className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Rol</label>
        <div className="flex w-fit overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
          {([
            ["todos", `Todos (${humanos.length})`],
            ["usuario", `Usuario (${nUsuario})`],
            ["analista", `Analista (${nAnalista})`],
          ] as const).map(([v, l]) => (
            <button key={v} onClick={() => setRol(v)}
              className="px-3 py-2 text-[0.78rem] font-semibold transition-colors"
              style={{
                background: rol === v ? "var(--bg-accent-soft)" : "var(--bg-surface)",
                color: rol === v ? "var(--accent-light)" : "var(--text-secondary)",
              }}>{l}</button>
          ))}
        </div>
      </div>

      {filasTabla.length === 0 ? (
        <div className="rounded-xl border py-10 text-center text-[0.82rem] text-[var(--text-muted)]"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          Nadie trabajó {rolLabel}{tramo ? ` en el tramo ${tramo}` : ""} para los filtros seleccionados.
        </div>
      ) : (
      <>
      {/* Cabecera: cuántas personas y cuánto de su capacidad se usó */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-hover)" }}
          title="Personas (no bots) con al menos una hora medida en el tramo y rol elegidos.">
          <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Personas</div>
          <div className="tabular-nums text-[1.5rem] font-extrabold leading-tight text-[var(--text-primary)]">
            {visibles.length}
          </div>
          <div className="text-[0.64rem] text-[var(--text-muted)]">
            trabajaron{rolLabel ? ` ${rolLabel}` : ""}{tramo ? ` en ${tramo}` : ""}
            {botsVisibles.length > 0 && ` · +${botsVisibles.length} bot${botsVisibles.length === 1 ? "" : "s"} en la tabla, no contados aquí`}
          </div>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-hover)" }}
          title="Horas reales totales ÷ disponibilidad de UNA persona (ventana completa). Es un piso teórico: supone que el trabajo se reparte libremente en el tiempo, cosa que en la práctica no siempre pasa — los picos existen.">
          <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Necesarias</div>
          <div className="tabular-nums text-[1.5rem] font-extrabold leading-tight text-[var(--text-primary)]">
            {personasNecesarias.toFixed(1)}
          </div>
          <div className="text-[0.64rem] text-[var(--text-muted)]">
            usando 100% de su tiempo
            {difPersonas > 0.5 && ` · ${difPersonas.toFixed(1)} de holgura`}
            {difPersonas < -0.5 && ` · faltarían ${Math.abs(difPersonas).toFixed(1)}`}
          </div>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-hover)" }}
          title="Suma de las horas reales (unión de intervalos, sin traslapes) de todas las personas visibles.">
          <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Horas reales</div>
          <div className="tabular-nums text-[1.5rem] font-extrabold leading-tight text-[var(--text-primary)]">
            {horas(horasReales)}
          </div>
          <div className="text-[0.64rem] text-[var(--text-muted)]">
            {horasSuma > 0 && `sumando por File serían ${horas(horasSuma)}`}
          </div>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-hover)" }}
          title="Horas reales totales × tarifa por hora.">
          <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Costo usado</div>
          <div className="tabular-nums text-[1.5rem] font-extrabold leading-tight text-[var(--text-primary)]">
            {usd(costoUsado)}
          </div>
          <div className="text-[0.64rem] text-[var(--text-muted)]">{horas(horasReales)} × ${tarifa}/h</div>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-hover)" }}
          title="Costo usado ÷ costo disponible (personas × horas de la ventana × tarifa). 100% = toda la capacidad instalada se usó.">
          <div className="text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Utilización</div>
          <div className="tabular-nums text-[1.5rem] font-extrabold leading-tight"
            style={{ color: utilizacion >= 0.85 ? "var(--ok)" : utilizacion >= 0.5 ? "var(--warn)" : "var(--bad)" }}>
            {Math.round(utilizacion * 100)}%
          </div>
          <div className="text-[0.64rem] text-[var(--text-muted)]">de la capacidad instalada</div>
        </div>
      </div>

      <p className="mb-4 text-[0.7rem] text-[var(--text-muted)]">
        Capacidad instalada: <strong>{HORAS_SEMANA_PERSONA} h/semana</strong> por persona, escaladas a la
        ventana del recorte ({new Date(ventana.inicio).toLocaleDateString("es-GT")} –{" "}
        {new Date(ventana.fin).toLocaleDateString("es-GT")} · {horas(ventana.horas)} hábiles, ~{semanas.toFixed(1)}{" "}
        semanas) — son {usd(costoDisponible)} de disponibilidad entre las {visibles.length} personas. Ojo al leerlo:
        la ventana es la misma para todos, así que quien entró tarde o salió antes aparece infrautilizado sin que
        eso signifique nada — la comparación vale entre personas presentes todo el periodo, no como juicio individual.
      </p>

      <div className="table-wrap">
        <table className="pmo">
          <thead>
            <tr>
              <th title="Usuario y/o Analista, según el rol con que le tocó cada File. Si aparece en ambos roles del mismo File (la misma persona hizo todo el trámite), cuenta una sola vez con el ciclo completo.">Persona</th>
              <th style={{ textAlign: "center" }} title="Cantidad de Files con un intervalo de reloj atribuido a esta persona, dentro del tramo elegido. Cuenta por MARCA DE RELOJ (inicio-fin real), no por horas hábiles: un File tramitado de noche o fin de semana cuenta aquí aunque su tiempo hábil dé 0 y por eso no aparezca en el n de «Costo por File» (que solo cuenta horario hábil L-V).">Files</th>
              <th style={{ textAlign: "center" }} title="Suma de sus Files: cuenta la misma hora tantas veces como trámites tenía abiertos a la vez (no descuenta traslapes).">Suma</th>
              <th style={{ textAlign: "center" }} title="Unión de sus tramos: cada hora del reloj cuenta una sola vez, sin importar cuántos Files llevaba en paralelo. Esta es la que se usa para el costo y la utilización.">Horas reales</th>
              <th style={{ textAlign: "center" }} title={`Capacidad instalada: ${HORAS_SEMANA_PERSONA} h/semana escaladas a la ventana del recorte (misma ventana para todos).`}>Disponibles</th>
              <th style={{ textAlign: "center" }} title="Suma ÷ Horas reales: cuántos Files llevaba en paralelo, en promedio, durante sus horas trabajadas.">Traslape</th>
              <th style={{ textAlign: "center" }} title="Horas reales × tarifa por hora.">Costo usado</th>
              <th style={{ textAlign: "center" }} title="Diferencia en dinero entre lo disponible (Disponibles × tarifa) y lo usado (Costo usado).">Sin usar</th>
              <th style={{ minWidth: 130 }} title="Horas reales ÷ Disponibles. 100% = ocupada de punta a punta durante toda la ventana medida.">Utilización</th>
            </tr>
          </thead>
          <tbody>
            {filasTabla.slice(0, 150).map((p) => {
              const col = p.utilizacion >= 0.85 ? "var(--ok)" : p.utilizacion >= 0.5 ? "var(--warn)" : "var(--bad)";
              return (
                <tr key={p.clave} onClick={() => {
                  if (onFiltrarPersona && !p.automatizado) {
                    if (rol === "usuario") onFiltrarPersona(p.clave, "usuario");
                    else if (rol === "analista") onFiltrarPersona(p.clave, "analista");
                    else if (p.esUsuario && p.esAnalista) {
                      onFiltrarPersona(p.clave, "usuario");
                    } else if (p.esUsuario) {
                      onFiltrarPersona(p.clave, "usuario");
                    } else {
                      onFiltrarPersona(p.clave, "analista");
                    }
                  }
                }} className={onFiltrarPersona && !p.automatizado ? "cursor-pointer hover:bg-[var(--bg-hover)]" : undefined}>
                  <td className="truncate" title={p.clave}>
                    <span className="flex items-center gap-2">
                      <span className="truncate">{p.label}</span>
                      {p.automatizado && <BadgeBot />}
                    </span>
                  </td>
                  <td className="tabular-nums text-center">{p.expedientes.toLocaleString("es-GT")}</td>
                  <td className="tabular-nums text-center text-[var(--text-muted)]">{horas(p.horasSuma)}</td>
                  <td className="tabular-nums text-center font-bold">{horas(p.horasReales)}</td>
                  {p.automatizado ? (
                    <>
                      <td className="text-center text-[var(--text-disabled)]" title="No aplica: un ejecutor automatizado no tiene una jornada de 44 h/semana.">—</td>
                      <td className="tabular-nums text-center" style={{ color: p.traslape > 10 ? "var(--bad)" : p.traslape > 4 ? "var(--warn)" : "var(--ok)" }}>
                        {p.traslape.toFixed(1)}×
                      </td>
                      <td className="tabular-nums text-center font-semibold">{usdExacto(p.costo)}</td>
                      <td className="text-center text-[var(--text-disabled)]">—</td>
                      <td className="text-center text-[var(--text-disabled)]">—</td>
                    </>
                  ) : (
                    <>
                      <td className="tabular-nums text-center text-[var(--text-muted)]">{horas(p.horasDisponibles)}</td>
                      <td className="tabular-nums text-center" style={{ color: p.traslape > 10 ? "var(--bad)" : p.traslape > 4 ? "var(--warn)" : "var(--ok)" }}>
                        {p.traslape.toFixed(1)}×
                      </td>
                      <td className="tabular-nums text-center font-semibold">{usdExacto(p.costo)}</td>
                      <td className="tabular-nums text-center" style={{ color: p.costoSinUsar > 0 ? "var(--warn)" : "var(--text-muted)" }}>
                        {p.costoSinUsar > 0 ? usdExacto(p.costoSinUsar) : "—"}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
                            <div className="h-full rounded-full"
                              style={{ width: `${Math.min(100, p.utilizacion * 100)}%`, background: col }} />
                          </div>
                          <span className="tabular-nums text-[0.72rem] font-bold" style={{ color: col, minWidth: 38, textAlign: "right" }}>
                            {Math.round(p.utilizacion * 100)}%
                          </span>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filasTabla.length > 150 && (
        <p className="mt-2 text-[0.72rem] text-[var(--text-muted)]">
          Se muestran las 150 con más horas de {filasTabla.length}.
        </p>
      )}
      {botsVisibles.length > 0 && (
        <p className="mt-2 text-[0.7rem] text-[var(--text-muted)]">
          <BadgeBot /> = ejecutor automatizado: tramita Files y sus horas reales sí se ven arriba, pero no
          tiene una jornada de 44 h/semana — por eso no cuenta en Personas/Necesarias/Utilización y sus columnas
          de disponibilidad van en «—».
        </p>
      )}
      </>
      )}
    </div>
  );
}
