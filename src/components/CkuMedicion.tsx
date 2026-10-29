"use client";

// Debajo de cada CKU en /players: QUÉ se mide en Cumplimiento de Entrega y en Calidad de
// Entregas — las unidades que entran, el resultado de cada una y cuánto pesa cada fuente
// (Iniciativas / PML / Proyectos, los mismos pesos del EVM). Todo sale de lib/ckuDetalle,
// con la misma cuenta que el scoreboard, así que el % de aquí es el de la tabla.
//
// Se lee como un acordeón, todo plegado al inicio: en Proyectos (Cumplimiento y Calidad) proyecto (Fase 3) →
// items → actividades. Se listan las unidades que ENTRAN en la nota, así que cada etiqueta cuadra con el %
// de su fuente; en Cumplimiento también se ven las actividades excusadas (con su etiqueta «no cuenta») y,
// en ambos, cuántas quedan pendientes / sin medir.

import { useMemo, useState, type ReactNode } from "react";
import { Pill, type Tone } from "@/components/ui";
import { fmtDate } from "@/lib/business";
import { contarActividades, contarCalidad, detalleCalidad, detalleCumplimiento, FUENTE_LABEL, type ActividadCalidad, type ActividadCumplimiento, type DetalleMedicion, type FuenteMedida, type ItemCalidad, type ItemCumplimiento, type ProyectoCalidadCku, type ProyectoCumplimiento, type UnidadMedida } from "@/lib/ckuDetalle";
import type { MotivoCalidadActividad } from "@/lib/dashboard";
import type { DelayMap } from "@/lib/delay";
import type { CkuScope } from "@/lib/players";

const ORDEN: FuenteMedida[] = ["proj", "req", "ini"];
const pctColor = (p: number | null) => (p === null ? "#6b7280" : p >= 90 ? "var(--ok)" : p >= 75 ? "var(--warn)" : "var(--bad)");
const pesoTxt = (w: number) => `${Math.round(w * 1000) / 10}%`;

export default function CkuMedicion({ scope, delays, delaysOriginal, reproceso, reprocesoOriginal }: {
  scope: CkuScope;
  /** Mapas con PM ↔ CKU intercambiado (deciden qué penaliza) y los originales (etiqueta real). */
  delays: DelayMap; delaysOriginal: DelayMap; reproceso: DelayMap; reprocesoOriginal: DelayMap;
}) {
  const cumplimiento = useMemo(() => detalleCumplimiento(scope, delays, delaysOriginal), [scope, delays, delaysOriginal]);
  const calidad = useMemo(() => detalleCalidad(scope, reproceso, reprocesoOriginal), [scope, reproceso, reprocesoOriginal]);

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 border-t p-4 lg:grid-cols-2" style={{ borderColor: "var(--border)" }}>
      <Panel
        titulo="Cumplimiento de Entrega" medida="% a tiempo" detalle={cumplimiento}
        notaProyectos="En Proyectos solo cuentan los entregables (items) de la Fase 3 (Launch) a cargo del CKU, de los proyectos con plantilla nueva, y dentro de ellos sus actividades; la unidad es cada actividad ya cerrada y las pendientes no cuentan."
        regla="Un atraso no penaliza al CKU si tiene un responsable asignado distinto de CKU; sin asignar (o CKU) penaliza. Una Iniciativa, un PML o una actividad con un atraso así no se cuenta. En Proyectos el responsable se asigna por fase, y las actividades excusadas se listan marcadas «no cuenta»."
      />
      <Panel
        titulo="Calidad de Entregas" medida="nota promedio" esCalidad detalle={calidad}
        notaProyectos="En Proyectos solo cuentan los entregables (items) de la Fase 3 (Launch) a cargo del CKU, de los proyectos con plantilla nueva, y dentro de ellos sus actividades; la unidad es cada actividad y se mide por sus fechas."
        regla="PML e Iniciativas valen 100 si tienen un responsable asignado distinto de CKU y 0 si el responsable es el CKU o todavía no tienen (sin asignar penaliza). Una actividad de Proyecto vale 1 si cerró en o antes de su Limit Date o sigue en Working on it, y 0 si tiene New Limit Date o cerró después de su Limit Date. Las demás (Future Steps, Stuck…) todavía no se miden."
      />
    </div>
  );
}

function Panel({ titulo, medida, esCalidad = false, notaProyectos, detalle, regla }: {
  titulo: string; medida: string; esCalidad?: boolean;
  /** Cómo se miden los Proyectos en este panel — se avisa en negritas en el encabezado. */
  notaProyectos: string;
  detalle: DetalleMedicion; regla: string;
}) {
  // Solo lo que entra en la nota: un atraso excusado (PML, Iniciativa o actividad) no suma ni resta.
  const unidades = detalle.unidades.filter((u) => u.cuenta);
  // Proyectos: el árbol proyecto → item → actividad (incluye lo que no cuenta / aún no se mide).
  const arbol: ProyectoCumplimiento[] = esCalidad ? [] : detalle.proyectos ?? [];
  const arbolCalidad: ProyectoCalidadCku[] = esCalidad ? detalle.proyectosCalidad ?? [] : [];
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{titulo}</span>
        <span className="text-[1.05rem] font-extrabold tabular-nums" style={{ color: pctColor(detalle.pct) }}>
          {detalle.pct !== null ? `${detalle.pct}%` : "—"}
        </span>
      </div>
      <p className="mb-2 text-[0.68rem] leading-snug text-[var(--text-muted)]">
        Medido como el EVM: cada fuente saca su {medida} y se combinan Iniciativas 10% · PML 20% · Proyectos 70%.
        El peso de una fuente sin unidades se reparte entre las demás.
        <strong className="font-semibold text-[var(--text-secondary)]"> {notaProyectos}</strong>
      </p>

      {/* Peso real y resultado de cada fuente */}
      <ul className="mb-3 space-y-0.5 text-[0.76rem]">
        {ORDEN.map((f) => {
          const r = detalle.fuentes.find((x) => x.fuente === f)!;
          return (
            <li key={f} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-[var(--text-primary)]">{FUENTE_LABEL[f]}</span>
              {r.total === 0 ? (
                <span className="text-[var(--text-disabled)]">sin unidades · no pesa</span>
              ) : (
                <>
                  <span className="text-[var(--text-muted)]">pesa {pesoTxt(r.pesoEfectivo ?? 0)}</span>
                  <span className="text-[var(--text-secondary)]">
                    {esCalidad ? `${r.total} unidades · ${r.buenas} con nota 100` : `${r.buenas} de ${r.total} a tiempo`}
                  </span>
                  <span className="font-bold tabular-nums" style={{ color: pctColor(r.pct) }}>{r.pct}{esCalidad ? "" : "%"}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {/* Unidades que entran, agrupadas por fuente */}
      {unidades.length === 0 && arbol.length === 0 && arbolCalidad.length === 0 ? (
        <div className="text-[0.8rem] text-[var(--text-disabled)]">Sin unidades medidas todavía</div>
      ) : (
        <div className="space-y-3">
          {ORDEN.map((f) => {
            const us = unidades.filter((u) => u.fuente === f);
            const nProyectos = f === "proj" ? arbol.length + arbolCalidad.length : 0;
            if (us.length === 0 && nProyectos === 0) return null;
            const encabezado = nProyectos > 0
              ? `${nProyectos} ${nProyectos === 1 ? "proyecto" : "proyectos"} · ${us.length} ${us.length === 1 ? "actividad" : "actividades"} que cuentan`
              : String(us.length);
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
      <p className="mt-2 text-[0.64rem] leading-snug text-[var(--text-disabled)]">{regla}</p>
    </div>
  );
}

// ── Acordeón ──────────────────────────────────────────────────────────

const resp = (r: string | null) => (r ? `Resp.: ${r}` : "sin responsable");
const tone = (e: ActividadCumplimiento["estado"]): Tone => (e === "atraso" ? "bad" : e === "ok" ? "ok" : "neutral");
const txt = (e: ActividadCumplimiento["estado"]) =>
  e === "atraso" ? "✕ Con atraso" : e === "ok" ? "✓ A tiempo" : e === "excusado" ? "Excusado · no cuenta" : "• Pendiente · no cuenta";
const unidos = (partes: (string | false | null | undefined)[]) => partes.filter(Boolean).join(" · ");

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

/** Un PML o una Iniciativa de Cumplimiento (una sola unidad cada uno; los atrasos excusados ya no llegan aquí). */
function UnidadCumplimiento({ u }: { u: UnidadMedida }) {
  const aTiempo = u.estado === "ok";
  return (
    <Fila
      cabecera={
        <Cabecera
          nivel={0} titulo={u.nombre} detalle={u.fase}
          derecha={<>
            <Pill tone={aTiempo ? "ok" : "bad"} small>{aTiempo ? "✓ A tiempo" : "✕ Con atraso"}</Pill>
            {!aTiempo && <span className="block text-[0.62rem] text-[var(--text-muted)]">{resp(u.responsable)}</span>}
          </>}
        />
      }
    />
  );
}

/** Un proyecto: su % a tiempo (solo con las actividades que cuentan) y, al abrirlo, sus items. */
function ProyectoCumplimientoFila({ p }: { p: ProyectoCumplimiento }) {
  const c = contarActividades(p.items);
  const cuentan = c.ok + c.atraso;
  const pct = cuentan > 0 ? Math.round((c.ok / cuentan) * 100) : null;
  const t: Tone = pct === null ? "neutral" : pct >= 90 ? "ok" : pct >= 75 ? "warn" : "bad";
  return (
    <Fila
      cabecera={
        <Cabecera
          nivel={0} titulo={p.proyecto}
          detalle={unidos([
            `${p.items.length} ${p.items.length === 1 ? "item" : "items"}`, `${c.ok} de ${cuentan} a tiempo`,
            c.excusado > 0 && `${c.excusado} ${c.excusado === 1 ? "excusada" : "excusadas"}`,
            c.pendiente > 0 && `${c.pendiente} ${c.pendiente === 1 ? "pendiente" : "pendientes"}`,
          ])}
          derecha={<>
            <Pill tone={t} small>{pct === null ? "—" : `${pct}%`}</Pill>
            {(c.atraso > 0 || c.excusado > 0) && <span className="block text-[0.62rem] text-[var(--text-muted)]">{resp(p.responsableFase)}</span>}
          </>}
        />
      }
      hijos={p.items.map((it) => <ItemCumplimientoFila key={it.id} it={it} />)}
    />
  );
}

/** Un item (entregable) de la Fase 3: no es unidad, agrupa sus actividades. Las pendientes no se listan, solo se cuentan. */
function ItemCumplimientoFila({ it }: { it: ItemCumplimiento }) {
  const c = contarActividades([it]);
  const cuentan = c.ok + c.atraso;
  const visibles = it.actividades.filter((a) => a.estado !== "pendiente");
  const resultado = c.atraso > 0 ? <Pill tone="bad" small>{`✕ ${c.atraso} con atraso`}</Pill>
    : cuentan > 0 ? <Pill tone="ok" small>✓ A tiempo</Pill>
    : c.excusado > 0 ? <Pill tone="neutral" small>Excusado</Pill>
    : <Pill tone="neutral" small>• Sin cerrar</Pill>;
  return (
    <Fila
      cabecera={
        <Cabecera
          nivel={1} titulo={it.nombre}
          detalle={unidos([
            it.status, it.deadline && `límite ${fmtDate(it.deadline)}`, `${c.ok} de ${cuentan} a tiempo`,
            c.pendiente > 0 && `${c.pendiente} ${c.pendiente === 1 ? "pendiente" : "pendientes"}`,
          ])}
          responsable={it.responsable}
          derecha={resultado}
        />
      }
      hijos={visibles.length > 0 ? visibles.map((a) => <ActividadFila key={a.id} a={a} />) : undefined}
    />
  );
}

/** Una actividad (subitem): la unidad que se mide. */
function ActividadFila({ a }: { a: ActividadCumplimiento }) {
  return (
    <Fila
      cabecera={
        <Cabecera
          nivel={2} titulo={a.nombre}
          detalle={unidos([a.status, a.deadline && `límite ${fmtDate(a.deadline)}`, a.cierre && `cerró ${fmtDate(a.cierre)}`])}
          responsable={a.responsable}
          derecha={<Pill tone={tone(a.estado)} small>{txt(a.estado)}</Pill>}
        />
      }
    />
  );
}

/** Un proyecto en Calidad: su nota (% de actividades con calidad 1 entre las que ya se miden) y, al abrirlo, sus items. */
function ProyectoCalidadFila({ p }: { p: ProyectoCalidadCku }) {
  const c = contarCalidad(p.items);
  const medidas = c.buenas + c.malas;
  const nota = medidas > 0 ? Math.round((c.buenas / medidas) * 100) : null;
  const t: Tone = nota === null ? "neutral" : nota >= 90 ? "ok" : nota >= 75 ? "warn" : "bad";
  return (
    <Fila
      cabecera={
        <Cabecera
          nivel={0} titulo={p.proyecto}
          detalle={unidos([
            `${p.items.length} ${p.items.length === 1 ? "item" : "items"}`, `${c.buenas} de ${medidas} con calidad 1`,
            c.sinMedir > 0 && `${c.sinMedir} sin medir`,
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
  const resultado = c.malas > 0 ? <Pill tone="bad" small>{`✕ ${c.malas} con calidad 0`}</Pill>
    : c.buenas > 0 ? <Pill tone="ok" small>✓ Calidad 1</Pill>
    : <Pill tone="neutral" small>• Sin medir</Pill>;
  return (
    <Fila
      cabecera={
        <Cabecera
          nivel={1} titulo={it.nombre}
          detalle={unidos([
            it.status, it.deadline && `límite ${fmtDate(it.deadline)}`, `${c.buenas} de ${medidas} con calidad 1`,
            c.sinMedir > 0 && `${c.sinMedir} sin medir`,
          ])}
          responsable={it.responsable}
          derecha={resultado}
        />
      }
      hijos={visibles.length > 0 ? visibles.map((a) => <ActividadCalidadFila key={a.id} a={a} />) : undefined}
    />
  );
}

const MOTIVO_CALIDAD: Record<MotivoCalidadActividad, string> = {
  "a-tiempo": "1 · cerró a tiempo", "en-curso": "1 · en curso", "nueva-fecha": "0 · nueva fecha límite", "tarde": "0 · cerró tarde",
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
          derecha={<Pill tone={a.nota === 100 ? "ok" : "bad"} small>{a.motivo ? MOTIVO_CALIDAD[a.motivo] : "Sin medir"}</Pill>}
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
          nivel={0} titulo={u.nombre} detalle={u.fase}
          derecha={<>
            <Pill tone={t} small>{u.nota}</Pill>
            <span className="block text-[0.62rem] text-[var(--text-muted)]">{resp(u.responsable)}</span>
          </>}
        />
      }
    />
  );
}
