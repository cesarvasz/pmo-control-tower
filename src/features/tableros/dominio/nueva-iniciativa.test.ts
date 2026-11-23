import { describe, expect, it } from "vitest";
import type { Columna } from "./tablero";
import { camposDespues, camposQueLlena, columnasNuevaIni, diaDeCreacion, estaAgendada, faltantes, numeroIniId, pasosIniciativa, pideDatosCompletos, porIniIdDesc, statusIni } from "./nueva-iniciativa";

let n = 0;
const col = (titulo: string, tipo: string, extra: Partial<Columna> = {}): Columna =>
  ({ id: `c${++n}`, tableroId: "t", nivel: "item", titulo, tipo, rol: null, config: {}, orden: n, oculta: false, ...extra }) as Columna;

const COLS = [
  col("Ini ID", "autonumero"), col("Status", "status", { rol: "status" }), col("PM", "persona"), col("CKU", "persona"),
  col("Estrategia 🔝", "relacion"), col("Sponsor", "espejo", { oculta: true }), col("Proceso", "dropdown"),
  col("Creation log", "creacion", { oculta: true }), col("Fecha límite", "app", { config: { campo: "fecha_limite" }, oculta: true }),
  col("Reunión agendada", "app", { config: { campo: "reunion" }, oculta: true }),
  col("Estado de la reunión", "app", { config: { campo: "reunion_estado" }, oculta: true }),
  col("Proceso", "dropdown", { nivel: "sub" }),
  col("Salud", "app", { config: { campo: "salud" } }),
  col("Benefit", "numero", { oculta: true }), col("Presupuesto", "numero"), col("KPI", "texto"), col("Tipo de iniciativa", "dropdown"),
];

describe("columnasNuevaIni", () => {
  it("reconoce cada columna por tipo y título (ocultas incluidas; solo nivel item)", () => {
    const k = columnasNuevaIni(COLS);
    expect(k.status?.titulo).toBe("Status");
    expect(k.pm?.titulo).toBe("PM");
    expect(k.cku?.titulo).toBe("CKU");
    expect(k.estrategia?.titulo).toBe("Estrategia 🔝");
    expect(k.sponsor?.titulo).toBe("Sponsor");
    expect(k.proceso?.nivel).toBe("item");
    expect(k.iniId?.tipo).toBe("autonumero");
    expect(k.creacion?.tipo).toBe("creacion");
    expect(k.fechaLimite?.titulo).toBe("Fecha límite");
    expect(k.reunion?.titulo).toBe("Reunión agendada");
    expect(k.reunionEstado?.titulo).toBe("Estado de la reunión");
    expect(k.salud?.titulo).toBe("Salud");
  });

  it("prefiere la persona con rol «responsable» como PM", () => {
    const k = columnasNuevaIni([col("Dueño", "persona", { rol: "responsable" }), col("PM", "persona")]);
    expect(k.pm?.titulo).toBe("Dueño");
  });

  it("lo que llena el PM: PM, CKU, Estrategia y Proceso, en ese orden; sin los que falten", () => {
    expect(camposQueLlena(columnasNuevaIni(COLS)).map((c) => c.titulo)).toEqual(["PM", "CKU", "Estrategia 🔝", "Proceso"]);
    expect(camposQueLlena(columnasNuevaIni([col("PM", "persona")])).map((c) => c.titulo)).toEqual(["PM"]);
  });

  it("ya creada: Beneficio $ (la columna Benefit), Presupuesto $, KPI y Tipo de iniciativa", () => {
    expect(camposDespues(columnasNuevaIni(COLS)).map((x) => [x.columna.titulo, x.etiqueta])).toEqual([
      ["Benefit", "Beneficio $"], ["Presupuesto", "Presupuesto $"], ["KPI", "KPI"], ["Tipo de iniciativa", "Tipo de iniciativa"],
    ]);
    expect(camposDespues(columnasNuevaIni([col("PM", "persona")]))).toEqual([]);
  });
});

describe("faltantes", () => {
  const k = columnasNuevaIni(COLS);
  const campos = camposQueLlena(k);
  const conOpciones = { ...k.proceso!, config: { opciones: [{ id: "1", texto: "Ventas" }] } };

  it("todo lo de Datos es obligatorio: nombre, PM, CKU, Estrategia y Proceso (si tiene opciones)", () => {
    expect(faltantes("", [k.pm!, k.cku!, k.estrategia!, conOpciones], {})).toEqual(["Nombre", "PM", "CKU", "Estrategia", "Proceso"]);
  });

  it("vacío = null, texto en blanco o lista vacía", () => {
    expect(faltantes("  ", [k.pm!], { [k.pm!.id]: [] })).toEqual(["Nombre", "PM"]);
    expect(faltantes("X", [k.pm!], { [k.pm!.id]: ["p1"] })).toEqual([]);
  });

  it("un Proceso sin opciones todavía no se exige", () => {
    expect(faltantes("X", campos, { [k.pm!.id]: ["p1"], [k.cku!.id]: ["p2"], [k.estrategia!.id]: ["e1"] })).toEqual([]);
  });
});

describe("statusIni (On Track / Off Track y, fuera del embudo, lo que es)", () => {
  it("aprobada: «Aprobada · Clase X», con comillas rectas o tipográficas y sin importar la salud", () => {
    expect(statusIni(null, 'PM "A"')).toBe("Aprobada · Clase A");
    expect(statusIni("Off track", "PM “B”")).toBe("Aprobada · Clase B");
    expect(statusIni("On track", 'PM "C"')).toBe("Aprobada · Clase C");
  });

  it("Sin Valor Def se muestra como «Sin Beneficio Definido»", () => {
    expect(statusIni(null, "Sin Valor Def")).toBe("Sin Beneficio Definido");
    expect(statusIni("Off track", "sin valor def")).toBe("Sin Beneficio Definido");
  });

  it("las etapas del embudo siguen mostrando su salud; Cambio estrategia no tiene status", () => {
    expect(statusIni("On track", "New")).toBe("On Track");
    expect(statusIni("Off track", "Meeting 1")).toBe("Off Track");
    expect(statusIni(null, "Cambio estrategia")).toBeNull();
  });

  it("una iniciativa en Plan Futuro muestra «Plan Futuro», sin importar su salud", () => {
    expect(statusIni(null, "Plan Futuro")).toBe("Plan Futuro");
    expect(statusIni("Off track", "plan futuro")).toBe("Plan Futuro");
    expect(statusIni("Off track", "Meeting 1")).toBe("Off Track");
  });

  it("Off track → Off Track; On track y At risk → On Track", () => {
    expect(statusIni("Off track")).toBe("Off Track");
    expect(statusIni("On track")).toBe("On Track");
    expect(statusIni("At risk")).toBe("On Track");
  });

  it("sin salud ni etapa que lo diga (p. ej. sin calendario) no hay status", () => {
    expect(statusIni(null)).toBeNull();
    expect(statusIni("")).toBeNull();
    expect(statusIni(5)).toBeNull();
  });
});

describe("orden por Ini ID", () => {
  it("lee el número del Ini ID", () => {
    expect(numeroIniId("IN-123")).toBe(123);
    expect(numeroIniId(45)).toBe(45);
    expect(numeroIniId("")).toBeNull();
    expect(numeroIniId(null)).toBeNull();
  });

  it("las más nuevas primero; sin Ini ID al final", () => {
    const l = [{ id: "IN-9" }, { id: null }, { id: "IN-120" }, { id: "IN-10" }];
    expect(porIniIdDesc(l, (x) => x.id).map((x) => x.id)).toEqual(["IN-120", "IN-10", "IN-9", null]);
  });
});

describe("timeline (pasosIniciativa)", () => {
  const fmt = (s: string) => `F(${s})`;
  const base = { status: "New", creacion: "2026-11-16 16:59:04 UTC", meet1: null, fechaLimite: "2026-11-23", reunion: "Sin agendar", fmt };

  it("la fecha de creación se toma en hora de Guatemala", () => {
    expect(diaDeCreacion("2026-11-17 03:00:00 UTC")).toBe("2026-11-16");
    expect(diaDeCreacion("2026-11-16 16:59:04 UTC")).toBe("2026-11-16");
    expect(diaDeCreacion(null)).toBeNull();
  });

  it("New sin agendar: Creado en verde; Meeting 1 en amarillo con la fecha límite", () => {
    expect(pasosIniciativa(base)).toEqual([
      { clave: "creado", accion: "Creado", estado: "hecho", fecha: "F(2026-11-16)", detalle: null },
      { clave: "meeting1", accion: "Meeting 1", estado: "siguiente", fecha: "F(2026-11-23)", detalle: "sin agendar · fecha límite", completable: true },
    ]);
  });

  it("New ya agendada: Meeting 1 muestra la fecha de la reunión, no la fecha límite", () => {
    const m1 = pasosIniciativa({ ...base, reunion: "20 nov 2026 · 10:00" })[1];
    expect(m1).toMatchObject({ estado: "siguiente", fecha: "20 nov 2026 · 10:00", detalle: "agendada" });
  });

  it("sin calendario ni fecha límite: Meeting 1 sigue siendo el siguiente paso, sin fecha", () => {
    expect(pasosIniciativa({ ...base, reunion: null, fechaLimite: null })[1]).toMatchObject({ estado: "siguiente", fecha: null });
  });

  it("solo la Meeting 1 pendiente se puede completar con el botón", () => {
    expect(pasosIniciativa(base)[1].completable).toBe(true);
    expect(pasosIniciativa({ ...base, status: "Meeting 1" }).filter((p) => p.completable).map((p) => p.accion)).toEqual(["Meeting 2"]); // y la Meeting 1 ya no
    expect(pasosIniciativa({ ...base, status: "Plan Futuro" }).filter((p) => p.completable).map((p) => p.accion)).toEqual(["Plan Futuro"]);
    expect(pasosIniciativa({ ...base, status: "Sin Valor Def" }).filter((p) => p.completable).map((p) => p.accion)).toEqual(["Sin Beneficio Definido"]);
    expect(pasosIniciativa({ ...base, status: 'PM "A"' }).some((p) => p.completable)).toBe(false);
  });

  it("Plan Futuro completada con el botón: en verde con su hora, y la acción elegida queda en amarillo", () => {
    const p = pasosIniciativa({ ...base, status: "Sin Valor Def", planFuturoMomento: "10 ene 2027 · 09:15", espera: "2027-01-10", proximaAccion: "2027-01-25" });
    expect(p.map((x) => `${x.accion}:${x.estado}`)).toEqual(["Creado:hecho", "Meeting 1:hecho", "Plan Futuro:hecho", "Sin Beneficio Definido:siguiente"]);
    expect(p[2]).toMatchObject({ fecha: "10 ene 2027 · 09:15", detalle: "completada" });
    expect(pasosIniciativa({ ...base, status: 'PM "B"', planFuturoMomento: "10 ene 2027 · 09:15" }).map((x) => `${x.accion}:${x.estado}`))
      .toEqual(["Creado:hecho", "Meeting 1:hecho", "Plan Futuro:hecho", "Aprobada:siguiente"]);
  });

  it("Sin Beneficio Definido con los 4 recordatorios enviados: la fecha es el cierre automático (5 días hábiles después del último)", () => {
    const p = pasosIniciativa({ ...base, status: "Sin Valor Def", espera: "2026-05-20", proximaAccion: "2026-12-28", esperaCierre: "2026-12-28", hoy: "2026-12-20" })[2];
    expect(p).toMatchObject({ estado: "siguiente", fecha: "F(2026-12-28)", detalle: "cierre automático", completable: true });
  });

  it("pasados esos 5 días sin aprobarse: en verde, con el mismo status, sin más acciones ni botón", () => {
    const p = pasosIniciativa({ ...base, status: "Sin Valor Def", espera: "2026-05-20", esperaCierre: "2026-12-28", hoy: "2026-12-28" });
    expect(p.map((x) => `${x.accion}:${x.estado}`)).toEqual(["Creado:hecho", "Meeting 1:hecho", "Sin Beneficio Definido:hecho"]);
    expect(p[2]).toMatchObject({ fecha: "F(2026-12-28)", detalle: "cierre automático", nota: "En espera desde F(2026-05-20)" });
    expect(p.some((x) => x.completable)).toBe(false);
  });

  it("cerrada a mano con «Completar»: en verde con su hora", () => {
    const p = pasosIniciativa({ ...base, status: "Sin Valor Def", esperaCierre: "2026-11-16", sinBeneficioMomento: "16 nov 2026 · 15:42", hoy: "2026-11-16" });
    expect(p[2]).toMatchObject({ estado: "hecho", fecha: "16 nov 2026 · 15:42", detalle: "completada" });
    expect(p.some((x) => x.estado === "siguiente")).toBe(false);
  });

  it("Sin Beneficio Definido completada aprobándola: en verde y la Aprobada queda en amarillo", () => {
    expect(pasosIniciativa({ ...base, status: 'PM "A"', sinBeneficioMomento: "16 nov 2026 · 15:42" }).map((x) => `${x.accion}:${x.estado}`))
      .toEqual(["Creado:hecho", "Meeting 1:hecho", "Sin Beneficio Definido:hecho", "Aprobada:siguiente"]);
  });

  it("sin registro de que pasó por Plan Futuro (iniciativas de antes), esa flecha no aparece", () => {
    expect(pasosIniciativa({ ...base, status: 'PM "B"', planFuturo: "2026-10-01" }).map((x) => x.accion)).toEqual(["Creado", "Meeting 1", "Aprobada"]);
  });

  it("si ya salió de New, Meeting 1 está completada (con la fecha Meet 1 si se registró)", () => {
    expect(pasosIniciativa({ ...base, status: "Meeting 1", meet1: "2026-11-20" })[1]).toMatchObject({ estado: "hecho", fecha: "F(2026-11-20)", detalle: "completada" });
    expect(pasosIniciativa({ ...base, status: 'PM "C"' })[1]).toMatchObject({ estado: "hecho", fecha: null });
  });

  it("completada con el botón: se ve la fecha y hora exactas, no solo el día", () => {
    expect(pasosIniciativa({ ...base, status: "Meeting 1", meet1: "2026-11-20", meet1Momento: "20 nov 2026 · 15:42" })[1])
      .toMatchObject({ estado: "hecho", fecha: "20 nov 2026 · 15:42", detalle: "completada" });
  });

  it("Status Meeting 1 → la siguiente es la Meeting 2 (agendada o con su fecha límite)", () => {
    expect(pasosIniciativa({ ...base, status: "Meeting 1", fechaLimite: "2026-11-30" })[2])
      .toEqual({ clave: "meeting2", accion: "Meeting 2", estado: "siguiente", fecha: "F(2026-11-30)", detalle: "sin agendar · fecha límite", completable: true });
    expect(pasosIniciativa({ ...base, status: "Meeting 1", reunion: "27 nov 2026 · 09:00" })[2]).toMatchObject({ fecha: "27 nov 2026 · 09:00", detalle: "agendada" });
  });

  it("de la reunión solo se marca si está agendada o no (aunque ya pasó o caiga después de la fecha límite)", () => {
    expect(pasosIniciativa({ ...base, status: "Meeting 1", reunion: "18 nov 2026 · 09:30" })[2]).toMatchObject({ estado: "siguiente", fecha: "18 nov 2026 · 09:30", detalle: "agendada" });
    expect(pasosIniciativa({ ...base, status: "Meeting 1", reunion: "Sin agendar", fechaLimite: "2026-11-30" })[2]).toMatchObject({ fecha: "F(2026-11-30)", detalle: "sin agendar · fecha límite" });
  });

  it("sin saber del calendario no se afirma que esté sin agendar: solo la fecha límite", () => {
    expect(pasosIniciativa({ ...base, reunion: null })[1]).toMatchObject({ fecha: "F(2026-11-23)", detalle: "fecha límite" });
  });

  it("Status Meeting 2 (heredado de Monday): la Meeting 2 se hizo pero falta la siguiente acción → amarilla y se completa", () => {
    const p = pasosIniciativa({ ...base, status: "Meeting 2", meet2: "2026-11-25" });
    expect(p.map((x) => `${x.accion}:${x.estado}`)).toEqual(["Creado:hecho", "Meeting 1:hecho", "Meeting 2:siguiente"]);
    expect(p[2]).toMatchObject({ clave: "meeting2", fecha: "F(2026-11-25)", detalle: "hecha · falta la siguiente acción", completable: true });
    expect(pasosIniciativa({ ...base, status: "Meeting 2" })[2]).toMatchObject({ fecha: null, detalle: "falta la siguiente acción", completable: true });
  });

  it("Meeting 2 completada con el botón: se ve en verde con su hora, y la acción elegida queda en amarillo", () => {
    const p = pasosIniciativa({ ...base, status: "Plan Futuro", meet1Momento: "16 nov 2026 · 10:00", meet2: "2026-11-24", meet2Momento: "24 nov 2026 · 15:42" });
    expect(p.map((x) => `${x.accion}:${x.estado}`)).toEqual(["Creado:hecho", "Meeting 1:hecho", "Meeting 2:hecho", "Plan Futuro:siguiente"]);
    expect(p[2]).toMatchObject({ fecha: "24 nov 2026 · 15:42", detalle: "completada" });
  });

  it("de la Meeting 1 directo a Aprobada (sin Meeting 2): no aparece la Meeting 2", () => {
    expect(pasosIniciativa({ ...base, status: 'PM "A"' }).map((p) => p.accion)).toEqual(["Creado", "Meeting 1", "Aprobada"]);
  });

  it("Plan Futuro: la fecha en que se retoma y, debajo, el recordatorio 5 días hábiles antes", () => {
    expect(pasosIniciativa({ ...base, status: "Plan Futuro", planFuturo: "2026-12-14", hoy: "2026-11-16" })[2])
      .toMatchObject({ accion: "Plan Futuro", estado: "siguiente", fecha: "F(2026-12-14)", detalle: "se retoma", nota: "Recordatorio: F(2026-12-07)" });
  });

  it("Plan Futuro: cuando llega el día del recordatorio, dice «ya toca»", () => {
    expect(pasosIniciativa({ ...base, status: "Plan Futuro", planFuturo: "2026-12-14", hoy: "2026-12-07" })[2].nota).toBe("Recordatorio: F(2026-12-07) · ya toca");
    expect(pasosIniciativa({ ...base, status: "Plan Futuro", planFuturo: "2026-12-14", hoy: "2026-12-10" })[2].nota).toBe("Recordatorio: F(2026-12-07) · ya toca");
  });

  it("Sin Beneficio Definido: la fecha es el próximo recordatorio (como Sin Valor Def) y debajo, desde cuándo está en espera", () => {
    expect(pasosIniciativa({ ...base, status: "Sin Valor Def", espera: "2026-11-16", proximaAccion: "2026-11-30" })[2])
      .toMatchObject({ accion: "Sin Beneficio Definido", estado: "siguiente", fecha: "F(2026-11-30)", detalle: "próximo recordatorio", nota: "En espera desde F(2026-11-16)" });
  });

  it("Sin Beneficio Definido sin próximo recordatorio (pausado o ya se mandaron los 4): sin fecha, pero se ve desde cuándo está en espera", () => {
    expect(pasosIniciativa({ ...base, status: "Sin Valor Def", espera: "2026-11-16" })[2]).toMatchObject({ fecha: null, detalle: null, nota: "En espera desde F(2026-11-16)" });
    expect(pasosIniciativa({ ...base, status: "Sin Valor Def" })[2]).toMatchObject({ fecha: null, nota: null });
  });

  it("Plan Futuro, Sin Beneficio Definido y Aprobada: esa es la acción amarilla", () => {
    expect(pasosIniciativa({ ...base, status: "Plan Futuro", planFuturo: "2027-01-15" })[2]).toMatchObject({ accion: "Plan Futuro", estado: "siguiente", fecha: "F(2027-01-15)" });
    expect(pasosIniciativa({ ...base, status: "Plan Futuro" })[2]).toMatchObject({ accion: "Plan Futuro", fecha: null });
    expect(pasosIniciativa({ ...base, status: "Sin Valor Def" })[2]).toMatchObject({ accion: "Sin Beneficio Definido", estado: "siguiente" });
    expect(pasosIniciativa({ ...base, status: 'PM "B"' })[2]).toMatchObject({ accion: "Aprobada", estado: "siguiente", detalle: "Clase B" });
  });

  it("una etapa sin acción (Cambio estrategia) termina en la Meeting 1", () => {
    expect(pasosIniciativa({ ...base, status: "Cambio estrategia" }).map((p) => p.accion)).toEqual(["Creado", "Meeting 1"]);
  });
});

describe("estaAgendada", () => {
  it("Sin agendar → no; una fecha → sí; vacío → no se sabe", () => {
    expect(estaAgendada("Sin agendar")).toBe(false);
    expect(estaAgendada("10 nov 2026 · 11:00")).toBe(true);
    expect(estaAgendada(null)).toBeNull();
    expect(estaAgendada("")).toBeNull();
  });
});

describe("pideDatosCompletos", () => {
  it("se piden en el embudo y en Plan Futuro; no a las aprobadas, en espera ni en Cambio estrategia", () => {
    for (const s of ["New", "Meeting 1", "Meeting 2", "Plan Futuro", null, ""]) expect(pideDatosCompletos(s)).toBe(true);
    for (const s of ['PM "A"', "PM “B”", 'PM "C"', "Sin Valor Def", "Cambio estrategia", "cambio Estrategia"]) expect(pideDatosCompletos(s)).toBe(false);
  });
});
