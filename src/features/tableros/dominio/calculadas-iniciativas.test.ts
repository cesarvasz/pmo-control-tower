import { describe, expect, it } from "vitest";
import { addBusinessDays, today } from "@/lib/business";
import { calcIniPMHealth, iniItemStatus } from "@/lib/ini";
import { calcEntregaStats } from "@/lib/dashboard";
import type { CalMap, IniItem } from "@/types";
import {
  calidadIniciativa, camposApp, cierreEsperaIniciativa, proximaAccionIniciativa, REUNION_ESTADO, reunionIniciativa, CAMPOS_INICIATIVAS, cumplimientoIniciativa, etapaIniciativa, plazoIniciativa, saludIniciativa, valoresIniciativa,
} from "./calculadas-iniciativas";
import { app } from "./tipos-columna/app";
import { tipoColumna } from "./tipos-columna";

const ini = (o: Partial<IniItem>): IniItem => ({
  id: "INI-1", name: "Una iniciativa", grupo: "G", pm: "Ana", status: "New", benefit: "", estado: "EN TIEMPO",
  dias: 1, limite: 5, deadline: null, creacion: null, ...o,
});
const sinReuniones: CalMap = new Map();
const conM1: CalMap = new Map([["INI-1", { M1: [{ inicio: new Date(), fin: new Date() }], M2: [] }]]);
const ymdDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("Tableros · columnas «Calculada por la app» de Iniciativas", () => {
  it("el tipo está registrado, es calculado y solo las Iniciativas tienen campos", () => {
    expect(tipoColumna("app")).toBe(app);
    expect(app.calculado).toBe(true);
    expect(app.config.validar({ campo: "salud" })).toEqual({ campo: "salud" });
    expect(app.config.validar(null)).toEqual({ campo: "" });
    expect(camposApp("iniciativas")).toBe(CAMPOS_INICIATIVAS);
    expect(camposApp("proyecto")).toEqual([]);
  });

  it("la etapa del embudo, en palabras", () => {
    expect(etapaIniciativa(ini({ status: "New" }))).toBe("Nueva · por Meeting 1");
    expect(etapaIniciativa(ini({ status: "Meeting 1" }))).toBe("Meeting 1 · por Meeting 2");
    expect(etapaIniciativa(ini({ estado: "APROBADA", status: 'PM "B"', clase: "B" }))).toBe("Aprobada · Clase B");
    expect(etapaIniciativa(ini({ estado: "EN_ESPERA", status: "Sin Valor Def" }))).toBe("En espera");
    expect(etapaIniciativa(ini({ estado: "PLAN_FUTURO", status: "Plan Futuro" }))).toBe("Plan futuro");
    expect(etapaIniciativa(ini({ estado: "CAMBIO_ESTRATEGIA", status: "Cambio estrategia" }))).toBe("Cambio de estrategia");
    expect(etapaIniciativa(ini({ estado: "POR_DEFINIR", status: "Meeting 2" }))).toBe("Por definir (Meeting 2)");
    expect(etapaIniciativa(ini({ estado: "SKIP", status: "" }))).toBeNull();
  });

  it("el plazo solo existe en New y Meeting 1; una reunión hoy la marca «Para hoy»", () => {
    expect(plazoIniciativa(ini({ estado: "ATRASADO" }))).toBe("Atrasada");
    expect(plazoIniciativa(ini({ estado: "Sin fecha" }))).toBe("Sin fecha");
    expect(plazoIniciativa(ini({ estado: "PARA HOY" }))).toBe("Para hoy");
    expect(plazoIniciativa(ini({ estado: "EN TIEMPO" }), sinReuniones)).toBe("En tiempo");
    expect(plazoIniciativa(ini({ estado: "EN TIEMPO" }), conM1)).toBe("Para hoy"); // M1 agendada hoy
    expect(plazoIniciativa(ini({ estado: "APROBADA", status: 'PM "A"' }))).toBeNull();
  });

  it("la salud es la que cuenta en el EVM del PM (misma función) y no afirma lo que no puede saber", () => {
    for (const [i, cal] of [[ini({ dias: 1 }), sinReuniones], [ini({ dias: 5 }), sinReuniones], [ini({ dias: 5 }), conM1], [ini({ estado: "ATRASADO" }), conM1]] as const) {
      const esperada = { "on-track": "On track", "in-risk": "At risk", "off-track": "Off track" }[iniItemStatus(i, cal)];
      expect(saludIniciativa(i, cal)).toBe(esperada);
    }
    // Sin calendario no se sabe si hay reunión: solo se afirma lo que no depende de él.
    expect(saludIniciativa(ini({ dias: 5 }))).toBeNull();
    expect(saludIniciativa(ini({ estado: "ATRASADO" }))).toBe("Off track");
    // Por definir: más de 1 día hábil desde Meet 2 → off track
    const meet2 = ymdDe(addBusinessDays(today(), -3, true));
    expect(saludIniciativa(ini({ estado: "POR_DEFINIR", status: "Meeting 2", meet2 }))).toBe("Off track");
    expect(saludIniciativa(ini({ estado: "APROBADA", status: 'PM "A"' }), conM1)).toBeNull();
  });

  it("con las mismas Iniciativas, las «Off track» de la columna son las que penalizan el índice del PM", () => {
    const lista = [ini({ id: "A", dias: 1 }), ini({ id: "B", dias: 5 }), ini({ id: "C", estado: "ATRASADO" })];
    const cal: CalMap = new Map();
    const textos = lista.map((i) => saludIniciativa(i, cal));
    const h = calcIniPMHealth("Ana", lista, cal);
    expect(textos.filter((t) => t === "On track").length).toBe(h.onTrack);
    expect(textos.filter((t) => t === "At risk").length).toBe(h.inRisk);
    expect(textos.filter((t) => t === "Off track").length).toBe(h.offTrack);
  });

  it("Cumplimiento y Calidad: solo las aprobadas, con la regla de las métricas", () => {
    const creacion = addBusinessDays(today(), -40, true);
    const aTiempo = ini({ id: "OK", estado: "APROBADA", status: 'PM "A"', clase: "A", creacion, meet1: ymdDe(addBusinessDays(creacion, 3, true)) });
    const tarde = ini({ id: "TARDE", estado: "APROBADA", status: 'PM "C"', clase: "C", creacion, meet1: ymdDe(addBusinessDays(creacion, 9, true)) });
    const sinDatos = ini({ id: "SD", estado: "APROBADA", status: 'PM "B"', clase: "B", creacion: null });
    expect(cumplimientoIniciativa(aTiempo)).toBe("A tiempo");
    expect(cumplimientoIniciativa(tarde)).toBe("Tarde");
    expect(cumplimientoIniciativa(tarde, { TARDE: { responsible: "Sponsor" } })).toBe("Tarde (excusada)");
    expect(cumplimientoIniciativa(tarde, { TARDE: { responsible: "PM" } })).toBe("Tarde"); // «PM» sigue penalizando
    expect(cumplimientoIniciativa(sinDatos)).toBe("No evaluable");
    expect(cumplimientoIniciativa(ini({}))).toBeNull();
    // Calidad: 100 solo con un responsable distinto de PM; sin asignar penaliza
    expect(calidadIniciativa(aTiempo)).toBe(0);
    expect(calidadIniciativa(aTiempo, { OK: { responsible: "Sin reproceso" as never } })).toBe(100);
    expect(calidadIniciativa(aTiempo, { OK: { responsible: "PM" } })).toBe(0);
    expect(calidadIniciativa(ini({}), {})).toBeNull();
    // Informativo: Cumplimiento de Entrega ya no cuenta Iniciativas
    expect(calcEntregaStats([], [], {}, [aTiempo, tarde, sinDatos]).total).toBe(0);
  });

  it("todos los campos juntos, y las etapas sin dato dan null", () => {
    const v = valoresIniciativa(ini({ estado: "APROBADA", status: 'PM "A"', clase: "A", creacion: null }), {});
    expect(Object.keys(v).sort()).toEqual(CAMPOS_INICIATIVAS.map((c) => c.clave).sort());
    expect(v).toMatchObject({ etapa: "Aprobada · Clase A", plazo: null, dias: null, fecha_limite: null, salud: null, clase: "A", cumplimiento: "No evaluable", calidad: 0 });
    expect(valoresIniciativa(ini({ estado: "EN_ESPERA", status: "Sin Valor Def" }))).toMatchObject({ clase: null, cumplimiento: null, calidad: null });
  });
});

describe("Tableros · reunión que toca según el calendario: solo se marca si está agendada o no", () => {
  const reunion = (inicio: string, fin: string) => ({ inicio: new Date(inicio), fin: new Date(fin) });
  const cal = (m1: ReturnType<typeof reunion>[], m2: ReturnType<typeof reunion>[] = []): CalMap => new Map([["INI-1", { M1: m1, M2: m2 }]]);

  it("New mira la reunión de Meeting 1; Meeting 1 la de Meeting 2; en otras etapas no aplica", () => {
    const m = reunion("2026-11-20T16:00:00Z", "2026-11-20T17:00:00Z");
    expect(reunionIniciativa(ini({ status: "New" }), cal([m]))?.texto).toMatch(/20 nov.*10:00/);
    expect(reunionIniciativa(ini({ status: "Meeting 1" }), cal([m]))?.estado).toBe(REUNION_ESTADO.sinAgendar);
    expect(reunionIniciativa(ini({ status: "Meeting 1" }), cal([], [m]))?.estado).toBe(REUNION_ESTADO.agendada);
    expect(reunionIniciativa(ini({ status: "Sin Valor Def", estado: "EN_ESPERA" }), cal([m]))).toBeNull();
  });

  it("sin calendario no afirma nada; sin reunión, «Sin agendar»", () => {
    expect(reunionIniciativa(ini({}), undefined)).toBeNull();
    expect(reunionIniciativa(ini({}), sinReuniones)).toEqual({ texto: REUNION_ESTADO.sinAgendar, estado: REUNION_ESTADO.sinAgendar });
  });

  it("con reunión en el calendario es «Agendada», sin importar la fecha límite ni si ya pasó", () => {
    const futura = reunion("2099-11-20T16:00:00Z", "2099-11-20T17:00:00Z");
    const pasada = reunion("2020-11-17T16:00:00Z", "2020-11-17T17:00:00Z");
    const tarde = ini({ deadline: new Date("2026-11-19T00:00:00") }); // agendada después de la fecha límite
    expect(reunionIniciativa(tarde, cal([futura]))?.estado).toBe(REUNION_ESTADO.agendada);
    expect(reunionIniciativa(tarde, cal([pasada]))?.estado).toBe(REUNION_ESTADO.agendada);
    expect(Object.values(REUNION_ESTADO)).toEqual(["Sin agendar", "Agendada"]);
  });

  it("el día de la reunión es el de Guatemala (UTC-6)", () => {
    // 21:00 GT del 19 = 03:00Z del 20
    expect(reunionIniciativa(ini({}), cal([reunion("2026-11-20T03:00:00Z", "2026-11-20T04:00:00Z")]))?.dia).toBe("2026-11-19");
  });

  it("los campos nuevos salen en valoresIniciativa y piden el calendario", () => {
    const v = valoresIniciativa(ini({}), { calMap: sinReuniones });
    expect(v.reunion).toBe("Sin agendar");
    expect(v.reunion_estado).toBe("Sin agendar");
    expect(valoresIniciativa(ini({}), {}).reunion).toBeNull();
  });
});

describe("Tableros · Próxima acción (la fecha de lo que sigue)", () => {
  const dia = (a: number, m: number, d: number) => new Date(a, m - 1, d);

  it("Meeting 1 y 2 (New / Meeting 1): la reunión agendada; si no hay, la fecha límite", () => {
    const limite = dia(2026, 11, 23);
    expect(proximaAccionIniciativa(ini({ status: "New", deadline: limite }), { calMap: sinReuniones })).toBe("2026-11-23");
    expect(proximaAccionIniciativa(ini({ status: "New", deadline: limite }))).toBe("2026-11-23"); // sin calendario: la fecha límite
    const m1: CalMap = new Map([["INI-1", { M1: [{ inicio: new Date("2099-01-05T15:00:00Z"), fin: new Date("2099-01-05T16:00:00Z") }], M2: [] }]]);
    expect(proximaAccionIniciativa(ini({ status: "New", deadline: limite }), { calMap: m1 })).toBe("2099-01-05");
    // En «Meeting 1» la reunión que toca es la Meeting 2
    expect(proximaAccionIniciativa(ini({ status: "Meeting 1", deadline: limite }), { calMap: m1 })).toBe("2026-11-23");
    const m2: CalMap = new Map([["INI-1", { M1: [], M2: [{ inicio: new Date("2099-02-10T20:00:00Z"), fin: new Date("2099-02-10T21:00:00Z") }] }]]);
    expect(proximaAccionIniciativa(ini({ status: "Meeting 1", deadline: limite }), { calMap: m2 })).toBe("2099-02-10");
  });

  it("la reunión se toma en el día de Guatemala (UTC-6), no en UTC", () => {
    const tarde: CalMap = new Map([["INI-1", { M1: [{ inicio: new Date("2099-01-06T02:00:00Z"), fin: new Date("2099-01-06T03:00:00Z") }], M2: [] }]]);
    expect(proximaAccionIniciativa(ini({ status: "New" }), { calMap: tarde })).toBe("2099-01-05");
  });

  it("sin reunión ni fecha límite: null", () => {
    expect(proximaAccionIniciativa(ini({ status: "New", deadline: null }), { calMap: sinReuniones })).toBeNull();
  });

  it("Plan Futuro: la fecha en que se retoma", () => {
    expect(proximaAccionIniciativa(ini({ estado: "PLAN_FUTURO", status: "Plan Futuro", planFuturo: dia(2027, 1, 15) }))).toBe("2027-01-15");
    expect(proximaAccionIniciativa(ini({ estado: "PLAN_FUTURO", status: "Plan Futuro", planFuturo: null }))).toBeNull();
  });

  it("Sin Valor Def: el próximo recordatorio (10 días hábiles de «En Espera»; luego del último envío)", () => {
    const espera = ini({ estado: "EN_ESPERA", status: "Sin Valor Def", espera: "2026-11-16", pku: "", ckuMail: "cku@c807.com" });
    expect(proximaAccionIniciativa(espera)).toBe("2026-11-30");
    const conUnEnvio = new Map([["INI-1", { count: 1, lastSent: dia(2026, 11, 30) }]]);
    expect(proximaAccionIniciativa(espera, { recordatorios: conUnEnvio })).toBe("2026-12-14");
  });

  it("Sin Valor Def: sin recordatorio si está pausado (PKU), no tiene CKU Mail o ya se mandaron los 4", () => {
    const base = { estado: "EN_ESPERA", status: "Sin Valor Def", espera: "2026-11-16", pku: "", ckuMail: "cku@c807.com" } as const;
    expect(proximaAccionIniciativa(ini({ ...base, pku: "v" }))).toBeNull();
    expect(proximaAccionIniciativa(ini({ ...base, ckuMail: "" }))).toBeNull();
    expect(proximaAccionIniciativa(ini(base), { recordatorios: new Map([["INI-1", { count: 4, lastSent: dia(2026, 11, 1) }]]) })).toBeNull();
  });

  it("las aprobadas y las demás etapas todavía no tienen próxima acción", () => {
    expect(proximaAccionIniciativa(ini({ estado: "APROBADA", status: 'PM "A"', clase: "A" }))).toBeNull();
    expect(proximaAccionIniciativa(ini({ estado: "POR_DEFINIR", status: "Meeting 2" }))).toBeNull();
    expect(proximaAccionIniciativa(ini({ estado: "CAMBIO_ESTRATEGIA", status: "Cambio estrategia" }))).toBeNull();
  });

  it("es un campo más de la iniciativa", () => {
    expect(valoresIniciativa(ini({ status: "New", deadline: dia(2026, 11, 23) }), { calMap: sinReuniones }).proxima_accion).toBe("2026-11-23");
    expect(CAMPOS_INICIATIVAS.find((c) => c.clave === "proxima_accion")?.formato).toBe("fecha");
  });
});

describe("Tableros · Sin Beneficio Definido se cierra (a mano o sola)", () => {
  const dia = (a: number, m: number, d: number) => new Date(a, m - 1, d);
  const espera = ini({ estado: "EN_ESPERA", status: "Sin Valor Def", espera: "2026-05-20", pku: "", ckuMail: "cku@c807.com" });
  const cuatro = new Map([["INI-1", { count: 4, lastSent: dia(2026, 11, 16) }]]);
  const tres = new Map([["INI-1", { count: 3, lastSent: dia(2026, 11, 16) }]]);

  it("con los 4 recordatorios enviados se cierra 5 días hábiles después del último", () => {
    expect(cierreEsperaIniciativa(espera, { recordatorios: cuatro })).toBe("2026-11-23");
    expect(cierreEsperaIniciativa(espera, { recordatorios: tres })).toBeNull();
    expect(cierreEsperaIniciativa(espera)).toBeNull(); // sin el registro de envíos no se afirma nada
  });

  it("cerrada a mano con «Completar»: ese día; un cierre anterior a «En Espera» es de una vez pasada y no cuenta", () => {
    expect(cierreEsperaIniciativa(espera, { cierreManual: "2026-11-16" })).toBe("2026-11-16");
    expect(cierreEsperaIniciativa(ini({ ...espera, espera: "2026-12-01" }), { cierreManual: "2026-11-16" })).toBeNull();
    expect(cierreEsperaIniciativa(espera, { cierreManual: "2026-11-16", recordatorios: cuatro })).toBe("2026-11-16"); // el manual manda
  });

  it("solo existe en Sin Valor Def", () => {
    expect(cierreEsperaIniciativa(ini({ estado: "APROBADA", status: 'PM "A"', clase: "A" }), { cierreManual: "2026-11-16" })).toBeNull();
  });

  it("la próxima acción: tras el 4.º recordatorio es el cierre automático; ya cerrada, nada más", () => {
    expect(proximaAccionIniciativa(espera, { recordatorios: new Map([["INI-1", { count: 4, lastSent: dia(2099, 1, 5) }]]) })).toBe("2099-01-12"); // futuro: el día del cierre
    const viejo = new Map([["INI-1", { count: 4, lastSent: dia(2026, 1, 5) }]]);
    expect(proximaAccionIniciativa(espera, { recordatorios: viejo })).toBeNull(); // el cierre ya pasó (12 ene)
    expect(proximaAccionIniciativa(espera, { cierreManual: "2026-11-16" })).toBeNull(); // cerrada a mano
    expect(proximaAccionIniciativa(espera, { recordatorios: tres })).not.toBeNull(); // todavía faltan recordatorios
  });

  it("es un campo más de la iniciativa", () => {
    expect(valoresIniciativa(espera, { cierreManual: "2026-11-16" }).espera_cierre).toBe("2026-11-16");
    expect(CAMPOS_INICIATIVAS.find((c) => c.clave === "espera_cierre")?.formato).toBe("fecha");
  });
});
