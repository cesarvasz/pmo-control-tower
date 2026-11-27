"use client";

// Análisis de tiempos ROI 008 — pestaña «Ducafast SV» de la página ROI.
// Se monta como pestaña: recibe las filas ya cargadas (la carga y el botón
// Actualizar viven en la página padre, igual que en 003) y calcula todo en el
// cliente con las funciones puras de lib/tiempos008.ts + lib/horario008.ts.
//
// Los files y sus tiempos se calculan UNA vez por carga; cada combinación de
// filtros se agrega una sola vez (crearCalculadora). Cliente y Usuario filtran
// todo; Mes filtra todo menos lo que ya es por mes.

import { useMemo, useState } from "react";
import { fmtHabil } from "@/lib/horario008";
import {
  MEDIDAS, MEDIDA_KEYS, MIN_FILES_GRAFICA, SIMULTANEO_SEG, FILTROS_VACIOS,
  prepararFiles, crearCalculadora, opcionesDeFiltro, topUsuarios, hayFiltros, textoMostrando,
  fraseEncabezado, fraseUso, fechaLarga, fmtNum, fmtPct,
  type File008, type Filtros008, type Medida, type Tramo,
} from "@/lib/tiempos008";
import {
  COLOR_DUCAFAST, COLOR_SIN_DUCAFAST, COLOR_TRAMO, DondeSeVa, SelectorTramo, TiemposPorMes, UsoPorMes,
} from "@/components/roi008/Graficas008";
import {
  TablaDetalleMensual, TablaDistribucion, TablaRevisar, TablaTopCadena, TablaTopUsuarios, TablaUso, TablaUsoMes,
} from "@/components/roi008/Tablas008";
import type { Roi008Row } from "@/types";

// ── Piezas ────────────────────────────────────────────────────────────────

/** Sección con el mismo encabezado que SectionHeader, pero que se acomoda en
 *  varias líneas en pantallas angostas (~400 px); los selectores de la sección
 *  van en su propia fila, a la derecha cuando hay espacio. */
function Seccion({ titulo, badge, nota, acciones, children }: {
  titulo: string; badge?: string; nota?: React.ReactNode; acciones?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">{titulo}</h2>
        {badge !== undefined && (
          <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[0.72rem] text-[var(--text-secondary)]">{badge}</span>
        )}
        {acciones && <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">{acciones}</div>}
      </div>
      {children}
      {nota && <p className="mt-2 text-[0.72rem] text-[var(--text-muted)]">{nota}</p>}
    </section>
  );
}

const Caja = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl border p-4 ${className}`} style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
    {children}
  </div>
);

const Etiqueta = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[0.66rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{children}</div>
);

function TarjetaNumero({ label, valor, acento }: { label: string; valor: string; acento?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border p-4"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)", ...(acento ? { borderLeft: `5px solid ${acento}` } : {}) }}>
      <Etiqueta>{label}</Etiqueta>
      <div className="mt-1.5 truncate tabular-nums text-[2rem] font-extrabold leading-none text-[var(--text-primary)]">{valor}</div>
    </div>
  );
}

function TarjetaTramo({ medida, promedio, mediana, n }: {
  medida: Medida; promedio: number | null; mediana: number | null; n: number;
}) {
  const acento = medida === "cadena" ? "var(--text-secondary)" : COLOR_TRAMO[medida];
  return (
    <div className="flex min-w-0 flex-col rounded-xl border p-4"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)", borderTop: `4px solid ${acento}` }}>
      <div className="truncate text-[0.74rem] font-semibold text-[var(--text-primary)]" title={MEDIDAS[medida].label}>
        {MEDIDAS[medida].corto} · <span className="font-normal text-[var(--text-secondary)]">{MEDIDAS[medida].label}</span>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-3">
        {([["Promedio", promedio], ["Mediana", mediana]] as const).map(([l, v]) => (
          <div key={l} className="min-w-0">
            <Etiqueta>{l}</Etiqueta>
            <div className="mt-1 truncate tabular-nums text-[1.35rem] font-extrabold leading-none text-[var(--text-primary)]">{fmtHabil(v)}</div>
          </div>
        ))}
      </div>
      <div className="mt-auto pt-2.5 text-[0.7rem] text-[var(--text-muted)]">{fmtNum(n)} files</div>
    </div>
  );
}

function Selector({ label, valor, opciones, onChange, ancho }: {
  label: string; valor: string | null; opciones: { value: string; label: string }[];
  onChange: (v: string | null) => void; ancho: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${ancho}`}>
      <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      <select value={valor ?? ""} onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-lg border px-2.5 py-2 text-[0.8rem] font-semibold outline-none"
        style={{
          background: "var(--bg-surface)",
          borderColor: valor != null ? "var(--accent)" : "var(--border)",
          color: valor != null ? "var(--accent-light)" : "var(--text-secondary)",
        }}>
        <option value="">Todos</option>
        {opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        {/* Tras Actualizar, el valor elegido puede ya no venir en la hoja: se sigue mostrando, no se finge «Todos». */}
        {valor != null && !opciones.some((o) => o.value === valor) && <option value={valor}>{valor}</option>}
      </select>
    </label>
  );
}

// ── Faltan columnas ───────────────────────────────────────────────────────

function ErrorColumnas({ faltan }: { faltan: string[] }) {
  return (
    <div className="my-5 rounded-lg border px-6 py-5"
      style={{ background: "var(--pill-atrasado-bg)", borderColor: "var(--pill-atrasado-br)", color: "var(--pill-atrasado-fg)" }}>
      <strong>Faltan columnas en la pestaña «008»</strong>
      <br />
      No se calculó nada para no mostrar números incompletos. {faltan.length === 1 ? "Falta" : "Faltan"}:{" "}
      <strong>{faltan.join(", ")}</strong>. Revisa los encabezados de la fila 1 de la hoja y luego pulsa Actualizar.
    </div>
  );
}

// ── Reporte ───────────────────────────────────────────────────────────────

export default function ReporteTiempos008({ rows, columnas }: {
  rows: Roi008Row[];
  /** Encabezados de la pestaña (los manda /api/roi/008); sin ellos se usan las claves de la primera fila. */
  columnas?: string[];
}) {
  const prep = useMemo(() => prepararFiles(rows, columnas), [rows, columnas]);
  if (!prep.ok) return <ErrorColumnas faltan={prep.faltan} />;
  return <Tablero files={prep.files} sinFechaFile={prep.sinFechaFile} />;
}

const ORDEN_TOP: { value: Medida; label: string }[] = [
  { value: "cadena", label: "Cadena completa" },
  { value: "t1", label: "T1" },
  { value: "t2", label: "T2" },
  { value: "t3", label: "T3" },
];

function Tablero({ files, sinFechaFile }: { files: File008[]; sinFechaFile: number }) {
  const [f, setF] = useState<Filtros008>(FILTROS_VACIOS);
  const [tramoMes, setTramoMes] = useState<Tramo>("t3");
  const [ordenTop, setOrdenTop] = useState<Medida>("cadena");
  const [metodo, setMetodo] = useState(false);

  const calcular = useMemo(() => crearCalculadora(files), [files]);
  const opciones = useMemo(() => opcionesDeFiltro(files), [files]);
  const { agregados: a, porMes } = useMemo(() => calcular(f), [calcular, f]);
  const top = useMemo(() => topUsuarios(a.usuariosTiempo, ordenTop), [a.usuariosTiempo, ordenTop]);

  const set = (p: Partial<Filtros008>) => setF((x) => ({ ...x, ...p }));
  const frase = fraseEncabezado(a);
  const fraseMes = fraseUso(porMes);
  const sinDucafast = a.resumen.con === 0;
  const msgSinDucafast = "Sin files con Ducafast con estos filtros.";

  return (
    <div className="viz-etapas">
      {/* ── Encabezado ── */}
      <h2 className="text-lg font-bold text-[var(--text-primary)]">Análisis de tiempos ROI 008</h2>

      {/* ── Filtros ── */}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Selector label="Mes de creación" valor={f.mes} opciones={opciones.meses}
          onChange={(v) => set({ mes: v })} ancho="w-full sm:w-44" />
        <Selector label="Cliente" valor={f.cliente} opciones={opciones.clientes.map((c) => ({ value: c, label: c }))}
          onChange={(v) => set({ cliente: v })} ancho="w-full sm:w-72" />
        <Selector label="Usuario" valor={f.usuario} opciones={opciones.usuarios.map((u) => ({ value: u, label: u }))}
          onChange={(v) => set({ usuario: v })} ancho="w-full sm:w-56" />
        {hayFiltros(f) && (
          <button onClick={() => setF(FILTROS_VACIOS)}
            className="whitespace-nowrap rounded-lg border px-3.5 py-2 text-[0.8rem] text-[var(--text-muted)] transition-colors hover:border-[var(--bad)] hover:text-[var(--bad)]"
            style={{ borderColor: "var(--border)" }}>
            ✕ Quitar filtros
          </button>
        )}
      </div>
      <p className="mt-2 text-[0.74rem] text-[var(--text-muted)]">
        Mostrando: <span className="text-[var(--text-secondary)]">{textoMostrando(f)}</span>
      </p>

      <div className="mt-4">
        <p className="max-w-4xl text-[0.92rem] leading-relaxed text-[var(--text-primary)]">
          {frase ?? "Con estos filtros no hay files con Ducafast que tengan la cadena completa (T1, T2 y T3)."}
        </p>
        <p className="mt-1 text-[0.72rem] text-[var(--text-muted)]">
          {a.rango.desde != null && a.rango.hasta != null ? (
            <>{fmtNum(a.resumen.total)} files creados entre el {fechaLarga(a.rango.desde)} y el {fechaLarga(a.rango.hasta)}; </>
          ) : <>Sin files con estos filtros; </>}
          {fmtNum(a.resumen.con)} tienen Ducafast y son los que llevan tiempos. Horas hábiles (hh:mm:ss), lunes a viernes de 8:00 a 18:00.
          {sinFechaFile > 0 && <> {fmtNum(sinFechaFile)} filas sin Fecha_file no se cuentan.</>}
        </p>
      </div>

      {/* ── Resumen ── */}
      <Seccion titulo="Resumen">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <TarjetaNumero label="Files (total)" valor={fmtNum(a.resumen.total)} />
          <TarjetaNumero label="Con Ducafast" valor={fmtNum(a.resumen.con)} acento={COLOR_DUCAFAST} />
          <TarjetaNumero label="Sin Ducafast" valor={fmtNum(a.resumen.sin)} acento={COLOR_SIN_DUCAFAST} />
          <TarjetaNumero label="Uso de Ducafast" valor={fmtPct(a.resumen.uso)} />
        </div>
      </Seccion>

      {/* ── Tiempo por tramo ── */}
      <Seccion titulo="Tiempo por tramo" badge="files con Ducafast">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {MEDIDA_KEYS.map((k) => (
            <TarjetaTramo key={k} medida={k} promedio={a.medidas[k].promedio} mediana={a.medidas[k].mediana} n={a.medidas[k].n} />
          ))}
        </div>
      </Seccion>

      {/* ── ¿Dónde se va el tiempo? ── */}
      <Seccion titulo="¿Dónde se va el tiempo?" badge={a.aporte.n ? `${fmtNum(a.aporte.n)} files con cadena completa` : undefined}>
        <Caja><DondeSeVa aporte={a.aporte} /></Caja>
      </Seccion>

      {/* ── Tiempos por mes ── */}
      <Seccion titulo="Tiempos por mes" badge="files con Ducafast"
        acciones={<SelectorTramo valor={tramoMes} onChange={setTramoMes} />}
        nota={<>Un tramo solo se mide cuando tiene sus dos fechas: en los meses recientes {MEDIDAS[tramoMes].corto} puede
          verse más corto porque faltan los files que siguen abiertos. No se dibujan los meses con menos
          de {MIN_FILES_GRAFICA} files con Ducafast (sí están en el detalle mensual).</>}>
        <Caja><TiemposPorMes porMes={porMes} tramo={tramoMes} /></Caja>
      </Seccion>

      {/* ── Files con y sin Ducafast ── */}
      <Seccion titulo="Files con y sin Ducafast">
        {fraseMes && <p className="mb-3 max-w-4xl text-[0.84rem] text-[var(--text-secondary)]">{fraseMes}</p>}
        <Caja><UsoPorMes porMes={porMes} /></Caja>
        <div className="mt-3"><TablaUsoMes porMes={porMes} /></div>
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TablaUso titulo="Usuario" filas={a.porUsuario} />
          <TablaUso titulo="Cliente" filas={a.porCliente} />
        </div>
      </Seccion>

      {/* ── Top 10 usuarios con más tiempo ── */}
      <Seccion titulo="Top 10 usuarios con más tiempo" badge="files con Ducafast"
        acciones={
          <label className="flex items-center gap-2 text-[0.74rem] text-[var(--text-muted)]">
            Ordenar por el promedio de
            <select value={ordenTop} onChange={(e) => setOrdenTop(e.target.value as Medida)}
              className="rounded-lg border px-2.5 py-1.5 text-[0.78rem] font-semibold outline-none"
              style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              {ORDEN_TOP.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        }
        nota="Revisa la columna de files medidos: un usuario con pocos files puede quedar arriba por unos pocos casos largos.">
        {sinDucafast ? <Caja><p className="text-center text-[0.8rem] text-[var(--text-muted)]">{msgSinDucafast}</p></Caja>
          : <TablaTopUsuarios filas={top} medida={ordenTop} />}
      </Seccion>

      {/* ── Detalle mensual de tiempos ── */}
      <Seccion titulo="Detalle mensual de tiempos" badge="files con Ducafast">
        <TablaDetalleMensual porMes={porMes} />
      </Seccion>

      {/* ── Distribución por rangos ── */}
      <Seccion titulo="Distribución por rangos de tiempo" badge="files con Ducafast"
        nota="Cada rango va desde su límite inferior (incluido) hasta el superior (sin incluir), en horas hábiles. % sobre los files medidos en cada tramo.">
        {sinDucafast ? <Caja><p className="text-center text-[0.8rem] text-[var(--text-muted)]">{msgSinDucafast}</p></Caja>
          : <TablaDistribucion filas={a.distribucion} />}
      </Seccion>

      {/* ── Los 10 files con la cadena más larga ── */}
      <Seccion titulo="Los 10 files con la cadena más larga">
        <TablaTopCadena files={a.topCadena} />
      </Seccion>

      {/* ── Files a revisar ── */}
      <Seccion titulo="Files a revisar: solicitud antes de la clasificación"
        badge={a.revisar.length ? fmtNum(a.revisar.length) : undefined}>
        <TablaRevisar files={a.revisar} />
      </Seccion>

      {/* ── Cómo se calcularon los tiempos ── */}
      <section className="mt-7 mb-4">
        <button onClick={() => setMetodo((v) => !v)} aria-expanded={metodo}
          className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
          <span className="text-[var(--accent-light)]">{metodo ? "▾" : "▸"}</span> Cómo se calcularon los tiempos
        </button>
        {metodo && (
          <Caja className="mt-3">
            <ul className="list-disc space-y-1.5 pl-5 text-[0.8rem] leading-relaxed text-[var(--text-secondary)]">
              <li><strong>Ducafast</strong> = el file tiene fecha en DPR. Solo esos llevan tiempos; los demás solo cuentan como «Sin Ducafast».</li>
              <li><strong>Horario hábil:</strong> lunes a viernes de 8:00 a 18:00 corrido (10 h por día). No se descuenta almuerzo ni asuetos; sábado y domingo no cuentan.</li>
              <li><strong>Marcas fuera de horario:</strong> cuentan desde el siguiente momento hábil (antes de las 8:00 o en fin de semana) o hasta el último momento hábil antes de ellas (después de las 18:00).</li>
              <li><strong>Tramos:</strong> T1 = Creado → DPR · T2 = DPR → Clasificación exacta · T3 = Clasificación exacta → Solicitud prepóliza. Cada tramo se mide solo cuando tiene sus dos fechas; si falta Creado, T1 no se mide.</li>
              <li><strong>Cadena</strong> = T1 + T2 + T3 del mismo file, solo cuando tiene los tres tramos medidos.</li>
              <li><strong>T2 simultáneo:</strong> DPR y Clasificación exacta con {SIMULTANEO_SEG} segundos o menos de diferencia en reloj.</li>
              <li><strong>T3 invertido:</strong> la solicitud de prepóliza es anterior a la clasificación exacta. Esos files salen de T3 y de la cadena (sí cuentan en T1 y T2) y van a «Files a revisar».</li>
              <li><strong>Mes:</strong> sale de Fecha_file (la creación del file). Las fechas se leen como hora local de la hoja, sin convertir zona horaria.</li>
              <li><strong>Estadísticas:</strong> promedio y mediana (con un número par de files, la mediana es el promedio de los dos del centro).</li>
            </ul>
          </Caja>
        )}
      </section>
    </div>
  );
}
