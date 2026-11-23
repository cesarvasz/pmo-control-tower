"use client";

// Pestaña «Iniciativas»: la lista de todas, agrupadas por status (primero New, Meeting 1 y Meeting 2; luego las demás etapas) y, dentro de cada grupo, las más nuevas arriba, con IN-ID, Nombre, PM, Sponsor, CKU,
// Proceso, Status (On Track / Off Track / Plan Futuro) y Próxima acción (la fecha de lo que sigue). Solo lectura: al dar clic en una fila se abre su pop-up (timeline, datos y bitácora).

import type { PersonaCorta } from "../celdas";
import { textoCelda, type Columna, type Elemento } from "../../dominio/tablero";
import StatusIniciativa from "./StatusIniciativa";
import { tipoColumna } from "../../dominio/tipos-columna";
import { etiquetaStatus, type ConfigStatus } from "../../dominio/tipos-columna/status";
import { camposQueLlena, columnasNuevaIni, faltantes, pideDatosCompletos, porIniIdDesc } from "../../dominio/nueva-iniciativa";
import { claseDeAprobacion } from "@/lib/ini";
import { Fragment, useState } from "react";

const th = "px-3 py-2 text-left text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]";
const td = "px-3 py-2 text-[0.82rem] text-[var(--text-primary)]";

export default function ListaIniciativas({ columnas, elementos, personas, valorDe, onAbrir }: {
  columnas: Columna[];
  /** Las iniciativas (sin subelementos). */
  elementos: Elemento[];
  personas: PersonaCorta[];
  valorDe(e: Elemento, c: Columna): unknown;
  onAbrir(elementoId: string): void;
}) {
  const k = columnasNuevaIni(columnas);
  // Grupos colapsados (acordeón); todos abiertos al entrar
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());
  const alternar = (g: string) => setCerrados((s) => { const n = new Set(s); if (!n.delete(g)) n.add(g); return n; });
  const ctx = { nombrePersona: (id: string) => personas.find((p) => p.id === id)?.nombre };
  const texto = (e: Elemento, c?: Columna) => (c ? textoCelda(c, valorDe(e, c), ctx) : "");
  const filas = porIniIdDesc(elementos, (e) => (k.iniId ? valorDe(e, k.iniId) : null));

  // La etapa real (New, Meeting 1…): solo para saber si está en Plan Futuro
  const configStatus = k.status ? (tipoColumna("status")!.config.validar(k.status.config) as ConfigStatus) : null;
  const etapa = (e: Elemento) => {
    const v = k.status ? valorDe(e, k.status) : null;
    return configStatus && typeof v === "string" ? etiquetaStatus(configStatus, v) ?? null : null;
  };
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
  // Datos obligatorios que le faltan (solo a las del embudo o en Plan Futuro: las aprobadas, en espera y Cambio estrategia se dejan como están)
  const obligatorios = camposQueLlena(k);
  const faltan = (e: Elemento) => (pideDatosCompletos(etapa(e)?.texto)
    ? faltantes(e.nombre, obligatorios, Object.fromEntries(obligatorios.map((c) => [c.id, valorDe(e, c)])))
    : []);

  // Grupos: «Nueva Iniciativa» (New, Meeting 1 y Meeting 2) primero; luego las demás etapas en el orden del Status; todas las aprobadas
  // (PM "A", "B", "C") juntas en «Aprobadas»; sin status al final.
  const clave = (s: string) => s.trim().toLowerCase();
  const PRIMERAS = ["new", "meeting 1", "meeting 2"];
  const NUEVA = "nueva-iniciativa";
  const APROBADAS = "aprobadas";
  const claveGrupo = (texto: string) => (!texto ? "" : PRIMERAS.includes(clave(texto)) ? NUEVA : claseDeAprobacion(texto) ? APROBADAS : texto);
  const ordenEtapa = (texto: string) => {
    if (!texto) return 10_000;
    if (PRIMERAS.includes(clave(texto))) return 0;
    const j = configStatus?.etiquetas.findIndex((x) => clave(x.texto) === clave(texto)) ?? -1;
    return 100 + (j >= 0 ? j : 5_000);
  };
  const nombreGrupo = (g: string) => {
    if (!g) return "Sin status";
    if (g === NUEVA) return "Nueva Iniciativa";
    if (g === APROBADAS) return "Aprobadas";
    return clave(g) === "sin valor def" ? "Sin Beneficio Definido" : g;
  };
  /** El color de la etiqueta del Status de esa etapa (el de su pastilla); Aprobadas en verde; sin etiqueta, el de acento. */
  const colorGrupo = (g: string) => {
    if (g === APROBADAS) return "var(--ok)";
    const texto = g === NUEVA ? "New" : g;
    return configStatus?.etiquetas.find((x) => clave(x.texto) === clave(texto))?.color || "var(--accent)";
  };
  const porGrupo = new Map<string, { items: Elemento[]; orden: number }>();
  for (const e of filas) {
    const texto = etapa(e)?.texto ?? "";
    const g = claveGrupo(texto);
    const previo = porGrupo.get(g);
    porGrupo.set(g, { items: [...(previo?.items ?? []), e], orden: Math.min(previo?.orden ?? Infinity, ordenEtapa(texto)) });
  }
  const grupos = [...porGrupo.entries()].sort((x, y) => x[1].orden - y[1].orden || x[0].localeCompare(y[0], "es")).map(([g, v]) => [
    g,
    // Aprobadas: de Clase A a Clase C (a igual clase, las más nuevas primero: el sort es estable)
    g === APROBADAS ? [...v.items].sort((p, q) => (claseDeAprobacion(etapa(p)?.texto ?? "") ?? "Z").localeCompare(claseDeAprobacion(etapa(q)?.texto ?? "") ?? "Z")) : v.items,
  ] as const);

  /** La fecha de la próxima acción: en rojo si ya pasó, en negrita si es hoy. */
  function proxima(e: Elemento) {
    const v = k.proximaAccion ? valorDe(e, k.proximaAccion) : null;
    if (typeof v !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v)) return <span className="text-[var(--text-muted)]">—</span>;
    const texto = new Date(`${v}T12:00:00`).toLocaleDateString("es-GT", { day: "numeric", month: "short", year: "numeric" });
    if (v < hoy) return <span className="font-semibold text-[var(--bad)]" title="Ya pasó la fecha">{texto}</span>;
    if (v === hoy) return <span className="font-bold text-[var(--text-primary)]" title="Es hoy">{texto} · hoy</span>;
    return <span>{texto}</span>;
  }

  const vacio = <span className="text-[var(--text-muted)]">—</span>;
  const celda = (s: string) => (s ? s : vacio);

  if (!filas.length) {
    return <p className="rounded-xl border px-4 py-8 text-center text-[0.85rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>Todavía no hay iniciativas.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[0.75rem] text-[var(--text-muted)]">{filas.length} iniciativas · agrupadas por status · las más nuevas primero</span>
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full min-w-[980px] border-collapse">
          <thead style={{ background: "var(--bg-base)" }}>
            <tr>
              <th className={`${th} w-[90px]`}>IN-ID</th>
              <th className={th}>Nombre</th>
              <th className={th}>PM</th>
              <th className={th}>Sponsor</th>
              <th className={th}>CKU</th>
              <th className={th}>Proceso</th>
              <th className={`${th} w-[140px]`}>Status</th>
              <th className={`${th} w-[150px]`}>Próxima acción</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(([etapaTexto, items]) => (
              <Fragment key={etapaTexto || "sin-status"}>
                <tr
                  tabIndex={0} role="button" aria-expanded={!cerrados.has(etapaTexto)} title={cerrados.has(etapaTexto) ? "Expandir" : "Colapsar"}
                  onClick={() => alternar(etapaTexto)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); alternar(etapaTexto); } }}
                  className="cursor-pointer select-none focus-visible:outline-none focus-visible:brightness-95"
                >
                  <td
                    colSpan={8} className="border-t px-3 py-3 text-[0.95rem] font-bold uppercase tracking-wide"
                    style={{
                      borderColor: "var(--border)", borderLeft: `4px solid ${colorGrupo(etapaTexto)}`,
                      background: `color-mix(in srgb, ${colorGrupo(etapaTexto)} 16%, var(--bg-base))`,
                      color: `color-mix(in srgb, ${colorGrupo(etapaTexto)} 65%, var(--text-primary))`,
                    }}
                  >
                    <span aria-hidden className="mr-2 inline-block w-3 text-[0.8rem] transition-transform" style={{ transform: cerrados.has(etapaTexto) ? "rotate(-90deg)" : "none" }}>▾</span>
                    {nombreGrupo(etapaTexto)} <span className="font-normal opacity-70">· {items.length}</span>
                  </td>
                </tr>
                {!cerrados.has(etapaTexto) && items.map((e) => (
              <tr
                key={e.id} tabIndex={0} onClick={() => onAbrir(e.id)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onAbrir(e.id); } }}
                className="cursor-pointer border-t hover:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)] focus-visible:outline-none"
                style={{ borderColor: "var(--border-subtle)" }} title="Ver la iniciativa (timeline, datos y bitácora)"
              >
                <td className={`${td} whitespace-nowrap font-semibold tabular-nums text-[var(--text-secondary)]`}>{celda(texto(e, k.iniId))}</td>
                <td className={`${td} min-w-[220px]`}>
                  {e.nombre || vacio}
                  {faltan(e).length > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-px text-[0.66rem] font-semibold align-middle"
                      style={{ background: "color-mix(in srgb, var(--warn) 16%, transparent)", color: "color-mix(in srgb, var(--warn) 55%, var(--text-primary))" }}
                      title={`Faltan: ${faltan(e).join(", ")}`}>
                      ⚠ Faltan datos
                    </span>
                  )}
                </td>
                <td className={td}>{celda(texto(e, k.pm))}</td>
                <td className={td}>{celda(texto(e, k.sponsor))}</td>
                <td className={td}>{celda(texto(e, k.cku))}</td>
                <td className={td}>{celda(texto(e, k.proceso))}</td>
                <td className={td}><StatusIniciativa salud={k.salud ? valorDe(e, k.salud) : null} etapa={etapa(e)} /></td>
                <td className={`${td} whitespace-nowrap`}>{proxima(e)}</td>
              </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
