// ── Informe de beneficio DUCAFAST ────────────────────────────────────────
//
// Reconstruye, sobre los datos vivos de la hoja 003, el informe de seguimiento
// que se presenta en la fase Operación de la metodología VALOR: compara los
// expedientes que pasaron por DUCAFAST contra los que se trabajaron a mano y
// traduce la diferencia a tiempo, dinero, capacidad y ROI.
//
// TRES DECISIONES QUE DEFINEN LO QUE EL INFORME MIDE:
//
// 1. TODO se mide sobre T1+T2+T3 (Creado → Pre-DUCA): tiempo, costo y
//    capacidad. Es el tramo que la automatización toca y el que interesa
//    comparar. La revisión del analista y la firma van después, existen igual
//    con DUCAFAST y sin él, y meterlas diluiría el efecto que se quiere medir.
//
// 2. El costo operativo NO incluye a los ejecutores automatizados: el robot no
//    cobra por hora, cobra por licencia. Su costo entra por el otro lado, en
//    las licencias de digitalización. Por eso el operativo de DUCAFAST es casi
//    cero — no es que se pierda un costo, es que cambió de naturaleza.
//
// 3. Las LICENCIAS se valoran al precio del Business Case, no al de la hoja.
//    Son cosas distintas: el Business Case fijó $1.25 como línea base y la
//    hoja factura $1.10. El informe muestra las dos.
//
// Lo que NO hace: no reparte costos indirectos ni supone que el tiempo de
// calendario es tiempo de trabajo. Las horas salen de la unión de intervalos
// por persona, igual que en el resto del tablero.

import {
  ALCANCE_UNITARIO, ETAPA_KEYS, costoTiempo, costoUnitario, contarLicencias,
  etiquetaMes, mesDe, mediana, segundosMedidos,
  type Expediente, type EtapaKey,
} from "./tramites";

/** Precio por licencia que fijó el Business Case. La hoja factura $1.10. */
export const PRECIO_LICENCIA_BASE = 1.25;
/** Meta anual de licencias del Business Case. */
export const META_LICENCIAS_ANUAL = 40_000;
/** Tarifa con la que se armó el informe de julio 2026. */
export const TARIFA_INFORME = 6;

export interface OpcionesInforme {
  anio: number;
  tarifa: number;
  precioLicencia: number;
  metaLicenciasAnual: number;
}

export interface GrupoInforme {
  /** Expedientes con algo medido: la base de todo lo demás. */
  files: number;
  /** Todos los del grupo en el mes, midan o no. */
  filesTotales: number;
  /** Promedio de T1+T2+T3 por file, en segundos. Solo los que tienen los tres. */
  segTramo: number | null;
  /** Mediana del mismo tramo — el promedio va muy sesgado por la cola. */
  segTramoMediana: number | null;
  /** Files que recorrieron T1, T2 y T3: la base del tiempo. */
  filesTramo: number;
  /**
   * Promedio de T4+T5 (Pre-DUCA → Firma), el tramo que el informe NO cobra.
   * Se mide solo para poder decirlo: los files automatizados pasan más tiempo
   * en revisión, así que parte del tiempo ganado antes se devuelve después.
   */
  segCola: number | null;
  /** Horas de reloj humanas en T1–T3, con el traslape ya unido y sin robots. */
  horas: number;
  costoOperativo: number;
  costoOperativoFile: number;
  licencias: number;
  costoLicencias: number;
  costoLicenciasFile: number;
  /** Operativo + licencias, por file. Es el número que se compara. */
  costoFile: number;
  /**
   * Lo mismo pero midiendo el CICLO COMPLETO. No se presenta: sirve para poder
   * decir cuánto del ahorro de T1–T3 se devuelve en la revisión posterior.
   */
  costoFileCiclo: number;
  personasNecesarias: number;
  personasPresentes: number;
  /**
   * Personas a tiempo completo por cada 1,000 files. Es la forma acotada de la
   * productividad: dividir files ENTRE personas explota cuando las personas
   * tienden a cero, que es exactamente lo que pasa con DUCAFAST en T1–T3.
   */
  personasPorMil: number;
  /** files ÷ personas necesarias. null si no hay tiempo humano que dividir. */
  filesPorPersona: number | null;
}

export interface MesInforme {
  clave: string;
  label: string;
  con: GrupoInforme;
  sin: GrupoInforme;
  /** 1 − tCon/tSin sobre el promedio del tramo. null si falta alguno de los dos. */
  reduccionTiempo: number | null;
  /** (costoFile sin − costoFile con) × files con DUCAFAST. */
  ahorro: number;
  /** El mismo ahorro pero medido de punta a punta. Ver Informe.ahorroCiclo. */
  ahorroCiclo: number;
  /**
   * Cuánto baja el personal necesario por file: 1 − tasaCon ÷ tasaSin.
   *
   * Va como fracción y no como múltiplo a propósito. El múltiplo (files por
   * persona con ÷ sin) divide entre algo que tiende a cero y saltaba entre 16x
   * y 2,607x de un mes a otro sin que la operación cambiara — un número que se
   * derrumba en cuanto alguien lo mira dos veces. Esta forma está acotada a
   * [0,1] y dice lo mismo.
   */
  reduccionPersonal: number | null;
  /** El mes en curso: sus cifras están a medias. */
  parcial: boolean;
}

export interface Scorecard {
  /** Meses con datos que entran en la cuenta. */
  meses: number;
  licencias: number;
  /** Meta prorrateada a los meses medidos, al precio del Business Case. */
  inversionBase: number;
  /** Licencias realmente consumidas al precio del Business Case. */
  inversionReal: number;
  /** Lo mismo, pero al precio que trae la hoja. */
  inversionHoja: number;
  beneficio: number;
  /** (beneficio − inversión) ÷ inversión. */
  roi: number;
  /** beneficio ÷ inversión. */
  multiplo: number;
  licenciasUltimoMes: number;
  metaMensual: number;
}

export interface EscalaCompleta {
  mes: string;
  label: string;
  /** Files del mes, con y sin DUCAFAST juntos. */
  files: number;
  ahorroPorFile: number;
  ahorroMensual: number;
  ahorroAnual: number;
}

export interface Informe {
  anio: number;
  aniosDisponibles: number[];
  tarifa: number;
  precioLicencia: number;
  /** Todos los meses con datos. El último puede venir a medias. */
  meses: MesInforme[];
  /**
   * Último mes completo. Los acumulados llegan hasta aquí: sumar un mes a
   * medias al beneficio mientras la inversión base lo cuenta entero hundiría
   * el ROI por un artefacto del calendario, no por los datos.
   */
  ultimoCompleto: string | null;
  filesCon: number;
  filesSin: number;
  ahorro: number;
  /**
   * Lo que daría el mismo cálculo midiendo el ciclo completo. No es la cifra
   * del informe: está para poder decir cuánto del ahorro de T1–T3 se devuelve
   * en la revisión del analista, que es lo primero que preguntará quien lo lea.
   */
  ahorroCiclo: number;
  /** Promedio simple de las reducciones mensuales, como en el informe original. */
  reduccionPromedio: number | null;
  scorecard: Scorecard;
  /** Qué pasaría si DUCAFAST cubriera el 100% del volumen del último mes completo. */
  escala: EscalaCompleta | null;
}

/** El tramo que sigue al automatizado: revisión del analista y firma. */
const ETAPAS_COLA: EtapaKey[] = ETAPA_KEYS.filter((k) => !ALCANCE_UNITARIO.includes(k));

const VACIO: GrupoInforme = {
  files: 0, filesTotales: 0, segTramo: null, segTramoMediana: null, filesTramo: 0,
  segCola: null,
  horas: 0, costoOperativo: 0, costoOperativoFile: 0,
  licencias: 0, costoLicencias: 0, costoLicenciasFile: 0, costoFile: 0, costoFileCiclo: 0,
  personasNecesarias: 0, personasPresentes: 0, personasPorMil: 0, filesPorPersona: null,
};

function medirGrupo(sub: Expediente[], tarifa: number, precioLicencia: number): GrupoInforme {
  if (sub.length === 0) return { ...VACIO };

  // Costo y plantilla: solo T1–T3 (decisión 1 de la cabecera).
  const c = costoTiempo(sub, tarifa, false, false, ALCANCE_UNITARIO);
  const u = costoUnitario(c);

  // Tiempo: el mismo tramo, y solo donde están los tres tiempos. Un file al
  // que le falta T2 no "tardó menos": no se puede comparar.
  const conTramo = sub.filter((e) => ALCANCE_UNITARIO.every((k) => e.etapas[k] != null));
  const tramos = conTramo.map((e) => ALCANCE_UNITARIO.reduce((s, k) => s + (e.etapas[k] as number), 0));

  // Mismo criterio para la cola: solo files que la recorrieron entera.
  const colas = sub
    .filter((e) => ETAPAS_COLA.every((k) => e.etapas[k] != null))
    .map((e) => ETAPAS_COLA.reduce((s, k) => s + (e.etapas[k] as number), 0));

  // Licencias sobre la misma base de files que el costo, para que el unitario
  // no mezcle numerador y denominador de poblaciones distintas.
  const licencias = contarLicencias(
    sub.filter((e) => segundosMedidos(e, ALCANCE_UNITARIO) > 0),
  ).total;
  const costoLicencias = licencias * precioLicencia;
  const files = u.expedientes;
  const licFile = files > 0 ? costoLicencias / files : 0;

  // Segunda pasada, solo para el contrapeso: el mismo costo pero de punta a
  // punta. Es un cálculo aparte porque unir intervalos de T1–T5 no se deduce
  // de haber unido los de T1–T3.
  const ciclo = costoUnitario(costoTiempo(sub, tarifa));

  return {
    files,
    filesTotales: sub.length,
    segTramo: tramos.length > 0 ? tramos.reduce((s, x) => s + x, 0) / tramos.length : null,
    segTramoMediana: mediana(tramos),
    filesTramo: tramos.length,
    segCola: colas.length > 0 ? colas.reduce((s, x) => s + x, 0) / colas.length : null,
    horas: c.horas,
    costoOperativo: c.costo,
    costoOperativoFile: u.operativoPorExpediente,
    licencias,
    costoLicencias,
    costoLicenciasFile: licFile,
    costoFile: u.operativoPorExpediente + licFile,
    costoFileCiclo: ciclo.operativoPorExpediente + licFile,
    personasNecesarias: u.personasNecesarias,
    personasPresentes: u.personasActuales,
    // Sin redondear las personas: redondear 1.1 a 1 infla la productividad un
    // 13% y el salto se lee como un logro que los datos no respaldan.
    personasPorMil: files > 0 ? (u.personasNecesarias / files) * 1000 : 0,
    filesPorPersona: u.personasNecesarias > 0 ? files / u.personasNecesarias : null,
  };
}

/** Mes en el que se acaban los datos: el único que puede estar a medias. */
function mesFinalDe(exps: Expediente[]): string | null {
  let fin = -Infinity;
  for (const e of exps) {
    for (const d of Object.values(e.hitos)) {
      const t = d.getTime();
      if (t > fin) fin = t;
    }
  }
  return isFinite(fin) ? mesDe(new Date(fin)) : null;
}

/** Años con expedientes, del más reciente al más antiguo. */
export function aniosConDatos(exps: Expediente[]): number[] {
  const s = new Set<number>();
  for (const e of exps) if (e.mes) s.add(Number(e.mes.slice(0, 4)));
  return [...s].sort((a, b) => b - a);
}

export function construirInforme(exps: Expediente[], o: OpcionesInforme): Informe {
  const aniosDisponibles = aniosConDatos(exps);
  const prefijo = `${o.anio}-`;
  const delAnio = exps.filter((e) => e.mes.startsWith(prefijo));
  const claves = [...new Set(delAnio.map((e) => e.mes))].sort();

  // Parcial es el mes donde SE ACABAN los datos, no el último de la lista: al
  // mirar un año pasado desde un volcado más reciente, diciembre está completo
  // aunque sea el último que se dibuja.
  const ultima = mesFinalDe(exps);

  const meses: MesInforme[] = claves.map((clave) => {
    const del = delAnio.filter((e) => e.mes === clave);
    const con = medirGrupo(del.filter((e) => e.ducafast), o.tarifa, o.precioLicencia);
    const sin = medirGrupo(del.filter((e) => !e.ducafast), o.tarifa, o.precioLicencia);
    return {
      clave,
      label: etiquetaMes(clave),
      con, sin,
      reduccionTiempo: con.segTramo != null && sin.segTramo != null && sin.segTramo > 0
        ? 1 - con.segTramo / sin.segTramo
        : null,
      ahorro: (sin.costoFile - con.costoFile) * con.files,
      ahorroCiclo: (sin.costoFileCiclo - con.costoFileCiclo) * con.files,
      reduccionPersonal: sin.personasPorMil > 0 && con.files > 0
        ? 1 - con.personasPorMil / sin.personasPorMil
        : null,
      parcial: clave === ultima,
    };
  });

  // Todo lo acumulado se queda en los meses completos — ver Informe.ultimoCompleto.
  // Si NO hay ninguno (el año entero es un mes a medias) se cuenta todo: un
  // informe vacío no le sirve a nadie, y el asterisco ya avisa.
  const cerrados = meses.filter((m) => !m.parcial);
  const completos = cerrados.length > 0 ? cerrados : meses;
  const suma = (f: (m: MesInforme) => number) => completos.reduce((s, m) => s + f(m), 0);
  const reducciones = completos.map((m) => m.reduccionTiempo).filter((x): x is number => x != null);

  const licencias = suma((m) => m.con.licencias + m.sin.licencias);
  const inversionReal = licencias * o.precioLicencia;
  const beneficio = suma((m) => m.ahorro);
  const metaMensual = o.metaLicenciasAnual / 12;
  const clavesCompletas = new Set(completos.map((m) => m.clave));
  const ref = completos[completos.length - 1];

  const scorecard: Scorecard = {
    meses: completos.length,
    licencias,
    inversionBase: metaMensual * completos.length * o.precioLicencia,
    inversionReal,
    // Misma base que `licencias`: los files medidos de los meses completos.
    inversionHoja: contarLicencias(
      delAnio.filter((e) => clavesCompletas.has(e.mes) && segundosMedidos(e) > 0),
    ).costo,
    beneficio,
    roi: inversionReal > 0 ? (beneficio - inversionReal) / inversionReal : 0,
    multiplo: inversionReal > 0 ? beneficio / inversionReal : 0,
    // El ramp-up se lee del último mes COMPLETO: uno a medias siempre parece
    // un retroceso del consumo cuando solo lleva unos días corridos.
    licenciasUltimoMes: ref ? ref.con.licencias + ref.sin.licencias : 0,
    metaMensual,
  };

  // Escala completa: sobre ese mismo mes completo, para no proyectar sobre un
  // mes a medias. Responde a «¿y si DUCAFAST cubriera todo el volumen?».
  const escala: EscalaCompleta | null = ref && ref.con.files > 0 && ref.sin.files > 0
    ? (() => {
      const files = ref.con.files + ref.sin.files;
      const ahorroPorFile = ref.sin.costoFile - ref.con.costoFile;
      return {
        mes: ref.clave, label: ref.label, files, ahorroPorFile,
        ahorroMensual: files * ahorroPorFile,
        ahorroAnual: files * ahorroPorFile * 12,
      };
    })()
    : null;

  return {
    anio: o.anio,
    aniosDisponibles,
    tarifa: o.tarifa,
    precioLicencia: o.precioLicencia,
    meses,
    ultimoCompleto: ref?.clave ?? null,
    filesCon: suma((m) => m.con.files),
    filesSin: suma((m) => m.sin.files),
    ahorro: beneficio,
    ahorroCiclo: suma((m) => m.ahorroCiclo),
    reduccionPromedio: reducciones.length > 0
      ? reducciones.reduce((s, x) => s + x, 0) / reducciones.length
      : null,
    scorecard,
    escala,
  };
}
