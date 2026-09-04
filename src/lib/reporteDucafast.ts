// src/lib/reporteDucafast.ts
// Reporte Ducafast — documento imprimible mensual (Mesa 2) que compara con/sin
// Ducafast: files, costo, tiempo, capacidad instalada y ahorro. Reemplaza al
// antiguo "Informe de beneficio DUCAFAST" (informe.ts) con un formato más
// ejecutivo — ver ReporteDucafast.tsx.
//
// METODOLOGÍA (verificada contra la hoja 003 real, jun–ago 2026):
//  · Recortado a MESA_REPORTE ("Mesa 2") — la mesa que reporta Ducafast/no
//    Ducafast. El resto del tablero ("003") no se toca.
//  · Mismo alcance T1+T2+T3 y misma tarifa/precio de licencia que el informe
//    anterior (medirGrupo en informe.ts), pero:
//    · El "tiempo por file" es la MEDIANA del tramo T1-T3, no el promedio —
//      el promedio se dispara con la cola de expedientes atascados en cola.
//    · "Capacidad instalada" es el personal real (Usuario ∪ Analista, sin
//      ejecutores automatizados) que aparece en Mesa 2 ese mes — mismo
//      criterio que cargaYCapacidad, aplicado sin el divisor de simultáneos.
//  · Los promedios del período van ponderados por volumen de files de cada
//    mes (nunca como promedio simple de los N meses) — excepto el FTE, que
//    ya es un promedio mensual normalizado y sí se promedia simple.
//  · No responde a los filtros del tablero (igual que el informe anterior):
//    un reporte mensual con un filtro de mes puesto sería una contradicción.

import {
  ALCANCE_UNITARIO, costoTiempo, costoUnitario, contarLicencias,
  cargaYCapacidad, segundosMedidos, mediana, etiquetaMes, mesDe,
  type Expediente,
} from "./tramites";

export const MESA_REPORTE = "Mesa 2";
/** Mismos valores del Business Case que usaba el informe anterior (informe.ts):
 *  $6/hora de tarifa, $1.25 por licencia de digitalización. */
export const PRECIO_LICENCIA_REPORTE = 1.25;
export const TARIFA_REPORTE = 6;
export const HORAS_SEMANA_REPORTE = 44;
export const HORAS_MES_REPORTE = (HORAS_SEMANA_REPORTE * 52) / 12; // 190.67
const MESES_A_MOSTRAR = 6;

export interface GrupoMesDucafast {
  files: number;
  /** Operativo (T1-T3, sin ejecutores automatizados) + licencias, por file. */
  costoFile: number;
  /** Mediana del tramo T1-T3, en minutos. 0 si no hay ningún file con las tres etapas. */
  minutosFile: number;
}

export interface MesDucafast {
  clave: string;
  label: string;
  duca: GrupoMesDucafast;
  nod: GrupoMesDucafast;
  /** Personal real (Usuario ∪ Analista, sin bots) de Mesa 2 ese mes. */
  capacidadInstalada: number;
  totalFiles: number;
  /** 0-1. */
  pctDucafast: number;
  brechaCosto: number;
  /** Minutos. */
  brechaTiempo: number;
  costoMezclado: number;
  filesPorCapacidad: number;
  ahorroGenerado: number;
  metaPorCapturar: number;
  horasDuca: number;
  horasNod: number;
  fteHoy: number;
  fteEscenario: number;
}

export interface ReporteDucafastTotales {
  files: number;
  duca: number;
  nod: number;
  /** Ponderados por volumen de files de cada mes. */
  costoFileDuca: number;
  costoFileNod: number;
  minutosDuca: number;
  minutosNod: number;
  ahorroGenerado: number;
  metaPorCapturar: number;
  /** Suma de (brechaTiempo × duca.files) ÷ 60, en horas. */
  horasAhorradas: number;
  /** Promedio simple de los meses (ya es un promedio mensual normalizado). */
  fteHoy: number;
  fteEscenario: number;
  pctDucafastPrimero: number;
  pctDucafastUltimo: number;
}

export interface ReporteDucafast {
  meses: MesDucafast[];
  totales: ReporteDucafastTotales;
}

function medirGrupoMes(sub: Expediente[]): GrupoMesDucafast {
  if (sub.length === 0) return { files: 0, costoFile: 0, minutosFile: 0 };

  const c = costoTiempo(sub, TARIFA_REPORTE, false, false, ALCANCE_UNITARIO);
  const u = costoUnitario(c);
  const licencias = contarLicencias(sub.filter((e) => segundosMedidos(e, ALCANCE_UNITARIO) > 0)).total;
  const files = u.expedientes;
  const costoLicenciasFile = files > 0 ? (licencias * PRECIO_LICENCIA_REPORTE) / files : 0;

  const tramos = sub
    .filter((e) => ALCANCE_UNITARIO.every((k) => e.etapas[k] != null))
    .map((e) => ALCANCE_UNITARIO.reduce((s, k) => s + (e.etapas[k] as number), 0));
  const segMediana = mediana(tramos);

  return {
    files,
    costoFile: u.operativoPorExpediente + costoLicenciasFile,
    minutosFile: segMediana != null ? segMediana / 60 : 0,
  };
}

/** Meses ("YYYY-MM") con datos de Mesa 2, del más antiguo al más reciente,
 *  excluyendo el mes en curso (va a medias) y quedándose con los últimos N. */
function mesesAMostrar(exps: Expediente[], hoy: Date): string[] {
  const mesActual = mesDe(hoy);
  const claves = [...new Set(exps.map((e) => e.mes).filter(Boolean))]
    .filter((m) => m !== mesActual)
    .sort();
  return claves.slice(-MESES_A_MOSTRAR);
}

/** Promedio de `valor(m)` ponderado por `peso(m)`, sobre los meses con peso > 0. */
function ponderado(meses: MesDucafast[], valor: (m: MesDucafast) => number, peso: (m: MesDucafast) => number): number {
  const pesoTotal = meses.reduce((s, m) => s + peso(m), 0);
  if (pesoTotal <= 0) return 0;
  return meses.reduce((s, m) => s + valor(m) * peso(m), 0) / pesoTotal;
}

function calcularTotales(meses: MesDucafast[]): ReporteDucafastTotales {
  const duca = meses.reduce((s, m) => s + m.duca.files, 0);
  const nod = meses.reduce((s, m) => s + m.nod.files, 0);
  const primero = meses[0], ultimo = meses[meses.length - 1];

  return {
    files: duca + nod, duca, nod,
    costoFileDuca: ponderado(meses, (m) => m.duca.costoFile, (m) => m.duca.files),
    costoFileNod: ponderado(meses, (m) => m.nod.costoFile, (m) => m.nod.files),
    minutosDuca: ponderado(meses, (m) => m.duca.minutosFile, (m) => m.duca.files),
    minutosNod: ponderado(meses, (m) => m.nod.minutosFile, (m) => m.nod.files),
    ahorroGenerado: meses.reduce((s, m) => s + m.ahorroGenerado, 0),
    metaPorCapturar: meses.reduce((s, m) => s + m.metaPorCapturar, 0),
    horasAhorradas: meses.reduce((s, m) => s + (m.brechaTiempo * m.duca.files) / 60, 0),
    fteHoy: meses.length ? meses.reduce((s, m) => s + m.fteHoy, 0) / meses.length : 0,
    fteEscenario: meses.length ? meses.reduce((s, m) => s + m.fteEscenario, 0) / meses.length : 0,
    pctDucafastPrimero: primero?.pctDucafast ?? 0,
    pctDucafastUltimo: ultimo?.pctDucafast ?? 0,
  };
}

export function construirReporteDucafast(todos: Expediente[], hoy: Date = new Date()): ReporteDucafast {
  const mesa2 = todos.filter((e) => e.mesas.includes(MESA_REPORTE));
  const claves = mesesAMostrar(mesa2, hoy);

  const meses: MesDucafast[] = claves.map((clave) => {
    const del = mesa2.filter((e) => e.mes === clave);
    const duca = medirGrupoMes(del.filter((e) => e.ducafast));
    const nod = medirGrupoMes(del.filter((e) => !e.ducafast));
    const totalFiles = duca.files + nod.files;
    const capacidadInstalada = cargaYCapacidad(del, 1)[0]?.personas ?? 0;
    const brechaCosto = nod.costoFile - duca.costoFile;
    const brechaTiempo = nod.minutosFile - duca.minutosFile;
    const horasDuca = (duca.files * duca.minutosFile) / 60;
    const horasNod = (nod.files * nod.minutosFile) / 60;

    return {
      clave, label: etiquetaMes(clave), duca, nod, capacidadInstalada, totalFiles,
      pctDucafast: totalFiles > 0 ? duca.files / totalFiles : 0,
      brechaCosto, brechaTiempo,
      costoMezclado: totalFiles > 0 ? (duca.files * duca.costoFile + nod.files * nod.costoFile) / totalFiles : 0,
      filesPorCapacidad: capacidadInstalada > 0 ? totalFiles / capacidadInstalada : 0,
      ahorroGenerado: brechaCosto * duca.files,
      metaPorCapturar: brechaCosto * nod.files,
      horasDuca, horasNod,
      fteHoy: (horasDuca + horasNod) / HORAS_MES_REPORTE,
      fteEscenario: (totalFiles * duca.minutosFile) / 60 / HORAS_MES_REPORTE,
    };
  });

  return { meses, totales: calcularTotales(meses) };
}
