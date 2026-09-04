"use client";

// Reporte Ducafast — documento imprimible mensual (Mesa 2): tira de
// indicadores + 8 secciones numeradas, cada una gráfica + descripción corta.
// Sin párrafos de análisis: los números hablan solos. Reemplaza al antiguo
// "Informe de beneficio DUCAFAST" (informe.ts/Informe.tsx).
//
// Paleta e identidad visual FIJAS (no siguen el tema claro/oscuro del resto
// del tablero): este reporte es un documento que se imprime y se comparte
// fuera de la app, así que su lectura no puede depender de qué tema tenga
// abierto quien lo mire. Ver COLOR más abajo — son los mismos valores del
// PDF (reporteDucafastHtml.ts).

import { useMemo, useState } from "react";
import { construirReporteDucafast, type MesDucafast, type ReporteDucafast as ReporteDucafastData } from "@/lib/reporteDucafast";
import { construirHtmlReporteDucafast } from "@/lib/reporteDucafastHtml";
import type { Expediente } from "@/lib/tramites";

const COLOR = {
  ducafast: "#2a78d6",
  noDucafast: "#eb6834",
  escenario: "#2f8f6f",
  secundaria: "#a9c9ec",
  neutral: "#888780",
  texto: "#1a1a19",
  textoSecundario: "#6b6a66",
  grid: "#e1e0d9",
  superficie: "#f5f4ef",
  tarjeta: "#ffffff",
};

// ── Formato ──────────────────────────────────────────────────────────────
const usd2 = (n: number) => `$${n.toFixed(2)}`;
const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const min1 = (n: number) => `${n.toFixed(1)} min`;
const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;
const num0 = (n: number) => Math.round(n).toLocaleString("en-US");

export default function ReporteDucafast({ exps, onCerrar }: { exps: Expediente[]; onCerrar: () => void }) {
  const rep = useMemo(() => construirReporteDucafast(exps), [exps]);
  const { meses, totales: t } = rep;

  const [bloqueado, setBloqueado] = useState(false);
  const descargarPdf = () => {
    const w = window.open("", "_blank", "width=980,height=760");
    if (!w) { setBloqueado(true); return; }
    setBloqueado(false);
    w.document.write(construirHtmlReporteDucafast(rep));
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* el usuario cerró la ventana */ } }, 300);
  };

  if (meses.length === 0) {
    return (
      <div style={{ color: COLOR.texto }}>
        <Encabezado onCerrar={onCerrar} onDescargar={null} />
        <p className="mt-6 text-[0.85rem]" style={{ color: COLOR.textoSecundario }}>
          No hay files de Mesa 2 en los últimos meses.
        </p>
      </div>
    );
  }

  const primero = meses[0], ultimo = meses[meses.length - 1];
  const reduccionCosto = t.costoFileNod > 0 ? 1 - t.costoFileDuca / t.costoFileNod : 0;
  const multiploTiempo = t.minutosDuca > 0 ? t.minutosNod / t.minutosDuca : 0;
  const metaMensual = t.metaPorCapturar / meses.length;

  return (
    <div style={{ color: COLOR.texto, fontFamily: "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif" }}>
      <Encabezado onCerrar={onCerrar} onDescargar={descargarPdf} bloqueado={bloqueado} />

      {/* ── Tira de indicadores ── */}
      <div className="mt-4 grid grid-cols-2 gap-0 overflow-hidden rounded-xl sm:grid-cols-5" style={{ background: COLOR.superficie }}>
        {[
          { valor: usd2(t.costoFileDuca), label: "Costo por file", nota: `vs ${usd2(t.costoFileNod)} sin Ducafast · ${Math.round(reduccionCosto * 100)}% más barato` },
          { valor: min1(t.minutosDuca), label: "Tiempo por file", nota: `vs ${min1(t.minutosNod)} sin Ducafast · ${multiploTiempo.toFixed(1)} veces` },
          { valor: pct1(t.pctDucafastUltimo), label: "Volumen Ducafast", nota: `${ultimo.label}, desde ${pct1(t.pctDucafastPrimero)} en ${primero.label}` },
          { valor: usd0(t.ahorroGenerado), label: "Ahorro generado", nota: `en ${num0(t.duca)} files y ${num0(t.horasAhorradas)} horas` },
          { valor: usd0(t.metaPorCapturar), label: "Meta de ahorro", nota: `en ${meses.length} meses · ${usd0(metaMensual)} al mes` },
        ].map((k, i) => (
          <div key={i} className="border-r px-4 py-3.5 last:border-r-0" style={{ borderColor: COLOR.grid }}>
            <div className="text-[0.66rem] font-semibold uppercase tracking-wide" style={{ color: COLOR.textoSecundario }}>{k.label}</div>
            <div className="mt-1 text-[1.6rem] font-bold leading-none">{k.valor}</div>
            <div className="mt-1.5 text-[0.68rem] leading-snug" style={{ color: COLOR.textoSecundario }}>{k.nota}</div>
          </div>
        ))}
      </div>

      {/* ── 1. Volumen de files por mes ── */}
      <Seccion n={1} titulo="Volumen de files por mes"
        descripcion={`De ${num0(primero.totalFiles)} files en ${primero.label} a ${num0(ultimo.totalFiles)} en ${ultimo.label}. El volumen mínimo fue ${num0(Math.min(...meses.map((m) => m.totalFiles)))} y el máximo ${num0(Math.max(...meses.map((m) => m.totalFiles)))}; la participación de Ducafast bajó de ${pct1(primero.pctDucafast)} a ${pct1(ultimo.pctDucafast)}.`}>
        <ParDeBarras
          meses={meses}
          a={{ label: "Ducafast", color: COLOR.ducafast, valor: (m) => m.duca.files, etiquetaValor: (m) => num0(m.duca.files), etiquetaSuperior: (m) => usd2(m.duca.costoFile) }}
          b={{ label: "No Ducafast", color: COLOR.noDucafast, valor: (m) => m.nod.files, etiquetaValor: (m) => num0(m.nod.files), etiquetaSuperior: (m) => usd2(m.nod.costoFile) }}
          etiquetaPar={(m) => ({ texto: `${pct1(m.pctDucafast)} Ducafast`, color: COLOR.textoSecundario })}
        />
      </Seccion>

      {/* ── 2. Costo por file ── */}
      <Seccion n={2} titulo="Costo por file"
        descripcion={`El costo por file de Ducafast se mantuvo entre ${usd2(Math.min(...meses.map((m) => m.duca.costoFile)))} y ${usd2(Math.max(...meses.map((m) => m.duca.costoFile)))}; sin Ducafast varió de ${usd2(primero.nod.costoFile)} en ${primero.label} a ${usd2(ultimo.nod.costoFile)} en ${ultimo.label}.`}>
        <GraficaLineas
          meses={meses}
          a={{ label: "Ducafast", color: COLOR.ducafast, dash: false, valor: (m) => m.duca.costoFile }}
          b={{ label: "No Ducafast", color: COLOR.noDucafast, dash: true, valor: (m) => m.nod.costoFile }}
          formato={usd2}
          yMax={12}
          relleno={false}
        />
      </Seccion>

      {/* ── 3. Tiempo por file ── */}
      <Seccion n={3} titulo="Tiempo por file"
        descripcion={`La brecha de tiempo se fue cerrando: ${min1(primero.brechaTiempo)} de diferencia en ${primero.label}, ${min1(ultimo.brechaTiempo)} en ${ultimo.label}. Ducafast se mantuvo entre ${min1(Math.min(...meses.map((m) => m.duca.minutosFile)))} y ${min1(Math.max(...meses.map((m) => m.duca.minutosFile)))} por file.`}>
        <GraficaLineas
          meses={meses}
          a={{ label: "Ducafast", color: COLOR.ducafast, dash: false, valor: (m) => m.duca.minutosFile }}
          b={{ label: "No Ducafast", color: COLOR.noDucafast, dash: true, valor: (m) => m.nod.minutosFile }}
          formato={min1}
          yMax={60}
          relleno
        />
      </Seccion>

      {/* ── 4. Ahorro generado con Ducafast ── */}
      <Seccion n={4} titulo="Ahorro generado con Ducafast"
        descripcion={`Comparando el costo real de los files que sí usaron Ducafast contra lo que habrían costado a la tarifa sin Ducafast del mismo mes. Acumulado del período: ${usd0(t.ahorroGenerado)}, con un máximo mensual de ${usd0(Math.max(...meses.map((m) => m.ahorroGenerado)))} en ${meses.find((m) => m.ahorroGenerado === Math.max(...meses.map((x) => x.ahorroGenerado)))?.label}.`}>
        <ParDeBarras
          meses={meses}
          a={{ label: "Costo real (con Ducafast)", color: COLOR.ducafast, valor: (m) => m.duca.costoFile * m.duca.files, etiquetaValor: (m) => usd0(m.duca.costoFile * m.duca.files) }}
          b={{ label: "Costo a tarifa sin Ducafast", color: COLOR.noDucafast, valor: (m) => m.nod.costoFile * m.duca.files, etiquetaValor: (m) => usd0(m.nod.costoFile * m.duca.files) }}
          etiquetaPar={(m) => ({ texto: `Ahorro ${usd0(m.ahorroGenerado)}`, color: COLOR.texto, negrita: true })}
        />
      </Seccion>

      {/* ── 5. Meta de ahorro por mes ── */}
      <Seccion n={5} titulo="Meta de ahorro por mes"
        descripcion={`El período capturó ${usd0(t.ahorroGenerado)} de una meta total de ${usd0(t.ahorroGenerado + t.metaPorCapturar)} — una captura del ${pct1(t.ahorroGenerado / (t.ahorroGenerado + t.metaPorCapturar))}. Queda ${usd0(t.metaPorCapturar)} por capturar si el resto del volumen migrara a Ducafast.`}>
        <ParDeBarras
          meses={meses}
          a={{ label: "Ahorro generado", color: COLOR.secundaria, valor: (m) => m.ahorroGenerado, etiquetaValor: (m) => usd0(m.ahorroGenerado) }}
          b={{ label: "Meta por capturar", color: COLOR.ducafast, valor: (m) => m.metaPorCapturar, etiquetaValor: (m) => usd0(m.metaPorCapturar) }}
          lineaPromedio={{ valor: metaMensual, color: COLOR.noDucafast, etiqueta: `Promedio meta: ${usd0(metaMensual)}/mes` }}
        />
      </Seccion>

      {/* ── 6. Personas necesarias por mes ── */}
      <Seccion n={6} titulo="Personas necesarias por mes"
        descripcion={`Con el mix actual se necesitan en promedio ${t.fteHoy.toFixed(2)} personas a tiempo completo; si todo el volumen se procesara con Ducafast bastarían ${t.fteEscenario.toFixed(2)} — una reducción de ${(t.fteHoy - t.fteEscenario).toFixed(2)} FTE.`}>
        <ParDeBarras
          meses={meses}
          a={{ label: "Personas hoy (mix actual)", color: COLOR.neutral, valor: (m) => m.fteHoy, etiquetaValor: (m) => m.fteHoy.toFixed(2) }}
          b={{ label: "Escenario 100% Ducafast", color: COLOR.escenario, valor: (m) => m.fteEscenario, etiquetaValor: (m) => m.fteEscenario.toFixed(2) }}
          etiquetaPar={(m) => ({ texto: (m.fteEscenario - m.fteHoy).toFixed(2), color: COLOR.escenario, negrita: true })}
        />
      </Seccion>

      {/* ── 7. Indicadores por mes ── */}
      <Seccion n={7} titulo="Indicadores por mes" descripcion="Desglose mensual completo de las métricas de las secciones anteriores.">
        <TablaIndicadores meses={meses} totales={t} />
      </Seccion>

      {/* ── 8. Costo mezclado y uso de la capacidad ── */}
      <Seccion n={8} titulo="Costo mezclado y uso de la capacidad"
        descripcion={`Costo mezclado (ambas rutas juntas) y files procesados por cada persona instalada en Mesa 2, mes a mes.`}>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div>
            <div className="mb-1.5 text-[0.7rem] font-semibold" style={{ color: COLOR.textoSecundario }}>Costo mezclado por file</div>
            <BarraSimple meses={meses} valor={(m) => m.costoMezclado} formato={usd2} color={COLOR.neutral} />
          </div>
          <div>
            <div className="mb-1.5 text-[0.7rem] font-semibold" style={{ color: COLOR.textoSecundario }}>Files por unidad de capacidad</div>
            <BarraSimple meses={meses} valor={(m) => m.filesPorCapacidad} formato={(n) => n.toFixed(1)} color={COLOR.neutral} />
          </div>
        </div>
      </Seccion>

      {/* ── Nota metodológica ── */}
      <p className="mt-6 border-t pt-3 text-[0.68rem] leading-relaxed" style={{ borderColor: COLOR.grid, color: COLOR.textoSecundario }}>
        <strong>Nota metodológica.</strong> Los promedios del período van ponderados por volumen de
        files, nunca como promedio simple de los {meses.length} meses. Los tiempos se convierten de
        hh:mm:ss a minutos decimales al cargar. La meta de ahorro asume que cada file sin Ducafast se
        hubiera procesado al costo Ducafast de su propio mes. Las horas son la suma de la duración de
        cada file, así que si varios se trabajan en paralelo el tiempo realmente ocupado es menor y
        las personas necesarias son un techo, no una medición exacta de ocupación. La capacidad
        instalada no equivale a personas de tiempo completo dedicadas solo a esto.
      </p>
    </div>
  );
}

// ── Encabezado ───────────────────────────────────────────────────────────
function Encabezado({ onCerrar, onDescargar, bloqueado }: { onCerrar: () => void; onDescargar: (() => void) | null; bloqueado?: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl p-5" style={{ background: COLOR.superficie }}>
        <div>
          <div className="text-[0.66rem] font-bold uppercase tracking-[0.14em]" style={{ color: COLOR.ducafast }}>
            Mesa 2 · Ducafast vs. no Ducafast
          </div>
          <h2 className="mt-1 text-[1.4rem] font-extrabold leading-tight">Reporte Ducafast</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onDescargar && (
            <button onClick={onDescargar}
              title="Abre el diálogo de impresión — elige «Guardar como PDF»"
              className="rounded-lg border px-3.5 py-2 text-[0.78rem] font-semibold transition-colors hover:opacity-80"
              style={{ borderColor: COLOR.ducafast, color: COLOR.ducafast, background: COLOR.tarjeta }}>
              ⬇ Descargar PDF
            </button>
          )}
          <button onClick={onCerrar}
            className="rounded-lg border px-3.5 py-2 text-[0.78rem] font-semibold transition-colors hover:opacity-80"
            style={{ borderColor: COLOR.grid, color: COLOR.textoSecundario, background: COLOR.tarjeta }}>
            ← Volver al tablero
          </button>
        </div>
      </div>
      {bloqueado && (
        <p className="mt-3 rounded-lg px-3 py-2 text-[0.74rem] leading-relaxed" style={{ background: "#fee2e2", color: "#991b1b" }}>
          El navegador bloqueó la ventana emergente. Permítela para este sitio y vuelve a pulsar «Descargar PDF».
        </p>
      )}
    </div>
  );
}

// ── Sección numerada ─────────────────────────────────────────────────────
function Seccion({ n, titulo, descripcion, children }: { n: number; titulo: string; descripcion: string; children: React.ReactNode }) {
  return (
    <section className="mt-6" style={{ breakInside: "avoid" }}>
      <h3 className="text-[0.95rem] font-bold">{n}. {titulo}</h3>
      <div className="mt-2.5">{children}</div>
      <p className="mt-2 text-[0.72rem] leading-relaxed" style={{ color: COLOR.textoSecundario }}>{descripcion}</p>
    </section>
  );
}

// ── Leyenda ──────────────────────────────────────────────────────────────
function Leyenda({ items }: { items: { label: string; color: string; dash?: boolean }[] }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.72rem]" style={{ color: COLOR.textoSecundario }}>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.dash === undefined ? (
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} />
          ) : (
            <svg width="16" height="8" className="shrink-0">
              <line x1={0} y1={4} x2={16} y2={4} stroke={it.color} strokeWidth={2} strokeDasharray={it.dash ? "3,2" : undefined} />
            </svg>
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ── Par de barras agrupadas por mes (nunca apiladas) ─────────────────────
interface SerieBarras {
  label: string;
  color: string;
  valor: (m: MesDucafast) => number;
  etiquetaValor: (m: MesDucafast) => string;
  etiquetaSuperior?: (m: MesDucafast) => string;
}
function ParDeBarras({ meses, a, b, etiquetaPar, lineaPromedio }: {
  meses: MesDucafast[];
  a: SerieBarras; b: SerieBarras;
  etiquetaPar?: (m: MesDucafast) => { texto: string; color: string; negrita?: boolean };
  lineaPromedio?: { valor: number; color: string; etiqueta: string };
}) {
  const ALTO_BARRAS = 130;
  const max = Math.max(1, ...meses.flatMap((m) => [a.valor(m), b.valor(m)]), lineaPromedio?.valor ?? 0);
  const alturaLinea = lineaPromedio ? (lineaPromedio.valor / max) * ALTO_BARRAS : null;

  return (
    <div>
      <Leyenda items={[{ label: a.label, color: a.color }, { label: b.label, color: b.color }, ...(lineaPromedio ? [{ label: lineaPromedio.etiqueta, color: lineaPromedio.color }] : [])]} />
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max items-end gap-4" style={{ height: ALTO_BARRAS + 56 }}>
          {meses.map((m) => {
            const va = a.valor(m), vb = b.valor(m);
            const par = etiquetaPar?.(m);
            return (
              <div key={m.clave} className="flex flex-col items-center" style={{ width: 92 }}>
                {par && (
                  <div className="mb-1 whitespace-nowrap text-[0.72rem]" style={{ color: par.color, fontWeight: par.negrita ? 700 : 500 }}>
                    {par.texto}
                  </div>
                )}
                <div className="relative flex w-full items-end justify-center gap-2" style={{ height: ALTO_BARRAS }}>
                  {alturaLinea != null && (
                    <div className="absolute inset-x-0" style={{ bottom: alturaLinea, borderTop: `2px dashed ${lineaPromedio!.color}` }} />
                  )}
                  {[[a, va], [b, vb]].map(([s, v], i) => {
                    const serie = s as SerieBarras; const valor = v as number;
                    return (
                      <div key={i} className="flex flex-1 flex-col items-center justify-end">
                        {serie.etiquetaSuperior && (
                          <span className="mb-0.5 whitespace-nowrap text-[0.6rem] font-semibold" style={{ color: serie.color }}>
                            {serie.etiquetaSuperior(m)}
                          </span>
                        )}
                        <span className="mb-0.5 whitespace-nowrap text-[0.62rem] font-bold" style={{ color: COLOR.texto }}>
                          {serie.etiquetaValor(m)}
                        </span>
                        <div className="w-full rounded-t-sm" style={{ height: Math.max(2, (valor / max) * (ALTO_BARRAS - 28)), background: serie.color }} />
                      </div>
                    );
                  })}
                </div>
                <span className="mt-1.5 whitespace-nowrap text-[0.68rem]" style={{ color: COLOR.textoSecundario }}>{m.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Barra simple (una serie, gris) ────────────────────────────────────────
function BarraSimple({ meses, valor, formato, color }: {
  meses: MesDucafast[]; valor: (m: MesDucafast) => number; formato: (n: number) => string; color: string;
}) {
  const ALTO_BARRAS = 110;
  const max = Math.max(1, ...meses.map(valor));
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max items-end gap-3" style={{ height: ALTO_BARRAS + 40 }}>
        {meses.map((m) => {
          const v = valor(m);
          return (
            <div key={m.clave} className="flex flex-col items-center" style={{ width: 56 }}>
              <div className="flex w-full flex-1 flex-col items-center justify-end" style={{ height: ALTO_BARRAS }}>
                <span className="mb-0.5 whitespace-nowrap text-[0.62rem] font-bold" style={{ color: COLOR.texto }}>{formato(v)}</span>
                <div className="w-full rounded-t-sm" style={{ height: Math.max(2, (v / max) * (ALTO_BARRAS - 20)), background: color }} />
              </div>
              <span className="mt-1.5 whitespace-nowrap text-[0.66rem]" style={{ color: COLOR.textoSecundario }}>{m.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Gráfica de líneas (Ducafast continua, no Ducafast punteada) ──────────
interface SerieLinea { label: string; color: string; dash: boolean; valor: (m: MesDucafast) => number }
function GraficaLineas({ meses, a, b, formato, yMax, relleno }: {
  meses: MesDucafast[]; a: SerieLinea; b: SerieLinea; formato: (n: number) => string; yMax: number; relleno?: boolean;
}) {
  const ANCHO = Math.max(320, meses.length * 90);
  const ALTO = 190;
  const PAD_T = 26, PAD_B = 22, PAD_X = 30;
  const dominio = Math.max(yMax, ...meses.flatMap((m) => [a.valor(m), b.valor(m)]));
  const n = meses.length;
  const x = (i: number) => (n === 1 ? ANCHO / 2 : PAD_X + (i / (n - 1)) * (ANCHO - PAD_X * 2));
  const y = (v: number) => ALTO - PAD_B - (Math.min(v, dominio) / dominio) * (ALTO - PAD_T - PAD_B);

  const puntosA = meses.map((m, i) => ({ x: x(i), y: y(a.valor(m)), v: a.valor(m) }));
  const puntosB = meses.map((m, i) => ({ x: x(i), y: y(b.valor(m)), v: b.valor(m) }));
  const pathDe = (pts: { x: number; y: number }[]) => pts.map((p, k) => `${k === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  const areaEntre = relleno
    ? `${pathDe(puntosA)} L${puntosB[puntosB.length - 1].x} ${puntosB[puntosB.length - 1].y} ${pathDe([...puntosB].reverse()).replace("M", "L")} Z`
    : "";

  const gridlines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <Leyenda items={[{ label: a.label, color: a.color, dash: false }, { label: b.label, color: b.color, dash: true }]} />
      <div className="overflow-x-auto pb-1">
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width={ANCHO} height={ALTO} style={{ minWidth: ANCHO }}>
          {gridlines.map((g) => {
            const gy = ALTO - PAD_B - g * (ALTO - PAD_T - PAD_B);
            return <line key={g} x1={PAD_X} x2={ANCHO - PAD_X} y1={gy} y2={gy} stroke={COLOR.grid} strokeWidth={1} />;
          })}
          {relleno && areaEntre && <path d={areaEntre} fill={COLOR.ducafast} opacity={0.08} />}
          <path d={pathDe(puntosB)} fill="none" stroke={b.color} strokeWidth={2} strokeDasharray="5,3" />
          <path d={pathDe(puntosA)} fill="none" stroke={a.color} strokeWidth={2} />
          {puntosA.map((p, i) => (
            <g key={`a${i}`}>
              <circle cx={p.x} cy={p.y} r={3} fill={a.color} />
              <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={10} fontWeight={700} fill={a.color}>{formato(p.v)}</text>
            </g>
          ))}
          {puntosB.map((p, i) => (
            <g key={`b${i}`}>
              <circle cx={p.x} cy={p.y} r={3} fill={b.color} />
              <text x={p.x} y={p.y + 16} textAnchor="middle" fontSize={10} fontWeight={700} fill={b.color}>{formato(p.v)}</text>
            </g>
          ))}
          {meses.map((m, i) => (
            <text key={m.clave} x={x(i)} y={ALTO - 4} textAnchor="middle" fontSize={10} fill={COLOR.textoSecundario}>{m.label}</text>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ── Tabla de indicadores por mes ──────────────────────────────────────────
function TablaIndicadores({ meses, totales: t }: { meses: MesDucafast[]; totales: ReporteDucafastData["totales"] }) {
  const capacidadProm = meses.length ? meses.reduce((s, m) => s + m.capacidadInstalada, 0) / meses.length : 0;
  const th = "px-3 py-2 text-left text-[0.66rem] font-bold uppercase tracking-wide";
  const td = "px-3 py-1.5 text-right tabular-nums";
  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: COLOR.grid }}>
      <table className="w-full text-[0.78rem]" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: COLOR.superficie }}>
            <th className={th} style={{ textAlign: "left" }}>Mes</th>
            <th className={th}>Capacidad</th>
            <th className={th}>Volumen Ducafast</th>
            <th className={th}>Costo mezclado</th>
            <th className={th}>Brecha costo</th>
            <th className={th}>Brecha tiempo</th>
            <th className={th}>Ahorro generado</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m, i) => (
            <tr key={m.clave} style={{ background: i % 2 === 1 ? "#faf9f5" : undefined }}>
              <td className="px-3 py-1.5">{m.label}</td>
              <td className={td}>{num0(m.capacidadInstalada)}</td>
              <td className={td}>{num0(m.totalFiles)} · {pct1(m.pctDucafast)}</td>
              <td className={td}>{usd2(m.costoMezclado)}</td>
              <td className={td}>{usd2(m.brechaCosto)}</td>
              <td className={td}>{min1(m.brechaTiempo)}</td>
              <td className={td}>{usd0(m.ahorroGenerado)}</td>
            </tr>
          ))}
          <tr className="border-t-2 font-bold" style={{ borderColor: COLOR.texto }}>
            <td className="px-3 py-2">Total</td>
            <td className={td}>{num0(capacidadProm)}</td>
            <td className={td}>{num0(t.files)} · {pct1(t.duca / t.files)}</td>
            <td className={td}>{usd2((t.costoFileDuca * t.duca + t.costoFileNod * t.nod) / t.files)}</td>
            <td className={td}>{usd2(t.costoFileNod - t.costoFileDuca)}</td>
            <td className={td}>{min1(t.minutosNod - t.minutosDuca)}</td>
            <td className={td}>{usd0(t.ahorroGenerado)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
