// Pop-up «Nueva iniciativa»: qué columnas pide (las llena el PM), cuáles solo muestra (Sponsor, que viene de
// la Estrategia) y cuáles nacen solas o las calcula la app al crearla (Ini ID, fecha de creación, fecha límite
// de la Meeting 1 y si ya está agendada). El status (New) y el grupo (Nuevas Iniciativas) los pone la categoría
// (formulario-alta.ts) y no se muestran. Lógica PURA: las columnas se reconocen por tipo y título.

import { claseDeAprobacion } from "@/lib/ini";
import { recordatorioPlanFuturo } from "./acciones-iniciativa";
import { claveNombre } from "./personas";
import { columnasDe, type Columna } from "./tablero";
import { app, type ConfigApp } from "./tipos-columna/app";

export interface ColumnasNuevaIni {
  status?: Columna;
  pm?: Columna;
  cku?: Columna;
  estrategia?: Columna;
  /** Espejo de la Estrategia: se muestra, no se llena. */
  sponsor?: Columna;
  proceso?: Columna;
  iniId?: Columna;
  creacion?: Columna;
  /** Fecha en que se realizó la Meeting 1 (la anota «✓ Completar»). */
  meet1?: Columna;
  /** Fecha de la Meeting 2. */
  meet2?: Columna;
  /** Fecha en que se retoma una iniciativa en Plan Futuro. */
  planFuturo?: Columna;
  /** Desde cuándo está «En Espera» (Sin Valor Def): de ahí cuentan los recordatorios. */
  espera?: Columna;
  /** Casilla PKU: marcada, el sistema de recordatorios no manda correos. */
  pku?: Columna;
  /** Calculada: el día en que Sin Beneficio Definido se cierra (o se cerró) sin aprobarse. */
  esperaCierre?: Columna;
  fechaLimite?: Columna;
  reunion?: Columna;
  reunionEstado?: Columna;
  /** Salud que calcula la app (On track · At risk · Off track): de aquí sale el «Status» que se muestra. */
  salud?: Columna;
  /** La fecha de la acción que sigue (calculada por la app). */
  proximaAccion?: Columna;
  // Lo que se llena ya creada (sección aparte, no obligatoria):
  /** «Benefit» de Monday (numero $); se muestra como «Beneficio $». */
  beneficio?: Columna;
  presupuesto?: Columna;
  kpi?: Columna;
  /** Legal · Normativo · Estratégico. */
  tipo?: Columna;
}

const campoApp = (c: Columna) => (c.tipo === "app" ? (app.config.validar(c.config) as ConfigApp).campo : undefined);

export function columnasNuevaIni(columnas: Columna[]): ColumnasNuevaIni {
  const items = columnasDe(columnas, "item", true);
  const porTitulo = (titulo: string, tipo?: string) =>
    items.find((c) => claveNombre(c.titulo) === claveNombre(titulo) && (!tipo || c.tipo === tipo));
  const porCampo = (campo: string) => items.find((c) => campoApp(c) === campo);
  return {
    status: items.find((c) => c.tipo === "status" && c.rol === "status") ?? porTitulo("Status", "status"),
    pm: items.find((c) => c.tipo === "persona" && c.rol === "responsable") ?? porTitulo("PM", "persona"),
    cku: porTitulo("CKU", "persona"),
    estrategia: items.find((c) => c.tipo === "relacion" && claveNombre(c.titulo).startsWith("estrategia")),
    sponsor: porTitulo("Sponsor"),
    proceso: porTitulo("Proceso"),
    iniId: items.find((c) => c.tipo === "autonumero"),
    creacion: items.find((c) => c.tipo === "creacion"),
    meet1: porTitulo("Meet 1", "fecha"),
    meet2: porTitulo("Meet 2", "fecha"),
    planFuturo: porTitulo("Plan Futuro", "fecha"),
    espera: porTitulo("En Espera", "fecha"),
    pku: porTitulo("PKU", "checkbox"),
    esperaCierre: porCampo("espera_cierre"),
    fechaLimite: porCampo("fecha_limite"),
    reunion: porCampo("reunion"),
    reunionEstado: porCampo("reunion_estado"),
    salud: porCampo("salud"),
    proximaAccion: porCampo("proxima_accion"),
    beneficio: porTitulo("Beneficio", "numero") ?? porTitulo("Benefit", "numero"),
    presupuesto: porTitulo("Presupuesto", "numero"),
    kpi: porTitulo("KPI"),
    tipo: porTitulo("Tipo de iniciativa", "dropdown"),
  };
}

/** Lo que se llena ya creada la iniciativa (sección aparte, opcional), en este orden, con la etiqueta a mostrar. */
export function camposDespues(k: ColumnasNuevaIni): { columna: Columna; etiqueta: string }[] {
  const l: [Columna | undefined, string][] = [[k.beneficio, "Beneficio $"], [k.presupuesto, "Presupuesto $"], [k.kpi, "KPI"], [k.tipo, "Tipo de iniciativa"]];
  return l.filter((x): x is [Columna, string] => !!x[0]).map(([columna, etiqueta]) => ({ columna, etiqueta }));
}

/** Lo que llena el PM, en este orden (las que existan). El nombre va aparte (no es columna). */
export function camposQueLlena(k: ColumnasNuevaIni): Columna[] {
  return [k.pm, k.cku, k.estrategia, k.proceso].filter((c): c is Columna => !!c);
}

const vacio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);

/** El título para mostrar (sin el emoji de la columna: «Estrategia 🔝» → «Estrategia»). */
export const tituloCampo = (c: Columna) => c.titulo.replace(/\s*🔝\s*/u, " ").trim();

/** Una lista desplegable sin opciones no se puede llenar: no se exige hasta que tenga opciones. */
export const sinOpciones = (c: Columna) => c.tipo === "dropdown" && ((c.config as { opciones?: unknown[] } | null)?.opciones ?? []).length === 0;

/** Lo que falta para poder crearla: todo lo de la pestaña Datos es obligatorio (la bitácora no). Títulos, en orden. */
export function faltantes(nombre: string, campos: Columna[], valores: Record<string, unknown>): string[] {
  return [
    ...(nombre.trim() ? [] : ["Nombre"]),
    ...campos.filter((c) => !sinOpciones(c) && vacio(valores[c.id])).map(tituloCampo),
  ];
}

/**
 * ¿A esta iniciativa se le piden completos los datos obligatorios (PM, CKU, Estrategia, Proceso)? Solo a las que siguen en el embudo
 * o en Plan Futuro. Las aprobadas (PM "X"), las que están en espera (Sin Valor Def) y las de Cambio estrategia se dejan como vinieron
 * de Monday: no se les pide nada.
 */
export function pideDatosCompletos(statusTexto: string | null | undefined): boolean {
  const st = claveNombre(statusTexto ?? "");
  return !claseDeAprobacion(statusTexto ?? "") && st !== "sin valor def" && st !== "cambio estrategia";
}

export type StatusIni ="On Track" | "Off Track" | "Plan Futuro" | "Sin Beneficio Definido" | `Aprobada · Clase ${"A" | "B" | "C"}`;

/** Los status que son de etapa (se ven con el color de su etapa) y no de salud. */
export const esStatusDeEtapa = (s: StatusIni) => s !== "On Track" && s !== "Off Track";

/** El Status que se muestra de una iniciativa. Mientras corre el embudo (New, Meeting 1, Meeting 2): la salud que ya calcula la app (la
 *  misma que cuenta en el EVM del PM) en dos valores: «At risk» (menos de 3 días hábiles sin reunión agendada) se muestra como On Track.
 *  Ya fuera del embudo, lo que es: «Plan Futuro», «Sin Beneficio Definido» (la etapa «Sin Valor Def») o «Aprobada · Clase X» (PM "X").
 *  null = no aplica (p. ej. Cambio estrategia) o no se puede decidir (sin calendario). La etapa real (New, Meeting 1…) sigue guardada
 *  en la columna Status. */
export function statusIni(salud: unknown, etapa?: string | null): StatusIni | null {
  const e = claveNombre(etapa ?? "");
  if (e === "plan futuro") return "Plan Futuro";
  if (e === "sin valor def") return "Sin Beneficio Definido";
  const clase = claseDeAprobacion(etapa ?? "");
  if (clase) return `Aprobada · Clase ${clase}`;
  const s = typeof salud === "string" ? claveNombre(salud) : "";
  if (s === "off track") return "Off Track";
  if (s === "on track" || s === "at risk") return "On Track";
  return null;
}

/** El número de un Ini ID («IN-123» → 123); null si no tiene. */
export function numeroIniId(v: unknown): number | null {
  const m = typeof v === "string" ? /(\d+)\s*$/.exec(v) : null;
  return typeof v === "number" ? v : m ? Number(m[1]) : null;
}

/** Las más nuevas primero (Ini ID mayor arriba); las que no tienen Ini ID, al final. */
export function porIniIdDesc<T>(lista: T[], iniIdDe: (x: T) => unknown): T[] {
  return [...lista].sort((a, b) => (numeroIniId(iniIdDe(b)) ?? -1) - (numeroIniId(iniIdDe(a)) ?? -1));
}

// ── Timeline de la iniciativa ─────────────────────────────────────────────────────────────────────
// Cada acción es una flecha: las completadas en verde, la siguiente en amarillo (con su fecha debajo) y las
// que vienen después en gris. Creado → Meeting 1 → la acción que se eligió al completarla (Meeting 2, Plan Futuro,
// Sin Beneficio Definido o Aprobada); la etapa (Status) dice en cuál va.

export type EstadoPaso = "hecho" | "siguiente" | "pendiente";
export interface PasoTimeline {
  clave: string;
  /** Lo que va dentro de la flecha. */
  accion: string;
  estado: EstadoPaso;
  /** La fecha que va debajo (ya formateada); null = sin fecha. */
  fecha: string | null;
  /** De dónde sale la fecha («completada», «agendada», «fecha límite»…). */
  detalle: string | null;
  /** Una línea más debajo (el recordatorio de Plan Futuro o de Sin Beneficio Definido). */
  nota?: string | null;
  /** Se puede completar a mano con el botón «✓ Completar» (la Meeting 1, la Meeting 2 y el Plan Futuro). */
  completable?: boolean;
}

/** «2026-11-16 16:59:04 UTC» (Creation log) → «2026-11-16» en hora de Guatemala (UTC-6, sin horario de verano). */
export function diaDeCreacion(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = new Date(v.trim().replace(" UTC", "Z").replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
  return new Date(d.getTime() - 6 * 3600_000).toISOString().slice(0, 10);
}

export function pasosIniciativa(d: {
  /** Texto del status («New», «Meeting 1»…). */
  status: string | null;
  /** Creation log tal cual. */
  creacion: unknown;
  /** Fecha (YYYY-MM-DD) de la Meeting 1 si se registró. */
  meet1: unknown;
  /** Fecha y hora en que se completó la Meeting 1 (ya formateada), si hay registro. */
  meet1Momento?: string | null;
  /** Fecha y hora en que se completó la Meeting 2 (ya formateada), si hay registro. */
  meet2Momento?: string | null;
  /** Fecha y hora en que se completó el Plan Futuro (ya formateada), si hay registro. */
  planFuturoMomento?: string | null;
  /** Fecha y hora en que se completó Sin Beneficio Definido (con «Completar» o aprobándola), ya formateada, si hay registro. */
  sinBeneficioMomento?: string | null;
  /** La columna «Cierre de espera» (YYYY-MM-DD): el día en que Sin Beneficio Definido se cierra o se cerró sin aprobarse. */
  esperaCierre?: unknown;
  /** Fecha (YYYY-MM-DD) de la Meeting 2 y del Plan Futuro. */
  meet2?: unknown;
  planFuturo?: unknown;
  /** Desde cuándo está en espera (YYYY-MM-DD). */
  espera?: unknown;
  /** La columna «Próxima acción» (YYYY-MM-DD): para Sin Beneficio Definido, el próximo recordatorio (con el registro de envíos). */
  proximaAccion?: unknown;
  /** Hoy en Guatemala (YYYY-MM-DD): para marcar el recordatorio que ya tocó. */
  hoy?: string;
  /** Fecha límite (YYYY-MM-DD) de la reunión que toca (5 días hábiles para la Meeting 1; 10 para la Meeting 2). */
  fechaLimite: unknown;
  /** «Reunión agendada» del calendario: «20 nov 2026 · 10:00», «Sin agendar» o null. */
  reunion: unknown;
  /** Da formato a una fecha YYYY-MM-DD. */
  fmt(ymd: string): string;
}): PasoTimeline[] {
  const ymd = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const creado = diaDeCreacion(d.creacion);
  const pasos: PasoTimeline[] = [{ clave: "creado", accion: "Creado", estado: "hecho", fecha: creado ? d.fmt(creado) : null, detalle: null }];

  /** Una reunión pendiente: amarilla, con la fecha agendada o, si no, la fecha límite. */
  const reunionPendiente = (clave: string, accion: string, completable: boolean): PasoTimeline => {
    // Solo se marca si la reunión está agendada o no: agendada → su fecha; sin agendar → la fecha límite. (Sin saber del calendario, solo la fecha límite.)
    if (estaAgendada(d.reunion)) return { clave, accion, estado: "siguiente", fecha: String(d.reunion), detalle: "agendada", completable };
    const lim = ymd(d.fechaLimite);
    const sinAgendar = estaAgendada(d.reunion) === false;
    return { clave, accion, estado: "siguiente", fecha: lim ? d.fmt(lim) : null, detalle: lim ? (sinAgendar ? "sin agendar · fecha límite" : "fecha límite") : sinAgendar ? "sin agendar" : null, completable };
  };

  const status = d.status ?? "";
  const st = claveNombre(status);
  if (!st || st === "new") return [...pasos, reunionPendiente("meeting1", "Meeting 1", true)];

  // Meeting 1 completada (la iniciativa salió de New): con la hora exacta si se completó con el botón; si no, con la fecha Meet 1.
  const m1 = ymd(d.meet1);
  const m1Fecha = d.meet1Momento ?? (m1 ? d.fmt(m1) : null);
  pasos.push({ clave: "meeting1", accion: "Meeting 1", estado: "hecho", fecha: m1Fecha, detalle: m1Fecha ? "completada" : null });

  // La acción en la que va, según la etapa. Etapas sin acción (p. ej. «Cambio estrategia»): el timeline termina en la Meeting 1.
  const clase = claseDeAprobacion(status);
  if (st === "meeting 1") return [...pasos, reunionPendiente("meeting2", "Meeting 2", true)];
  const m2 = ymd(d.meet2);
  const m2Fecha = d.meet2Momento ?? (m2 ? d.fmt(m2) : null);
  // Etapa heredada de Monday «Meeting 2»: la reunión se hizo, pero falta elegir la siguiente acción («Por definir»). Queda amarilla y
  // se completa con el botón (el PM elige Plan Futuro, Sin Beneficio Definido o Aprobada; la fecha Meet 2 se conserva).
  if (st === "meeting 2") {
    return [...pasos, { clave: "meeting2", accion: "Meeting 2", estado: "siguiente", fecha: m2Fecha, detalle: m2Fecha ? "hecha · falta la siguiente acción" : "falta la siguiente acción", completable: true }];
  }
  // Meeting 2 hecha: si hay registro de que se completó (hora o fecha Meet 2).
  if (m2Fecha) pasos.push({ clave: "meeting2", accion: "Meeting 2", estado: "hecho", fecha: m2Fecha, detalle: "completada" });
  // Plan Futuro completada con el botón (la iniciativa siguió a Sin Beneficio Definido o a Aprobada): en verde, con su hora
  if (st !== "plan futuro" && d.planFuturoMomento) {
    pasos.push({ clave: "plan-futuro", accion: "Plan Futuro", estado: "hecho", fecha: d.planFuturoMomento, detalle: "completada" });
  }
  // Sin Beneficio Definido completada aprobándola (la etapa ya es PM "X"): en verde con su hora
  if (st !== "sin valor def" && d.sinBeneficioMomento) {
    pasos.push({ clave: "sin-beneficio", accion: "Sin Beneficio Definido", estado: "hecho", fecha: d.sinBeneficioMomento, detalle: "completada" });
  }
  if (st === "plan futuro") {
    // Plan Futuro: la fecha en que se retoma y, debajo, el recordatorio (5 días hábiles antes)
    const pf = ymd(d.planFuturo);
    const rec = pf ? recordatorioPlanFuturo(pf) : null;
    const yaToca = !!rec && !!d.hoy && rec <= d.hoy;
    pasos.push({
      clave: "plan-futuro", accion: "Plan Futuro", estado: "siguiente", fecha: pf ? d.fmt(pf) : null, detalle: pf ? "se retoma" : null, completable: true,
      nota: rec ? `Recordatorio: ${d.fmt(rec)}${yaToca ? " · ya toca" : ""}` : null,
    });
  } else if (st === "sin valor def") {
    // Sin Beneficio Definido = «Sin Valor Def». Pendiente: la fecha es el próximo recordatorio (cada 10 días hábiles desde «En Espera») o, tras el
    // 4.º, el día en que se cierra sola; debajo, desde cuándo está en espera. Cerrada (a mano con «Completar» o sola, 5 días hábiles después
    // del 4.º recordatorio): en verde, con el mismo status, y ya no se espera ni se completa nada.
    const en = ymd(d.espera);
    const cierre = ymd(d.esperaCierre);
    const nota = en ? `En espera desde ${d.fmt(en)}` : null;
    if (cierre && d.hoy && cierre <= d.hoy) {
      pasos.push({
        clave: "sin-beneficio", accion: "Sin Beneficio Definido", estado: "hecho", fecha: d.sinBeneficioMomento ?? d.fmt(cierre),
        detalle: d.sinBeneficioMomento ? "completada" : "cierre automático", nota,
      });
    } else {
      const proximo = ymd(d.proximaAccion);
      pasos.push({
        clave: "sin-beneficio", accion: "Sin Beneficio Definido", estado: "siguiente", fecha: proximo ? d.fmt(proximo) : null,
        detalle: proximo ? (cierre ? "cierre automático" : "próximo recordatorio") : null, nota, completable: true,
      });
    }
  } else if (clase) {
    pasos.push({ clave: "aprobada", accion: "Aprobada", estado: "siguiente", fecha: null, detalle: `Clase ${clase}` });
  }
  return pasos;
}

/** «Sin agendar» / «Agendada · dentro del plazo»… → si ya hay reunión en el calendario. null = no se sabe. */
export function estaAgendada(reunion: unknown): boolean | null {
  if (typeof reunion !== "string" || !reunion.trim()) return null;
  return claveNombre(reunion) !== "sin agendar";
}
