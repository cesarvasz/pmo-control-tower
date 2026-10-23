"use client";

// Debajo de cada CKU en /players: QUÉ se mide en Cumplimiento de Entrega y en Calidad de
// Entregas — las unidades que entran, el resultado de cada una y cuánto pesa cada fuente
// (Iniciativas / PML / Proyectos, los mismos pesos del EVM). Todo sale de lib/ckuDetalle,
// con la misma cuenta que el scoreboard, así que el % de aquí es el de la tabla.
//
// Se lee como un acordeón, todo plegado al inicio: en Cumplimiento Proyecto (Fase 3) → items → hitos;
// en Calidad Proyecto → sus entregables. Solo se listan las unidades que ENTRAN en la nota, así que
// cada etiqueta cuadra con el % de su fuente.

import { useMemo, useState, type ReactNode } from "react";
import { Pill, type Tone } from "@/components/ui";
import { fmtDate } from "@/lib/business";
import { agruparPorProyecto, detalleCalidad, detalleCumplimiento, FUENTE_LABEL, type DetalleMedicion, type FuenteMedida, type GrupoProyecto, type HitoFase, type ItemFase, type UnidadMedida } from "@/lib/ckuDetalle";
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
        soloFase3 cku={scope.cku}
        regla="Un atraso no penaliza al CKU si tiene un responsable asignado distinto de CKU; sin asignar (o CKU) penaliza. Una Iniciativa o un PML con un atraso así no se cuenta; la Fase 3 de un Proyecto con un atraso así cuenta como a tiempo. Aquí solo se listan las unidades que entran en la nota."
      />
      <Panel
        titulo="Calidad de Entregas" medida="nota promedio" esCalidad detalle={calidad}
        regla="PML e Iniciativas: 100 si tienen un responsable distinto de CKU, 0 si no. Proyectos (entregables de Fase 3): +50 si tienen un responsable distinto de CKU y +50 si se recuperó (ningún hito quedó con Limit Date después del fin de su CPM)."
      />
    </div>
  );
}

function Panel({ titulo, medida, esCalidad = false, soloFase3 = false, cku, detalle, regla }: {
  titulo: string; medida: string; esCalidad?: boolean;
  /** Proyectos cuentan solo con su Fase 3 (Launch) — se avisa en el encabezado del panel. */
  soloFase3?: boolean;
  /** CKU dueño del panel (para rotular los hitos a su cargo). */
  cku?: string;
  detalle: DetalleMedicion; regla: string;
}) {
  // Solo lo que entra en la nota: un PML o Iniciativa con atraso sin penalización no suma ni resta.
  const unidades = detalle.unidades.filter((u) => u.cuenta);
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
        {soloFase3 && <strong className="font-semibold text-[var(--text-secondary)]"> En Proyectos solo cuenta la Fase 3 (Launch) de los proyectos con plantilla nueva.</strong>}
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
      {unidades.length === 0 ? (
        <div className="text-[0.8rem] text-[var(--text-disabled)]">Sin unidades medidas todavía</div>
      ) : (
        <div className="space-y-3">
          {ORDEN.map((f) => {
            const us = unidades.filter((u) => u.fuente === f);
            if (us.length === 0) return null;
            // Calidad de Proyectos: un acordeón por proyecto, con sus entregables adentro.
            const grupos = esCalidad && f === "proj" ? agruparPorProyecto(us) : null;
            return (
              <section key={f}>
                <div className="mb-1 text-[0.62rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {FUENTE_LABEL[f]} · {grupos ? `${grupos.length} ${grupos.length === 1 ? "proyecto" : "proyectos"} · ${us.length} ${us.length === 1 ? "item" : "items"}` : us.length}
                </div>
                <ul className="space-y-1">
                  {grupos
                    ? grupos.map((g) => (
                      <li key={g.proyecto} className="rounded-md border" style={{ borderColor: "var(--border)" }}>
                        <ProyectoCalidad g={g} />
                      </li>
                    ))
                    : us.map((u) => (
                      <li key={u.id} className="rounded-md border" style={{ borderColor: "var(--border)" }}>
                        {esCalidad ? <UnidadCalidad u={u} /> : <UnidadCumplimiento u={u} cku={cku} />}
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
const tone = (e: ItemFase["estado"]): Tone => (e === "atraso" ? "bad" : e === "ok" ? "ok" : "neutral");
const txt = (e: ItemFase["estado"]) => (e === "atraso" ? "✕ Con atraso" : e === "ok" ? "✓ A tiempo" : "• Pendiente");
const unidos = (partes: (string | false | null | undefined)[]) => partes.filter(Boolean).join(" · ");

/** Cuánto pesa el texto de una fila según su nivel: 0 = unidad (proyecto…), 1 = item, 2 = hito. */
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

/** Una unidad de Cumplimiento. Proyecto (Fase 3) → se despliega en items → hitos. Lo que se muestra
 *  es lo que cuenta en la nota: una fase con un atraso que no penaliza cuenta como a tiempo. */
function UnidadCumplimiento({ u, cku }: { u: UnidadMedida; cku?: string }) {
  const items = u.items ?? [];
  const atrasados = items.filter((i) => i.estado === "atraso").length;
  const aTiempo = u.estado !== "atraso";
  const cabecera = (
    <Cabecera
      nivel={0} titulo={u.nombre}
      detalle={unidos([u.fase, items.length > 0 && `${items.length} ${items.length === 1 ? "item" : "items"}`, atrasados > 0 && `${atrasados} con atraso`])}
      derecha={<>
        <Pill tone={aTiempo ? "ok" : "bad"} small>{aTiempo ? "✓ A tiempo" : "✕ Con atraso"}</Pill>
        {u.estado !== "ok" && <span className="block text-[0.62rem] text-[var(--text-muted)]">{resp(u.responsable)}</span>}
      </>}
    />
  );
  return <Fila cabecera={cabecera} hijos={items.length > 0 ? items.map((it) => <ItemFila key={it.id} it={it} cku={cku} />) : undefined} />;
}

/** Un item (entregable) de la Fase 3. La fase sale con atraso si cualquiera de ellos (o de sus hitos) lo tiene. */
function ItemFila({ it, cku }: { it: ItemFase; cku?: string }) {
  const quien = cku ? ` a cargo de ${cku}` : "";
  const sinHitosDelCku = it.hitosTotal > 0 && it.hitos.length === 0;
  const cabecera = (
    <Cabecera
      nivel={1} titulo={it.nombre}
      detalle={unidos([it.status, it.deadline && `límite ${fmtDate(it.deadline)}`, it.hitosEvaluados > 0 && `${it.hitosAtrasados} de ${it.hitosEvaluados} hitos con atraso`])}
      responsable={it.responsable}
      derecha={<Pill tone={tone(it.estado)} small>{txt(it.estado)}</Pill>}
    />
  );
  return (
    <Fila
      cabecera={<>
        {cabecera}
        {sinHitosDelCku && <span className="block text-[0.6rem] text-[var(--text-disabled)]">Ningún hito{quien} ({it.hitosTotal} en total)</span>}
      </>}
      hijos={it.hitos.length > 0 ? <HitosDeItem hitos={it.hitos} total={it.hitosTotal} quien={quien} /> : undefined}
    />
  );
}

/** Los hitos (subitems) de un item que están a cargo del CKU, por fecha límite. */
function HitosDeItem({ hitos, total, quien }: { hitos: HitoFase[]; total: number; quien: string }) {
  const atrasados = hitos.filter((h) => h.estado === "atraso").length;
  return (
    <>
      <div className="px-2 pb-0.5 pt-1 text-[0.58rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {unidos([`${hitos.length} ${hitos.length === 1 ? "hito" : "hitos"}${quien}`, atrasados > 0 && `${atrasados} con atraso`, hitos.length < total && `de ${total} en total`])}
      </div>
      {hitos.map((h) => (
        <Fila
          key={h.id}
          cabecera={
            <Cabecera
              nivel={2} titulo={h.nombre}
              detalle={unidos([h.status, h.deadline && `límite ${fmtDate(h.deadline)}`, h.cierre && `cerró ${fmtDate(h.cierre)}`])}
              responsable={h.responsable}
              derecha={<Pill tone={tone(h.estado)} small>{txt(h.estado)}</Pill>}
            />
          }
        />
      ))}
    </>
  );
}

/** Un proyecto en Calidad: su nota promedio, y al abrirlo sus entregables (items) con la nota de cada uno. */
function ProyectoCalidad({ g }: { g: GrupoProyecto }) {
  const t: Tone = g.nota >= 90 ? "ok" : g.nota >= 75 ? "warn" : "bad";
  const n = g.unidades.length;
  return (
    <Fila
      cabecera={
        <Cabecera
          nivel={0} titulo={g.proyecto}
          detalle={unidos([`${n} ${n === 1 ? "item" : "items"}`, `${g.buenas} con nota 100`, g.enCurso > 0 && `${g.enCurso} en curso`])}
          derecha={<>
            <Pill tone={t} small>{g.nota}</Pill>
            <span className="block text-[0.62rem] text-[var(--text-muted)]">nota promedio</span>
          </>}
        />
      }
      hijos={g.unidades.map((u) => <UnidadCalidad key={u.id} u={u} nivel={1} />)}
    />
  );
}

/** Una unidad de Calidad con su nota (0 / 50 / 100): PML, Iniciativa o, con `nivel` 1, un item de un proyecto. */
function UnidadCalidad({ u, nivel = 0 }: { u: UnidadMedida; nivel?: 0 | 1 }) {
  const t: Tone = u.nota === 100 ? "ok" : u.nota === 0 ? "bad" : "warn";
  return (
    <Fila
      cabecera={
        <Cabecera
          nivel={nivel} titulo={u.nombre} detalle={unidos([u.fase, u.enCurso && "en curso"])}
          derecha={<>
            <Pill tone={t} small>{u.nota}</Pill>
            <span className="block text-[0.62rem] text-[var(--text-muted)]">{resp(u.responsable)}</span>
          </>}
        />
      }
    />
  );
}
