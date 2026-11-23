import { describe, expect, it } from "vitest";
import { buscarEtiqueta, cierreAutomaticoEspera, fechaValida, momentoDeAccion, planCompletar, recordatorioPlanFuturo, siguientesDe, statusDeSiguiente } from "./acciones-iniciativa";

describe("statusDeSiguiente", () => {
  it("a qué etapa (Status) pasa cada siguiente acción", () => {
    expect(statusDeSiguiente("Meeting 2")).toBe("Meeting 1");
    expect(statusDeSiguiente("Plan Futuro")).toBe("Plan Futuro");
    expect(statusDeSiguiente("Sin Beneficio Definido")).toBe("Sin Valor Def");
    expect(statusDeSiguiente("Aprobada", "B")).toBe('PM "B"');
  });

  it("Aprobada sin Clase no tiene etapa", () => {
    expect(statusDeSiguiente("Aprobada")).toBeNull();
  });
});

describe("buscarEtiqueta", () => {
  const etiquetas = [{ id: "1", texto: "Meeting 1" }, { id: "2", texto: 'PM "A"' }, { id: "3", texto: "Sin Valor Def" }, { id: "4", texto: "Plan Futuro" }];

  it("sin importar mayúsculas ni acentos", () => {
    expect(buscarEtiqueta(etiquetas, "sin valor def")?.id).toBe("3");
    expect(buscarEtiqueta(etiquetas, "PLAN FUTURO")?.id).toBe("4");
  });

  it("PM «A» con comillas rectas o tipográficas", () => {
    expect(buscarEtiqueta(etiquetas, "PM “A”")?.id).toBe("2");
    expect(buscarEtiqueta(etiquetas, 'PM "A"')?.id).toBe("2");
  });

  it("si no existe, undefined", () => {
    expect(buscarEtiqueta(etiquetas, 'PM "C"')).toBeUndefined();
  });
});

describe("siguientesDe", () => {
  it("tras la Meeting 1, las cuatro; tras la Meeting 2, sin la Meeting 2; tras el Plan Futuro, solo Sin Beneficio Definido o Aprobada", () => {
    expect(siguientesDe("Meeting 1")).toEqual(["Meeting 2", "Plan Futuro", "Sin Beneficio Definido", "Aprobada"]);
    expect(siguientesDe("Meeting 2")).toEqual(["Plan Futuro", "Sin Beneficio Definido", "Aprobada"]);
    expect(siguientesDe("Plan Futuro")).toEqual(["Sin Beneficio Definido", "Aprobada"]);
    expect(siguientesDe("Sin Beneficio Definido")).toEqual(["Completar", "Aprobada"]);
  });
});

describe("planCompletar · Meeting 1", () => {
  const m1 = { accion: "Meeting 1" };

  it("New + una siguiente acción: dice a qué etapa pasa", () => {
    expect(planCompletar({ ...m1, statusActual: "New", siguiente: "Meeting 2" })).toEqual({ ok: true, accion: "Meeting 1", statusTexto: "Meeting 1", siguiente: "Meeting 2", clase: null, fecha: null });
    expect(planCompletar({ ...m1, statusActual: "New", siguiente: "Aprobada", clase: "C" })).toEqual({ ok: true, accion: "Meeting 1", statusTexto: 'PM "C"', siguiente: "Aprobada", clase: "C", fecha: null });
  });

  it("la Clase solo cuenta para Aprobada", () => {
    expect(planCompletar({ ...m1, statusActual: "New", siguiente: "Sin Beneficio Definido", clase: "A" })).toMatchObject({ ok: true, clase: null });
  });

  it("Aprobada exige la Clase", () => {
    expect(planCompletar({ ...m1, statusActual: "New", siguiente: "Aprobada" })).toMatchObject({ ok: false, error: expect.stringMatching(/Clase/) });
    expect(planCompletar({ ...m1, statusActual: "New", siguiente: "Aprobada", clase: "Z" })).toMatchObject({ ok: false });
  });

  it("solo si la Meeting 1 sigue pendiente (status New)", () => {
    expect(planCompletar({ ...m1, statusActual: "Meeting 1", siguiente: "Meeting 2" })).toMatchObject({ ok: false, error: expect.stringMatching(/Meeting 1 ya no está pendiente/) });
    expect(planCompletar({ ...m1, statusActual: null, siguiente: "Meeting 2" })).toMatchObject({ ok: false });
  });

  it("una acción que no es de la lista no pasa", () => {
    expect(planCompletar({ ...m1, statusActual: "New", siguiente: "Cambio estrategia" })).toMatchObject({ ok: false, error: expect.stringMatching(/siguiente acción/) });
  });
});

describe("planCompletar · Meeting 2", () => {
  const m2 = { accion: "Meeting 2", statusActual: "Meeting 1" };

  it("estando en «Meeting 1» (falta la M2): pasa a la etapa de lo que se elija", () => {
    expect(planCompletar({ ...m2, siguiente: "Plan Futuro", fecha: "2027-01-15" })).toEqual({ ok: true, accion: "Meeting 2", statusTexto: "Plan Futuro", siguiente: "Plan Futuro", clase: null, fecha: "2027-01-15" });
    expect(planCompletar({ ...m2, siguiente: "Sin Beneficio Definido" })).toMatchObject({ ok: true, statusTexto: "Sin Valor Def" });
    expect(planCompletar({ ...m2, siguiente: "Aprobada", clase: "A" })).toMatchObject({ ok: true, statusTexto: 'PM "A"', clase: "A" });
  });

  it("no se ofrece la Meeting 2 otra vez", () => {
    expect(planCompletar({ ...m2, siguiente: "Meeting 2" })).toMatchObject({ ok: false, error: expect.stringMatching(/siguiente acción/) });
  });

  it("Aprobada sigue pidiendo la Clase", () => {
    expect(planCompletar({ ...m2, siguiente: "Aprobada" })).toMatchObject({ ok: false, error: expect.stringMatching(/Clase/) });
  });

  it("también desde la etapa heredada «Meeting 2» (se hizo en Monday, falta elegir la siguiente acción)", () => {
    expect(planCompletar({ ...m2, statusActual: "Meeting 2", siguiente: "Aprobada", clase: "B" })).toMatchObject({ ok: true, statusTexto: 'PM "B"' });
    expect(planCompletar({ ...m2, statusActual: "meeting 2", siguiente: "Sin Beneficio Definido" })).toMatchObject({ ok: true, statusTexto: "Sin Valor Def" });
    // La Meeting 1 no se completa desde «Meeting 2»
    expect(planCompletar({ accion: "Meeting 1", statusActual: "Meeting 2", siguiente: "Plan Futuro", fecha: "2027-01-15" })).toMatchObject({ ok: false });
  });

  it("solo si la Meeting 2 está pendiente: en New todavía falta la Meeting 1; ya aprobada, no", () => {
    expect(planCompletar({ ...m2, statusActual: "New", siguiente: "Sin Beneficio Definido" })).toMatchObject({ ok: false, error: expect.stringMatching(/Meeting 2 ya no está pendiente/) });
    expect(planCompletar({ ...m2, statusActual: 'PM "A"', siguiente: "Sin Beneficio Definido" })).toMatchObject({ ok: false });
  });
});

describe("planCompletar · Plan Futuro pide la fecha en que se retoma", () => {
  const pf = { accion: "Meeting 1", statusActual: "New", siguiente: "Plan Futuro", hoy: "2026-11-16" };

  it("sin fecha o con una fecha que no existe, no pasa", () => {
    expect(planCompletar(pf)).toMatchObject({ ok: false, error: expect.stringMatching(/fecha en que se va a retomar/) });
    expect(planCompletar({ ...pf, fecha: "2027-02-31" })).toMatchObject({ ok: false });
    expect(planCompletar({ ...pf, fecha: "15/01/2027" })).toMatchObject({ ok: false });
  });

  it("tiene que ser posterior a hoy", () => {
    expect(planCompletar({ ...pf, fecha: "2026-11-16" })).toMatchObject({ ok: false, error: expect.stringMatching(/posterior a hoy/) });
    expect(planCompletar({ ...pf, fecha: "2026-11-01" })).toMatchObject({ ok: false });
    expect(planCompletar({ ...pf, fecha: "2026-11-17" })).toMatchObject({ ok: true, statusTexto: "Plan Futuro", fecha: "2026-11-17" });
  });

  it("la fecha solo se pide para Plan Futuro", () => {
    expect(planCompletar({ ...pf, siguiente: "Meeting 2", fecha: "2027-01-15" })).toMatchObject({ ok: true, fecha: null });
  });
});

describe("recordatorioPlanFuturo · 5 días hábiles antes", () => {
  it("salta fines de semana", () => {
    expect(recordatorioPlanFuturo("2026-12-14")).toBe("2026-12-07"); // lunes → lunes anterior
    expect(recordatorioPlanFuturo("2026-12-11")).toBe("2026-12-04"); // viernes → viernes anterior
  });

  it("salta los asuetos (Nochebuena, Navidad)", () => {
    expect(recordatorioPlanFuturo("2026-12-28")).toBe("2026-12-17");
  });

  it("fecha inválida: null", () => {
    expect(recordatorioPlanFuturo("no es fecha")).toBeNull();
    expect(recordatorioPlanFuturo("2026-13-01")).toBeNull();
  });
});

describe("fechaValida", () => {
  it("solo fechas reales YYYY-MM-DD", () => {
    expect(fechaValida("2026-11-16")).toBe("2026-11-16");
    expect(fechaValida("2026-02-30")).toBeNull();
    expect(fechaValida(null)).toBeNull();
  });
});

describe("planCompletar · Plan Futuro", () => {
  const pf = { accion: "Plan Futuro", statusActual: "Plan Futuro" };

  it("Sin Beneficio Definido → «Sin Valor Def»; Aprobada con Clase → PM \"X\"", () => {
    expect(planCompletar({ ...pf, siguiente: "Sin Beneficio Definido" })).toEqual({ ok: true, accion: "Plan Futuro", statusTexto: "Sin Valor Def", siguiente: "Sin Beneficio Definido", clase: null, fecha: null });
    expect(planCompletar({ ...pf, siguiente: "Aprobada", clase: "C" })).toMatchObject({ ok: true, statusTexto: 'PM "C"', clase: "C" });
  });

  it("Aprobada sigue pidiendo la Clase", () => {
    expect(planCompletar({ ...pf, siguiente: "Aprobada" })).toMatchObject({ ok: false, error: expect.stringMatching(/Clase/) });
  });

  it("no se ofrece volver a las reuniones ni al Plan Futuro", () => {
    expect(planCompletar({ ...pf, siguiente: "Meeting 2" })).toMatchObject({ ok: false, error: expect.stringMatching(/siguiente acción/) });
    expect(planCompletar({ ...pf, siguiente: "Plan Futuro", fecha: "2099-01-01" })).toMatchObject({ ok: false, error: expect.stringMatching(/siguiente acción/) });
  });

  it("solo si sigue en Plan Futuro", () => {
    expect(planCompletar({ ...pf, statusActual: "Meeting 1", siguiente: "Aprobada", clase: "A" })).toMatchObject({ ok: false, error: expect.stringMatching(/Plan Futuro ya no está pendiente/) });
    expect(planCompletar({ ...pf, statusActual: 'PM "A"', siguiente: "Sin Beneficio Definido" })).toMatchObject({ ok: false });
  });
});

describe("planCompletar · Sin Beneficio Definido: Completar o Aprobada", () => {
  const sb = { accion: "Sin Beneficio Definido", statusActual: "Sin Valor Def" };

  it("«Completar» la cierra sin aprobar: el Status no cambia y no hay más acciones", () => {
    expect(planCompletar({ ...sb, siguiente: "Completar" })).toEqual({ ok: true, accion: "Sin Beneficio Definido", statusTexto: null, siguiente: null, clase: null, fecha: null });
  });

  it("Aprobada pide la Clase y pasa a PM «X»", () => {
    expect(planCompletar({ ...sb, siguiente: "Aprobada", clase: "A" })).toMatchObject({ ok: true, statusTexto: 'PM "A"', siguiente: "Aprobada", clase: "A" });
    expect(planCompletar({ ...sb, siguiente: "Aprobada" })).toMatchObject({ ok: false, error: expect.stringMatching(/Clase/) });
  });

  it("no se ofrece nada más (ni reuniones ni Plan Futuro)", () => {
    for (const siguiente of ["Meeting 2", "Plan Futuro", "Sin Beneficio Definido"]) {
      expect(planCompletar({ ...sb, siguiente, fecha: "2099-01-01" })).toMatchObject({ ok: false, error: expect.stringMatching(/siguiente acción/) });
    }
  });

  it("solo si sigue en Sin Valor Def; «Completar» no existe en las demás acciones", () => {
    expect(planCompletar({ ...sb, statusActual: 'PM "A"', siguiente: "Completar" })).toMatchObject({ ok: false, error: expect.stringMatching(/ya no está pendiente/) });
    expect(planCompletar({ accion: "Meeting 1", statusActual: "New", siguiente: "Completar" })).toMatchObject({ ok: false, error: expect.stringMatching(/siguiente acción/) });
    expect(planCompletar({ accion: "Plan Futuro", statusActual: "Plan Futuro", siguiente: "Completar" })).toMatchObject({ ok: false });
  });
});

describe("cierreAutomaticoEspera · 5 días hábiles después del 4.º recordatorio", () => {
  it("con los 4 enviados: el último + 5 días hábiles", () => {
    expect(cierreAutomaticoEspera(4, new Date(2026, 10, 16))).toBe("2026-11-23"); // lunes → lunes
    expect(cierreAutomaticoEspera(4, new Date(2026, 11, 18))).toBe("2026-12-29"); // viernes 18 dic: salta el fin de semana y los asuetos (24 y 25) → martes 29
  });

  it("mientras falte algún recordatorio, o sin saber cuándo se mandó el último: null", () => {
    expect(cierreAutomaticoEspera(3, new Date(2026, 10, 16))).toBeNull();
    expect(cierreAutomaticoEspera(0, null)).toBeNull();
    expect(cierreAutomaticoEspera(4, null)).toBeNull();
  });
});

describe("planCompletar · otras acciones", () => {
  it("solo la Meeting 1, la Meeting 2, el Plan Futuro y Sin Beneficio Definido se completan con el botón", () => {
    expect(planCompletar({ accion: "Aprobada", statusActual: 'PM "A"', siguiente: "Sin Beneficio Definido" })).toMatchObject({ ok: false, error: expect.stringMatching(/no se completa/) });
  });
});

describe("momentoDeAccion", () => {
  const h = [
    { campo: "valor", despues: "2026-11-16", fecha: "2026-11-16T10:00:00Z" },
    { campo: "accion", despues: { accion: "Meeting 1", siguiente: "Meeting 2" }, fecha: "2026-11-16T21:42:10Z" },
    { campo: "accion", despues: { accion: "Meeting 1", siguiente: "Plan Futuro" }, fecha: "2026-11-17T15:00:00Z" },
    { campo: "accion", despues: null, fecha: "2026-11-18T00:00:00Z" },
  ];

  it("la última vez que se completó la acción", () => {
    expect(momentoDeAccion(h, "Meeting 1")).toBe("2026-11-17T15:00:00Z");
  });

  it("null si nunca se completó", () => {
    expect(momentoDeAccion(h, "Meeting 2")).toBeNull();
    expect(momentoDeAccion([], "Meeting 1")).toBeNull();
  });
});
