import { describe, it, expect } from "vitest";
import {
  detectPlantilla, buildUnits, calcEvm, calcCalidad, calcCumplimiento,
  calcValor, calcNpsProyecto, buildProjectMetrics, faseKey,
} from "./projectMetrics";
import { today } from "./business";
import type { NpsRecord, ProjBoard, ProjItem, ProjSubitem } from "@/types";

const sub = (o: Partial<ProjSubitem>): ProjSubitem =>
  ({ id: "s", name: "sub", status: "", estado: "EN TIEMPO", deadline: null, actualEnd: null, entrega: null, responsible: "", subitems: [], ...o }) as ProjSubitem;
const item = (o: Partial<ProjItem>): ProjItem =>
  ({ id: "i", name: "item", grupo: "Valuación | Formulación", status: "", estado: "EN TIEMPO", deadline: null, endDate: null, entrega: null, cost: 0, benefit: 0, responsible: "", subitems: [], ...o }) as ProjItem;

const board: ProjBoard = { id: "b1", name: "PM-001 | Demo", pm: "Ana", sponsor: "Sp", cku: "Ck", estrategia: "Est" };

const d = (n: number): Date => { const x = today(); x.setDate(x.getDate() + n); return x; };
const AYER = d(-5);
const MANANA = d(5);
const HOY = today();

const DEV_STEP = "Desarrollo por iteraciones (Hitos) / Entrega CKU";

describe("detectPlantilla", () => {
  it("vieja: existe el step 'Desarrollo por iteraciones' en fase 3", () => {
    expect(detectPlantilla([item({ grupo: "Launch | Desarrollo", name: DEV_STEP })])).toBe("vieja");
  });
  it("nueva: no existe ese step en fase 3", () => {
    expect(detectPlantilla([item({ grupo: "Launch | Lanzamiento", name: "POC" })])).toBe("nueva");
  });
  it("el step solo cuenta si está en fase 3", () => {
    expect(detectPlantilla([item({ grupo: "Operación | Implementación", name: DEV_STEP })])).toBe("nueva");
  });
});

describe("buildUnits — unidad de medición por fase", () => {
  it("fases 1/2/4/5: la unidad es el ITEM, aunque tenga subitems", () => {
    const items = [item({ id: "i1", grupo: "Valuación | Formulación", subitems: [sub({ id: "s1" }), sub({ id: "s2" })] })];
    const u = buildUnits(items, "nueva", HOY);
    expect(u.map((x) => x.id)).toEqual(["i1"]);
    expect(u[0].kind).toBe("item");
  });

  it("fase 3 vieja: la unidad son los HITOS del step de iteraciones; los otros checkpoints se ignoran", () => {
    const items = [
      item({ id: "dev", grupo: "Launch | Desarrollo", name: DEV_STEP, subitems: [sub({ id: "h1" }), sub({ id: "h2" })] }),
      item({ id: "chk", grupo: "Launch | Desarrollo", name: "Agenda BAT CKU", subitems: [sub({ id: "h1-dup" })] }),
    ];
    const u = buildUnits(items, "vieja", HOY);
    expect(u.map((x) => x.id)).toEqual(["h1", "h2"]);
    expect(u.every((x) => x.kind === "hito")).toBe(true);
    // el hito hereda el Limit Date del step padre como ventana de recuperación
    expect(u[0].ownerId).toBe("dev");
  });

  it("fase 3 nueva: la unidad es el ITEM y su atraso lo deciden sus SUBITEMS", () => {
    const items = [item({
      id: "e1", grupo: "Launch | Lanzamiento", name: "POC", deadline: MANANA,
      subitems: [sub({ id: "s1", status: "Done" }), sub({ id: "s2", status: "Working on it", deadline: AYER })],
    })];
    const u = buildUnits(items, "nueva", HOY);
    expect(u.map((x) => x.id)).toEqual(["e1"]);
    // el item NO está vencido (su fecha es mañana) pero un subitem sí → atrasado
    expect(u[0].atrasada).toBe(true);
  });

  it("fase 3 nueva: un subitem Stuck atrasa el item aunque no tenga fecha vencida", () => {
    const items = [item({
      id: "e1", grupo: "Launch | Lanzamiento", deadline: MANANA,
      subitems: [sub({ id: "s1", status: "Stuck", deadline: MANANA })],
    })];
    expect(buildUnits(items, "nueva", HOY)[0].atrasada).toBe(true);
  });

  it("fase 3 nueva: si todos los subitems están bien, el item no está atrasado", () => {
    const items = [item({
      id: "e1", grupo: "Launch | Lanzamiento", deadline: AYER,
      subitems: [sub({ id: "s1", status: "Done" }), sub({ id: "s2", status: "Working on it", deadline: MANANA })],
    })];
    // OJO: el item venció ayer, pero manda el estado de sus subitems
    expect(buildUnits(items, "nueva", HOY)[0].atrasada).toBe(false);
  });
});

describe("regla de atraso de una unidad", () => {
  it("entregada tarde: Actual End > Limit Date", () => {
    const u = buildUnits([item({ id: "i1", status: "Done", deadline: d(-10), endDate: AYER })], "nueva", HOY);
    expect(u[0].atrasada).toBe(true);
    expect(u[0].entregada).toBe(true);
  });
  it("entregada a tiempo: Actual End <= Limit Date", () => {
    const u = buildUnits([item({ id: "i1", status: "Done", deadline: HOY, endDate: d(-2) })], "nueva", HOY);
    expect(u[0].atrasada).toBe(false);
  });
  it("sin entregar y vencida", () => {
    const u = buildUnits([item({ id: "i1", status: "Working on it", deadline: AYER })], "nueva", HOY);
    expect(u[0].atrasada).toBe(true);
  });
  it("sin entregar, no vencida", () => {
    const u = buildUnits([item({ id: "i1", status: "Future Steps", deadline: MANANA })], "nueva", HOY);
    expect(u[0].atrasada).toBe(false);
  });
  it("sin fecha y sin Done no está atrasada (no hay fecha que incumplir)", () => {
    const u = buildUnits([item({ id: "i1", status: "Future Steps", deadline: null })], "nueva", HOY);
    expect(u[0].atrasada).toBe(false);
  });
  it("Stuck siempre atrasa", () => {
    const u = buildUnits([item({ id: "i1", status: "Stuck", deadline: MANANA })], "nueva", HOY);
    expect(u[0].atrasada).toBe(true);
  });
});

describe("atrasadaScope — regla de atraso PARA SCOPE (un Done nunca cuenta)", () => {
  it("entregada tarde: atrasada=true pero atrasadaScope=false (Done nunca cuenta para Scope)", () => {
    const u = buildUnits([item({ id: "i1", status: "Done", deadline: d(-10), endDate: AYER })], "nueva", HOY);
    expect(u[0].atrasada).toBe(true);
    expect(u[0].atrasadaScope).toBe(false);
  });
  it("sin entregar y vencida: atrasadaScope=true, igual que atrasada", () => {
    const u = buildUnits([item({ id: "i1", status: "Working on it", deadline: AYER })], "nueva", HOY);
    expect(u[0].atrasadaScope).toBe(true);
  });
  it("Stuck sigue atrasando para Scope", () => {
    const u = buildUnits([item({ id: "i1", status: "Stuck", deadline: MANANA })], "nueva", HOY);
    expect(u[0].atrasadaScope).toBe(true);
  });
  it("fase 3 nueva: un item Done con subitem Done-tarde no atrasa el Scope", () => {
    const items = [item({
      id: "e1", grupo: "Launch | Lanzamiento", status: "Done", deadline: MANANA,
      subitems: [sub({ id: "s1", status: "Done", deadline: d(-10), actualEnd: AYER })],
    })];
    const u = buildUnits(items, "nueva", HOY);
    expect(u[0].atrasada).toBe(true);      // sigue contando para SPI/Calidad
    expect(u[0].atrasadaScope).toBe(false); // pero no para Scope
  });
});

describe("calcEvm", () => {
  it("SPI = avance real / avance plan (conteo, sin dinero)", () => {
    const items = [
      item({ id: "a", status: "Done", deadline: d(-10), endDate: d(-11) }),
      item({ id: "b", status: "Working on it", deadline: AYER }),   // debería estar, no está
      item({ id: "c", status: "Future Steps", deadline: MANANA }),  // aún no toca
    ];
    const u = buildUnits(items, "nueva", HOY);
    const r = calcEvm(u, items, {}, HOY);
    expect(r.unidadesEntregadas).toBe(1);
    expect(r.unidadesQueDeberian).toBe(2);
    expect(r.spi).toBeCloseTo(0.5, 5);
  });

  it("CPI = EV / PV, con el baseline de los items", () => {
    const items = [
      item({ id: "a", status: "Done", cost: 500, deadline: d(-10) }),
      item({ id: "b", status: "Working on it", cost: 300, deadline: AYER }),
    ];
    const u = buildUnits(items, "nueva", HOY);
    // sin baseline → usa el costo actual: EV=500, PV=800
    expect(calcEvm(u, items, {}, HOY).cpi).toBeCloseTo(500 / 800, 5);
    // con baseline distinto → manda el baseline
    const bl = { a: { boardId: "b1", cost: 1000, savedAt: "" }, b: { boardId: "b1", cost: 1000, savedAt: "" } };
    expect(calcEvm(u, items, bl, HOY).cpi).toBeCloseTo(0.5, 5);
  });

  it("CPI no usa AC: cambiar el costo real de Monday no lo mueve", () => {
    const items = [item({ id: "a", status: "Done", cost: 9999, deadline: d(-10) })];
    const u = buildUnits(items, "nueva", HOY);
    const bl = { a: { boardId: "b1", cost: 100, savedAt: "" } };
    // EV = PV = baseline (100) → 1.00, sin importar que Monday diga 9999
    expect(calcEvm(u, items, bl, HOY).cpi).toBe(1);
  });

  it("Scope: 0 si hay algún atraso, 1 si no", () => {
    const ok = [item({ id: "a", status: "Done", deadline: d(-10), endDate: d(-11) })];
    expect(calcEvm(buildUnits(ok, "nueva", HOY), ok, {}, HOY).scope).toBe(1);
    const mal = [...ok, item({ id: "b", status: "Working on it", deadline: AYER })];
    expect(calcEvm(buildUnits(mal, "nueva", HOY), mal, {}, HOY).scope).toBe(0);
  });

  it("Scope: un Done entregado tarde NO cuenta como atraso (solo lo que sigue abierto/vencido o Stuck)", () => {
    const soloDoneTarde = [item({ id: "a", status: "Done", deadline: d(-10), endDate: AYER })];
    expect(calcEvm(buildUnits(soloDoneTarde, "nueva", HOY), soloDoneTarde, {}, HOY).scope).toBe(1);
  });

  it("EVM = (SPI + CPI + Scope) / 3", () => {
    const items = [
      item({ id: "a", status: "Done", cost: 100, deadline: d(-10), endDate: d(-11) }),
      item({ id: "b", status: "Working on it", cost: 100, deadline: AYER }),
    ];
    const u = buildUnits(items, "nueva", HOY);
    const r = calcEvm(u, items, {}, HOY);
    expect(r.evm).toBeCloseTo(((r.spi as number) + (r.cpi as number) + (r.scope as number)) / 3, 6);
    // un atraso pone Scope en 0 → el techo del EVM es 2/3
    expect(r.evm as number).toBeLessThanOrEqual(2 / 3 + 1e-9);
  });
});

describe("calcCalidad — solo fase 3", () => {
  const f3 = (o: Partial<ProjItem>) => item({ grupo: "Launch | Lanzamiento", ...o });

  it("ignora las unidades que no son de fase 3", () => {
    const items = [item({ id: "v1", grupo: "Valuación | Formulación", status: "Working on it", deadline: AYER })];
    expect(calcCalidad(buildUnits(items, "nueva", HOY), {}, HOY).total).toBe(0);
  });

  it("salió a tiempo → 100", () => {
    const items = [f3({ id: "e1", status: "Done", deadline: d(-2), endDate: d(-3) })];
    expect(calcCalidad(buildUnits(items, "nueva", HOY), {}, HOY).unidades[0].nota).toBe(100);
  });

  it("sin entregar y aún dentro del Limit Date → 50 (recuperable)", () => {
    const items = [f3({ id: "e1", status: "Working on it", deadline: MANANA })];
    const r = calcCalidad(buildUnits(items, "nueva", HOY), {}, HOY).unidades[0];
    expect(r.nota).toBe(50);
    expect(r.recuperable).toBe(true);
  });

  it("vencida sin responsable asignado → 0", () => {
    const items = [f3({ id: "e1", status: "Working on it", deadline: AYER })];
    expect(calcCalidad(buildUnits(items, "nueva", HOY), {}, HOY).unidades[0].nota).toBe(0);
  });

  it("vencida con responsable = PM → 0", () => {
    const items = [f3({ id: "e1", status: "Working on it", deadline: AYER })];
    const rep = { e1: { responsible: "PM" as const } };
    expect(calcCalidad(buildUnits(items, "nueva", HOY), rep, HOY).unidades[0].nota).toBe(0);
  });

  it("vencida con responsable ≠ PM → 50", () => {
    const items = [f3({ id: "e1", status: "Working on it", deadline: AYER })];
    const rep = { e1: { responsible: "CKU" as const } };
    expect(calcCalidad(buildUnits(items, "nueva", HOY), rep, HOY).unidades[0].nota).toBe(50);
  });

  it("entregada tarde con responsable ≠ PM → 50", () => {
    const items = [f3({ id: "e1", status: "Done", deadline: d(-10), endDate: AYER })];
    const rep = { e1: { responsible: "Desarrollo" as const } };
    expect(calcCalidad(buildUnits(items, "nueva", HOY), rep, HOY).unidades[0].nota).toBe(50);
  });

  it("hereda el responsable del step padre cuando el hito no tiene el suyo (plantilla vieja)", () => {
    const items = [item({
      id: "dev", grupo: "Launch | Desarrollo", name: DEV_STEP, deadline: d(-20),
      subitems: [sub({ id: "h1", status: "Working on it", deadline: AYER })],
    })];
    const u = buildUnits(items, "vieja", HOY);
    // la atribución vieja está en el STEP, no en el hito
    const r = calcCalidad(u, { dev: { responsible: "Desarrollo" } }, HOY).unidades[0];
    expect(r.nota).toBe(50);
    expect(r.heredada).toBe(true);
    expect(r.responsable).toBe("Desarrollo");
  });

  it("la atribución propia del hito gana sobre la heredada", () => {
    const items = [item({
      id: "dev", grupo: "Launch | Desarrollo", name: DEV_STEP, deadline: d(-20),
      subitems: [sub({ id: "h1", status: "Working on it", deadline: AYER })],
    })];
    const u = buildUnits(items, "vieja", HOY);
    const rep = { dev: { responsible: "Desarrollo" as const }, h1: { responsible: "PM" as const } };
    const r = calcCalidad(u, rep, HOY).unidades[0];
    expect(r.nota).toBe(0);           // el PM del hito manda
    expect(r.heredada).toBe(false);
  });

  it("en plantilla nueva no hay herencia: el item es su propio dueño", () => {
    const items = [item({ id: "e1", grupo: "Launch | Lanzamiento", status: "Working on it", deadline: AYER })];
    const r = calcCalidad(buildUnits(items, "nueva", HOY), {}, HOY).unidades[0];
    expect(r.heredada).toBe(false);
    expect(r.nota).toBe(0);
  });

  it("pct es el PROMEDIO de las notas", () => {
    const items = [
      f3({ id: "a", status: "Done", deadline: d(-2), endDate: d(-3) }),   // 100
      f3({ id: "b", status: "Working on it", deadline: AYER }),            // 0
    ];
    expect(calcCalidad(buildUnits(items, "nueva", HOY), {}, HOY).pct).toBe(50);
  });
});

describe("calcCumplimiento", () => {
  it("fases 1/2/4/5 se califican por FASE; fase 3 por entregable", () => {
    const items = [
      item({ id: "v1", grupo: "Valuación | Formulación", status: "Done" }),
      item({ id: "v2", grupo: "Valuación | Formulación", status: "Done" }),
      item({ id: "e1", grupo: "Launch | Lanzamiento", status: "Done" }),
      item({ id: "e2", grupo: "Launch | Lanzamiento", status: "Done" }),
    ];
    const r = calcCumplimiento(buildUnits(items, "nueva", HOY), "b1", {});
    // 1 fila por la fase Valuación + 1 por cada entregable de fase 3 = 3
    expect(r.total).toBe(3);
    expect(r.filas.filter((f) => f.tipo === "fase")).toHaveLength(1);
    expect(r.filas.filter((f) => f.tipo === "entregable")).toHaveLength(2);
  });

  it("una fase con un item atrasado cuenta tarde, y se excusa por responsable", () => {
    const items = [item({ id: "v1", grupo: "Valuación | Formulación", status: "Working on it", deadline: AYER })];
    const u = buildUnits(items, "nueva", HOY);
    expect(calcCumplimiento(u, "b1", {}).pct).toBe(0);
    const key = faseKey("b1", "Valuación | Formulación");
    expect(calcCumplimiento(u, "b1", { [key]: { responsible: "CKU" } }).pct).toBe(100);
    // "PM" no excusa
    expect(calcCumplimiento(u, "b1", { [key]: { responsible: "PM" } }).pct).toBe(0);
  });
});

describe("calcValor", () => {
  it("costo suma TODOS los items; sin Business Case no hay ROI", () => {
    const items = [item({ id: "a", cost: 100 }), item({ id: "b", cost: 250 })];
    const r = calcValor(items);
    expect(r.costo).toBe(350);
    expect(r.beneficio).toBeNull();
    expect(r.roi).toBeNull();
  });
});

describe("calcNpsProyecto", () => {
  const rec = (o: Partial<NpsRecord>): NpsRecord =>
    ({ answers: { nps: 10 }, pm: "", invalidated: false, respondentEmail: "", submittedAt: "", reqCode: "", reqId: "", ...o }) as NpsRecord;

  it("solo cuenta respuestas cuyo reqId es un subitem del step 'Encuesta para NPS' del board", () => {
    const items = [item({
      id: "nps", name: "Encuesta para NPS", grupo: "Revisión | Cierre ROI",
      subitems: [sub({ id: "t1" }), sub({ id: "t2" })],
    })];
    const records = [
      rec({ reqId: "t1", answers: { nps: 10 } }),
      rec({ reqId: "t2", answers: { nps: 0 } }),
      rec({ reqId: "otro-board", answers: { nps: 10 } }), // de otro proyecto: no cuenta
    ];
    const r = calcNpsProyecto(items, records);
    expect(r.total).toBe(2);
    expect(r.promoters).toBe(1);
    expect(r.detractors).toBe(1);
    expect(r.nps).toBe(0); // (1-1)/2 * 100
  });

  it("sin encuestas del proyecto, el NPS es null", () => {
    expect(calcNpsProyecto([item({ id: "x" })], []).nps).toBeNull();
  });
});

describe("buildProjectMetrics — integración", () => {
  it("arma la medición completa de un board", () => {
    const items = [
      item({ id: "k", grupo: "Valuación | Formulación", name: "Kick Off Project Meeting", status: "Done", cost: 100, benefit: 5000, deadline: d(-20), endDate: d(-21) }),
      item({ id: "e1", grupo: "Launch | Lanzamiento", name: "POC", status: "Working on it", cost: 400, deadline: AYER }),
    ];
    const m = buildProjectMetrics({ board, items, now: HOY });
    expect(m.code).toBe("PM-001");
    expect(m.name).toBe("Demo");
    expect(m.plantilla).toBe("nueva");
    expect(m.units).toHaveLength(2);
    expect(m.evm.scope).toBe(0);            // hay un atraso
    expect(m.calidad.total).toBe(1);        // solo el de fase 3
    expect(m.atrasos).toHaveLength(1);
    expect(m.atrasos[0].id).toBe("e1");
    expect(m.valor.costo).toBe(500);
  });
});
