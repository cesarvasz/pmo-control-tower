"use client";

// Reporte "Digitalización OCR" (pestaña "009"). Se monta como pestaña dentro de
// la página ROI; recibe las filas ya cargadas (la carga y el botón Actualizar
// viven en la página padre) y calcula todo con las funciones puras de
// lib/digitalizacion.ts + lib/ocrHabil.ts.
//
// Los files se construyen UNA sola vez por carga; los filtros solo seleccionan
// subconjuntos. Todo el tablero gira alrededor de dos tiempos hábiles por file:
// T1 (Creación→documentos) y T2 (documentos→carta de licencia).

import { useMemo, useState } from "react";
import { SectionHeader } from "@/components/ui";
import type { OcrRow } from "@/types";
import {
  construirFiles, opcionesDeFiltro, rangoFechas, filtrar,
  calcularKpis, serie, porCliente, porFile,
  FILTROS_VACIOS, type Filtros, type StatSel,
} from "@/lib/digitalizacion";
import FiltrosOcr from "./FiltrosOcr";
import ResumenTiempoOcr from "./ResumenTiempoOcr";
import GraficasOcr from "./GraficasOcr";
import TablasOcr from "./TablasOcr";
import NotaMetodologicaOcr from "./NotaMetodologicaOcr";
import { nEs } from "./fmt";

export default function ReporteOcr({ rows }: { rows: OcrRow[] }) {
  const [f, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [stat, setStat] = useState<StatSel>("prom");

  const todos = useMemo(() => construirFiles(rows), [rows]);
  const opciones = useMemo(() => opcionesDeFiltro(todos), [todos]);
  const rango = useMemo(() => rangoFechas(todos), [todos]);

  const files = useMemo(() => filtrar(todos, f), [todos, f]);
  const kpis = useMemo(() => calcularKpis(files), [files]);
  const puntos = useMemo(() => serie(files, f), [files, f]);
  const clientes = useMemo(() => porCliente(files), [files]);
  const detalleFiles = useMemo(() => porFile(files), [files]);

  const set = (p: Partial<Filtros>) => setFiltros((x) => ({ ...x, ...p }));
  const hayFiltros =
    f.clientes.length > 0 || f.maxHoras !== "todos" || f.soloCompletos ||
    (!!f.desde && f.desde !== rango.desde) || (!!f.hasta && f.hasta !== rango.hasta);
  const limpiar = () => setFiltros({ ...FILTROS_VACIOS, agrupar: f.agrupar });

  return (
    // viz-etapas: define --etapa-1..4 (colores de T1 y T2 en KPIs, gráfica y tablas).
    <div className="viz-etapas">
      <SectionHeader
        title="Digitalización OCR"
        badge={`${nEs(files.length)} de ${nEs(todos.length)} files`}
      />

      <FiltrosOcr
        opciones={opciones}
        f={f}
        setF={set}
        rango={rango}
        hayFiltros={hayFiltros}
        onLimpiar={limpiar}
      />

      <ResumenTiempoOcr k={kpis} stat={stat} onStat={setStat} />

      <GraficasOcr serie={puntos} stat={stat} />

      <TablasOcr clientes={clientes} files={detalleFiles} serie={puntos} />

      <NotaMetodologicaOcr />
    </div>
  );
}
