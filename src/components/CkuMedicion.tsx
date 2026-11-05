"use client";

// Debajo de cada CKU en /players: QUÉ se mide en Cumplimiento de Entrega y en Calidad de
// Entregas — las unidades que entran, el resultado de cada una y cuánto pesa cada fuente
// (Iniciativas y las Clases A, B y C de Proyectos y PML, los mismos pesos del EVM). Todo sale de lib/ckuDetalle,
// con la misma cuenta que el scoreboard, así que el % de aquí es el de la tabla.
//
// Se lee como un acordeón, todo plegado al inicio: en Proyectos (Cumplimiento y Calidad) proyecto (Fase 3) →
// items → actividades. Se listan las unidades que ENTRAN en la nota, así que cada etiqueta cuadra con el %
// de su fuente; en Cumplimiento también se ven las actividades excusadas (con su etiqueta «no cuenta») y,
// en ambos, cuántas quedan en proceso. Cada estado se lee solo Cumplido / Incumplido (gris = En Proceso).

import { colorIndicadorCku, tonoIndicadorCku } from "@/lib/kpi";
import { useMemo, useState, type ReactNode } from "react";
import { Pill, type Tone } from "@/components/ui";
import CkuResponsableSelect from "@/components/CkuResponsableSelect";
import { fmtDate } from "@/lib/business";
import { contarActividades, contarCalidad, detalleCalidad, detalleCumplimiento, FUENTE_LABEL, fuenteEvmLabel, type ActividadCalidad, type ActividadCumplimiento, type DetalleMedicion, type FuenteMedida, type ItemCalidad, type ItemCumplimiento, type ProyectoCalidadCku, type ProyectoCumplimiento, type UnidadMedida } from "@/lib/ckuDetalle";
import type { Clase } from "@/lib/claseProyecto";
import type { MotivoCalidadActividad } from "@/lib/dashboard";
import type { DelayMap } from "@/lib/delay";
import type { CkuScope } from "@/lib/players";
import type { ClaseEntry } from "@/types";

const ORDEN: FuenteMedida[] = ["proj", "req", "ini"];
// Indicadores del CKU: 100 % verde · 95–99 amarillo · menos de 95 rojo, y ninguno pasa de 100 % (ver tonoIndicadorCku).
const pctColor = (p: number | null) => (p === null ? "#6b7280" : colorIndicadorCku(p));

export default function CkuMedicion({ scope, delays, delaysOriginal, reproceso, reprocesoOriginal, clases, mesLabel }: {
  scope: CkuScope;
  /** Mapas con PM ↔ CKU intercambiado (deciden qué penaliza) y los originales (etiqueta real). */
  delays: DelayMap; delaysOriginal: DelayMap; reproceso: DelayMap; reprocesoOriginal: DelayMap;
  /** Clase A/B/C de Proyectos y PML (Calidad & Cumplimiento → Clasificación): la fuente del peso de cada unidad. */
  clases: Record<string, ClaseEntry>;
  /** Mes filtrado, p. ej. "Octubre 2026" (el `scope` ya viene recortado a sus actividades). Sin él, todos los meses. */
  mesLabel?: string;
}) {
  const cumplimiento = useMemo(() => detalleCumplimiento(scope, delays, delaysOriginal, clases), [scope, delays, delaysOriginal, clases]);
  const calidad = useMemo(() => detalleCalidad(scope, reproceso, reprocesoOriginal, clases), [scope, reproceso, reprocesoOriginal, clases]);
  const sufijo = mesLabel ? ` · ${mesLabel}` : "";

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 border-t p-4 lg:grid-cols-2" style={{ borderColor: "var(--border)" }}>
      <Panel titulo={`Cumplimiento de Entrega${sufijo}`} detalle={cumplimiento} />
      <Panel titulo={`Calidad de Entregas${sufijo}`} esCalidad detalle={calidad} />
    </div>
  );
}

function Panel({ titulo, esCalidad = false, detalle }: {
  titulo: string; esCalidad?: boolean; detalle: DetalleMedicion;
}) {
  // Lo que entra en la nota y, en Cumplimiento, los atrasos excusados de PML e Iniciativas: no suman ni restan, pero se
  // listan para poder cambiarles el responsable (si no, al excusarlos desaparecerían y no se podrían revertir).
  const unidades = detalle.unidades.filter((u) => u.cuenta || (!esCalidad && u.estado === "excusado"));
  // Proyectos: el árbol proyecto → item → actividad (incluye lo que no cuenta / aún no se mide).
  const arbol: ProyectoCumplimiento[] = esCalidad ? [] : detalle.proyectos ?? [];
  const arbolCalidad: ProyectoCalidadCku[] = esCalidad ? detalle.proyectosCalidad ?? [] : [];
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{titulo}</span>
        <span className="text-[1.05rem] font-extrabold tabular-nums" style={{ color: pctColor(detalle.pct) }}>
          {detalle.pct !== null ? `${Math.min(detalle.pct, 100)}%` : "—"}
        </span>
      </div>

      {/* Unidades que entran, agrupadas por qué son (Iniciativa, PML o Proyecto) */}
      {unidades.length === 0 && arbol.length === 0 && arbolCalidad.length === 0 ? (
        <div className="text-[0.8rem] text-[var(--text-disabled)]">Sin unidades medidas todavía</div>
      ) : (
        <div className="space-y-3">
          {ORDEN.map((f) => {
            const us = unidades.filter((u) => u.fuente === f);
            const nProyectos = f === "proj" ? arbol.length + arbolCalidad.length : 0;
            if (us.length === 0 && nProyectos === 0) return null;
            const nCuentan = us.filter((u) => u.cuenta).length;
            const nExcusadas = us.length - nCuentan;
            const encabezado = nProyectos > 0
              ? `${nProyectos} ${nProyectos === 1 ? "proyecto" : "proyectos"} · ${nCuentan} ${nCuentan === 1 ? "actividad" : "actividades"} que cuentan`
              : `${nCuentan}${nExcusadas > 0 ? ` · ${nExcusadas} ${nExcusadas === 1 ? "excusada" : "excusadas"}` : ""}`;
            return (
              <section key={f}>
                <div className="mb-1 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {FUENTE_LABEL[f]} · {encabezado}
                </div>
                <ul className="space-y-1">
                  {f === "proj" && arbolCalidad.length > 0
                    ? arbolCalidad.map((p) => (
                      <li key={p.proyecto} className="rounded-md border" style={{ borderColor: "var(--border)" }}>
                        <ProyectoCalidadFila p={p} />
                      </li>
                    ))
                    : f === "proj" && arbol.length > 0
                    ? arbol.map((p) => (
                      <li key={p.proyecto} className="rounded-md border" style={{ borderColor: "var(--border)" }}>
                        <ProyectoCumplimientoFila p={p} />
                      </li>
                    ))
                    : us.map((u) => (
                      <li key={u.id} className="rounded-md border" style={{ borderColor: "var(--border)" }}>
                        {esCalidad ? <UnidadCalidad u={u} /> : <UnidadCumplimiento u={u} />}
                      </li>
                    ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Acordeón ──────────────────────────────────────────────────────────

const resp = (r: string | null) => (r ? `Resp.: ${r}` : "sin responsable");
// Los estados se leen SOLO «Cumplido», «Incumplido» o «En Proceso» (gris), sin más palabras. Un incumplido excusado (su
// responsable no es el CKU) sigue diciendo «Incumplido», en ámbar, y su tooltip aclara que no cuenta.
const NO_CUENTA = "No cuenta en la nota: su responsable no es el CKU";
const tone = (e: ActividadCumplimiento["estado"]): Tone => (e === "atraso" ? "bad" : e === "ok" ? "ok" : e === "excusado" ? "warn" : "neutral");
const txt = (e: ActividadCumplimiento["estado"]) =>
  e === "ok" ? "Cumplido" : e === "atraso" || e === "excusado" ? "Incumplido" : "En Proceso";
const unidos = (partes: (string | false | null | undefined)[]) => partes.filter(Boolean).join(" · ");
const claseTxt = (c: Clase) => (c === "Sin clasificar" ? c : `Clase ${c}`);

/** Cuánto pesa el texto de una fila según su nivel: 0 = unidad (proyecto…), 1 = item, 2 = actividad. */
const TAMANO = {
  0: { titulo: "text-[0.8rem] font-semibold text-[var(--text-primary)]", detalle: "text-[0.64rem]" },
  1: { titulo: "text-[0.74rem] font-medium text-[var(--text-primary)]", detalle: "text-[0.62rem]" },
  2: { titulo: "text-[0.7rem] text-[var(--text-secondary)]", detalle: "text-[0.6rem]" },
} as const;

/** Título + línea de detalle + (opcional) el responsable, a la izquierda; el resultado, a la derecha. */
function Cabecera({ nivel, titulo, detalle, responsable, derecha }: {
  nivel: 0 | 1 | 2; titulo: string; detalle?: string;
  /** Persona responsable en Monday: `undefined` = no se muestra la línea; `null` = "sin responsable". */
  responsable?: string | null; derecha: ReactNode;
}) {
  return (
    <span className="flex items-start justify-between gap-2">
      <span className="block min-w-0">
        <span className={`block truncate ${TAMANO[nivel].titulo}`} title={titulo}>{titulo}</span>
        {detalle && <span className={`block truncate text-[var(--text-muted)] ${TAMANO[nivel].detalle}`}>{detalle}</span>}
        {responsable !== undefined && <Responsable nombre={responsable} />}
      </span>
      <span className="block shrink-0 text-right">{derecha}</span>
    </span>
  );
}

/** Persona responsable (de un item o de un hito) en Monday. */
function Responsable({ nombre }: { nombre: string | null }) {
  return (
    <span className="block truncate text-[0.62rem]">
      <span className="text-[var(--text-muted)]">Responsable: </span>
      {nombre
        ? <span className="font-semibold text-[var(--text-secondary)]">{nombre}</span>
        : <span className="text-[var(--text-disabled)]">sin responsable</span>}
    </span>
  );
}

/** Una fila del acordeón. Con `hijos` se pliega/despliega (todo parte plegado); sin ellos es una hoja
 *  con el mismo sangrado, para que las columnas queden alineadas. */
function Fila({ cabecera, hijos }: { cabecera: ReactNode; hijos?: ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  if (!hijos) {
    return (
      <div className="flex items-start gap-1.5 px-2 py-1.5">
        <span className="w-3 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">{cabecera}</div>
      </div>
    );
  }
  return (
    <div>
      <button
        type="button" aria-expanded={abierta} onClick={() => setAbierta((a) => !a)}
        className="flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]"
      >
        <span
          className="mt-[3px] w-3 shrink-0 text-[0.6rem] text-[var(--text-muted)] transition-transform"
          style={{ transform: abierta ? "rotate(90deg)" : undefined }} aria-hidden
        >▶</span>
        <span className="block min-w-0 flex-1">{cabecera}</span>
      </button>
      {abierta && (
        <div className="mb-1.5 ml-[0.85rem] border-l pl-2" style={{ borderColor: "var(--border)" }}>{hijos}</div>
      )}
    </div>
  );
}

// ── Unidades ──────────────────────────────────────────────────────────

/** Un PML o una Iniciativa de Cumplimiento (una sola unidad cada uno; un atraso excusado también se lista, sin contar). */
function UnidadCumplimiento({ u }: { u: UnidadMedida }) {
  const aTiempo = u.estado === "ok";
  return (
    <Fila
      cabecera={
        <Cabecera
          nivel={0} titulo={u.nombre} detalle={unidos([u.fase, u.fuente === "req" && fuenteEvmLabel(u.fuenteEvm)])}
          derecha={<>
            <Pill tone={aTiempo ? "ok" : u.estado === "excusado" ? "warn" : "bad"} small title={u.estado === "excusado" ? NO_CUENTA : undefined}>
              {aTiempo ? "Cumplido" : "Incumplido"}
            </Pill>
            {!aTiempo && <CkuResponsableSelect itemId={u.id} kind="delay-cku" heredado={u.responsable} incumplido />}
          </>}
        />
      }
    />
  );
}

/** Un proyecto: su % cumplido (solo con las actividades que cuentan) y, al abrirlo, sus items. */
function ProyectoCumplimientoFila({ p }: { p: ProyectoCumplimiento }) {
  const c = contarActividades(p.items);
  const cuentan = c.ok + c.atraso;
  const pct = cuentan > 0 ? Math.round((c.ok / cuentan) * 100) : null;
  const t: Tone = pct === null ? "neutral" : tonoIndicadorCku(pct);
  return (
    <Fila
      cabecera={
        <Cabecera
          nivel={0} titulo={p.proyecto}
          detalle={unidos([
            claseTxt(p.clase),
            `${p.items.length} ${p.items.length === 1 ? "item" : "items"}`, `${c.ok} de ${cuentan} cumplidas`,
            c.excusado > 0 && `${c.excusado} ${c.excusado === 1 ? "excusada" : "excusadas"}`,
            c.pendiente > 0 && `${c.pendiente} en proceso`,
          ])}
          derecha={<>
            <Pill tone={t} small>{pct === null ? "—" : `${pct}%`}</Pill>
            {(c.atraso > 0 || c.excusado > 0) && <span className="block text-[0.62rem] text-[var(--text-muted)]">{resp(p.responsableFase)}</span>}
          </>}
        />
      }
      hijos={p.items.map((it) => <ItemCumplimientoFila key={it.id} it={it} heredado={p.responsableFase} />)}
    />
  );
}

/** Un item (entregable) de la Fase 3: no es unidad, agrupa sus actividades. Las pendientes no se listan, solo se cuentan. */
function ItemCumplimientoFila({ it, heredado }: { it: ItemCumplimiento; heredado: string | null }) {
  const c = contarActividades([it]);
  const cuentan = c.ok + c.atraso;
  const visibles = it.actividades.filter((a) => a.estado !== "pendiente");
  const resultado = c.atraso > 0 ? <Pill tone="bad" small>Incumplido</Pill>
    : cuentan > 0 ? <Pill tone="ok" small>Cumplido</Pill>
    : c.excusado > 0 ? <Pill tone="warn" small title={NO_CUENTA}>Incumplido</Pill>
    : <Pill tone="neutral" small>En Proceso</Pill>;
  return (
    <Fila
      cabecera={
        <Cabecera
          nivel={1} titulo={it.nombre}
          detalle={unidos([
            it.status, it.deadline && `límite ${fmtDate(it.deadline)}`, `${c.ok} de ${cuentan} cumplidas`,
            c.pendiente > 0 && `${c.pendiente} en proceso`,
          ])}
          responsable={it.responsable}
          derecha={resultado}
        />
      }
      hijos={visibles.length > 0 ? visibles.map((a) => <ActividadFila key={a.id} a={a} heredado={heredado} />) : undefined}
    />
  );
}

/** Una actividad (subitem): la unidad que se mide. `heredado` es el responsable de su fase, el que manda mientras un
 *  Admin no le elija uno a la actividad. */
function ActividadFila({ a, heredado }: { a: ActividadCumplimiento; heredado: string | null }) {
  return (
    <Fila
      cabecera={
        <Cabecera
          nivel={2} titulo={a.nombre}
          detalle={unidos([a.status, a.deadline && `límite ${fmtDate(a.deadline)}`, a.cierre && `cerró ${fmtDate(a.cierre)}`,
            a.nuevaFecha && `nueva fecha ${fmtDate(a.nuevaFecha)}`, a.porNuevaFecha && "cumple por su nueva fecha", a.ajustada && "ajustada a mano a «cumplida»"])}
          responsable={a.responsable}
          derecha={<>
            <Pill tone={tone(a.estado)} small title={a.estado === "excusado" ? NO_CUENTA : undefined}>{txt(a.estado)}</Pill>
            {(a.estado === "atraso" || a.estado === "excusado") && (
              <CkuResponsableSelect itemId={a.id} kind="delay-cku" heredado={heredado} incumplido />
            )}
          </>}
        />
      }
    />
  );
}

/** Un proyecto en Calidad: su nota (% de actividades cumplidas entre las que ya se miden) y, al abrirlo, sus items. */
function ProyectoCalidadFila({ p }: { p: ProyectoCalidadCku }) {
  const c = contarCalidad(p.items);
  const medidas = c.buenas + c.malas;
  const nota = medidas > 0 ? Math.round((c.buenas / medidas) * 100) : null;
  const t: Tone = nota === null ? "neutral" : tonoIndicadorCku(nota);
  return (
    <Fila
      cabecera={
        <Cabecera
          nivel={0} titulo={p.proyecto}
          detalle={unidos([
            claseTxt(p.clase),
            `${p.items.length} ${p.items.length === 1 ? "item" : "items"}`, `${c.buenas} de ${medidas} cumplidas`,
            c.excusadas > 0 && `${c.excusadas} ${c.excusadas === 1 ? "excusada" : "excusadas"}`,
            c.sinMedir > 0 && `${c.sinMedir} en proceso`,
          ])}
          derecha={<>
            <Pill tone={t} small>{nota === null ? "—" : nota}</Pill>
            <span className="block text-[0.62rem] text-[var(--text-muted)]">nota promedio</span>
          </>}
        />
      }
      hijos={p.items.map((it) => <ItemCalidadFila key={it.id} it={it} />)}
    />
  );
}

/** Un item (entregable) de la Fase 3: no es unidad, agrupa sus actividades. Las que aún no se miden no se listan, solo se cuentan. */
function ItemCalidadFila({ it }: { it: ItemCalidad }) {
  const c = contarCalidad([it]);
  const medidas = c.buenas + c.malas;
  const visibles = it.actividades.filter((a) => a.nota !== null);
  const resultado = c.malas > 0 ? <Pill tone="bad" small>Incumplido</Pill>
    : c.buenas > 0 ? <Pill tone="ok" small>Cumplido</Pill>
    : c.excusadas > 0 ? <Pill tone="warn" small title={NO_CUENTA}>Incumplido</Pill>
    : <Pill tone="neutral" small>En Proceso</Pill>;
  return (
    <Fila
      cabecera={
        <Cabecera
          nivel={1} titulo={it.nombre}
          detalle={unidos([
            it.status, it.deadline && `límite ${fmtDate(it.deadline)}`, `${c.buenas} de ${medidas} cumplidas`,
            c.excusadas > 0 && `${c.excusadas} ${c.excusadas === 1 ? "excusada" : "excusadas"}`,
            c.sinMedir > 0 && `${c.sinMedir} en proceso`,
          ])}
          responsable={it.responsable}
          derecha={resultado}
        />
      }
      hijos={visibles.length > 0 ? visibles.map((a) => <ActividadCalidadFila key={a.id} a={a} />) : undefined}
    />
  );
}

/** Por qué vale lo que vale: va en el tooltip del estado, no en su texto. */
const MOTIVO_CALIDAD: Record<MotivoCalidadActividad, string> = {
  "a-tiempo": "Cerró a tiempo", "ajuste": "Ajustada a mano", "nueva-fecha": "Tiene nueva fecha límite", "tarde": "Cerró tarde",
};

/** Una actividad (subitem) con su calidad (1 o 0) y por qué: la unidad que se mide. */
function ActividadCalidadFila({ a }: { a: ActividadCalidad }) {
  return (
    <Fila
      cabecera={
        <Cabecera
          nivel={2} titulo={a.nombre}
          detalle={unidos([
            a.status, a.deadline && `límite ${fmtDate(a.deadline)}`, a.cierre && `cerró ${fmtDate(a.cierre)}`,
            a.nuevaFecha && `nueva fecha ${fmtDate(a.nuevaFecha)}`,
          ])}
          responsable={a.responsable}
          derecha={<>
            <Pill
              tone={a.nota === 100 ? "ok" : a.excusada ? "warn" : a.nota === 0 ? "bad" : "neutral"} small
              title={a.excusada ? NO_CUENTA : a.motivo ? MOTIVO_CALIDAD[a.motivo] : undefined}
            >
              {a.nota === 100 ? "Cumplido" : a.nota === 0 ? "Incumplido" : "En Proceso"}
            </Pill>
            {a.nota === 0 && <CkuResponsableSelect itemId={a.id} kind="reproceso-cku" heredado={null} incumplido />}
          </>}
        />
      }
    />
  );
}

/** Una unidad de Calidad con su nota (0 / 100): un PML o una Iniciativa, según su responsable. */
function UnidadCalidad({ u }: { u: UnidadMedida }) {
  const t: Tone = u.nota === 100 ? "ok" : "bad";
  return (
    <Fila
      cabecera={
        <Cabecera
          nivel={0} titulo={u.nombre} detalle={unidos([u.fase, u.fuente === "req" && fuenteEvmLabel(u.fuenteEvm)])}
          derecha={<>
            <Pill tone={t} small>{u.nota === 100 ? "Cumplido" : "Incumplido"}</Pill>
            <CkuResponsableSelect itemId={u.id} kind="reproceso-cku" heredado={u.responsable} incumplido={u.nota !== 100} />
          </>}
        />
      }
    />
  );
}
