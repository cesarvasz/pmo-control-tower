import { describe, it, expect } from "vitest";
import {
  reqStage,
  resolveProjStage,
  calcPmValue,
  pmWorstStatus,
  buildBoardHealthMap,
  calcPmMetrics,
  calcEntregaStats,
  calcEntregaStatsRaw,
  calcReprocesoPct,
  calcReprocesoStats,
  calcReprocesoCascade,
  calidadUnits,
  calcItemCalidad,
  calcItemNota,
  calidadProjectStatus,
  buildEntregaRows,
  buildLateResponsibleRows,
  buildLateResponsibleRowsRaw,
  buildReprocesoRows,
} from "./dashboard";
import { today } from "./business";
import type { BoardHealthData } from "./proj";
import type { DelayMap } from "./delay";
import type { ProjBoard, ProjItem, ProjSubitem, ReqItem } from "@/types";

// Fixtures mínimos: solo se rellenan los campos que leen las funciones.
const req = (o: Partial<ReqItem>): ReqItem => o as ReqItem;
const proj = (o: Partial<ProjItem>): ProjItem => ({ subitems: [], ...o }) as ProjItem;
const sub = (o: Partial<ProjSubitem>): ProjSubitem => o as ProjSubitem;
const board = (o: Partial<ProjBoard>): ProjBoard => o as ProjBoard;
const onTime = (verdict: "on-time" | "late" | "n/a", actual?: Date | null): ReqItem["onTime"] => ({ verdict, phases: actual ? [{ name: "Test", actual, target: null, late: false, slipDays: 0 }] : [] } as ReqItem["onTime"]);

describe("reqStage", () => {
  it("mapea cada grupo a su etapa; \"Cierre ROI\" cuenta como Aprobación hasta que cierre", () => {
    expect(reqStage({ grupo: "Valuación" })).toBe("validacion");
    expect(reqStage({ grupo: "Aprobación" })).toBe("validacion");
    expect(reqStage({ grupo: "Desarrollo" })).toBe("aprobacion");
    expect(reqStage({ grupo: "Operación" })).toBe("aprobacion");
    expect(reqStage({ grupo: "Cierre ROI" })).toBe("aprobacion");
    expect(reqStage({ grupo: "Cerrados" })).toBe("confirmacion");
    expect(reqStage({ grupo: "En Espera" })).toBeNull();
  });
});

describe("resolveProjStage (evaluación descendente Confirmación > Aprobación > Validación)", () => {
  // El Business Case (Benefit $ / Cost $) vive en "Kick Off Project Meeting" (fase
  // Valuación) — Validación y Aprobación toman su monto de ahí, no del step que evalúan.
  const bc = (cost = 0, benefit = 0): ProjItem =>
    proj({ grupo: "Valuación | Formulación del proyecto", name: "Kick Off Project Meeting (Entregable Business Case redactado)", status: "Done", cost, benefit });
  const vg = (grupo: string, status: string, name = "Value Gate (BC) Firmado y aprobado (Sponsor+VPA+PMO Mgr)"): ProjItem =>
    proj({ grupo, name, status, cost: 0, benefit: 0 });
  const cfo = (status: string): ProjItem =>
    proj({ grupo: "Aprobación | Value Gate", name: "Plan de beneficios acordados con CFO", status, cost: 0, benefit: 0 });
  const val = (status: string): ProjItem =>
    proj({ grupo: "Valuación | Formulación del proyecto", name: "VPA valida Business Case (Entregable Business Case validado por VPA)", status, cost: 0, benefit: 0 });
  const roi = (dias: 30 | 60 | 90, status: string, cost = 0, benefit = 0): ProjItem =>
    proj({ grupo: "Revisión | Cierre ROI", name: `VPA Recopila datos a ${dias} dias (Compara Valor real contra BC)`, status, cost, benefit });

  it("Validación: step de Valuación Done, monto = Business Case (Kick Off)", () => {
    const r = resolveProjStage([bc(10, 100), val("Done")]);
    expect(r).toEqual({ stage: "validacion", cost: 10, benefit: 100 });
  });

  it("sin nada Done → null", () => {
    expect(resolveProjStage([bc(10, 100), val("Working on it")])).toBeNull();
  });

  it("sin Kick Off Project Meeting en el board → monto en 0 (no null)", () => {
    expect(resolveProjStage([val("Done")])).toEqual({ stage: "validacion", cost: 0, benefit: 0 });
  });

  it("Aprobación: exige los 3 steps Done (CFO + VG Aprobación + VG Launch); monto = Business Case (Kick Off)", () => {
    const items = [
      bc(10, 100),
      cfo("Done"),
      vg("Aprobación | Value Gate", "Done"),
      vg("Launch | Desarrollo", "Done"),
    ];
    expect(resolveProjStage(items)).toEqual({ stage: "aprobacion", cost: 10, benefit: 100 });
  });

  it("Aprobación: el Value Gate de Launch acepta \"actualizado y firmado\" (sin \"aprobado\")", () => {
    const items = [
      bc(10, 100),
      cfo("Done"),
      vg("Aprobación | Value Gate", "Done"),
      vg("Launch | Desarrollo", "Done", "Value Gate (BC) actualizado y firmado (VPA+Sponsor+PMO Mgr)"),
    ];
    expect(resolveProjStage(items)).toEqual({ stage: "aprobacion", cost: 10, benefit: 100 });
  });

  it("Aprobación: si falta uno de los 3 Done, no cuenta (cae a Validación si aplica)", () => {
    const items = [
      bc(1, 1),
      cfo("Done"),
      vg("Aprobación | Value Gate", "Done"),
      vg("Launch | Desarrollo", "Working on it"), // Launch aún no
      val("Done"),
    ];
    expect(resolveProjStage(items)).toEqual({ stage: "validacion", cost: 1, benefit: 1 });
  });

  it("Confirmación: el step en Working on it manda; si todos están Done, el más reciente (90>60>30)", () => {
    // Un step en curso → se usa ESE (aunque aún no haya ninguno Done).
    expect(resolveProjStage([roi(30, "Working on it", 1, 100)])).toEqual({ stage: "confirmacion", cost: 1, benefit: 100 });
    expect(resolveProjStage([roi(30, "Done", 1, 100)])).toEqual({ stage: "confirmacion", cost: 1, benefit: 100 });
    expect(resolveProjStage([roi(30, "Done", 1, 100), roi(60, "Done", 2, 200)])).toEqual({ stage: "confirmacion", cost: 2, benefit: 200 });
    // 30 y 60 Done, 90 en curso → gana el que está en Working on it (90).
    expect(resolveProjStage([roi(30, "Done", 1, 100), roi(60, "Done", 2, 200), roi(90, "Working on it", 3, 300)]))
      .toEqual({ stage: "confirmacion", cost: 3, benefit: 300 });
    // Todos Done → el más reciente (90).
    expect(resolveProjStage([roi(30, "Done", 1, 100), roi(60, "Done", 2, 200), roi(90, "Done", 3, 300)]))
      .toEqual({ stage: "confirmacion", cost: 3, benefit: 300 });
    // Existe pero no iniciado (ni WIP ni Done) → no califica como Confirmación.
    expect(resolveProjStage([roi(30, "Not Started", 1, 100)])).toBeNull();
  });

  it("Confirmación gana aunque también se cumplan Aprobación y Validación", () => {
    const items = [
      bc(1, 1), val("Done"),
      cfo("Done"), vg("Aprobación | Value Gate", "Done"), vg("Launch | Desarrollo", "Done"),
      roi(30, "Done", 5, 5000),
    ];
    expect(resolveProjStage(items)).toEqual({ stage: "confirmacion", cost: 5, benefit: 5000 });
  });
});

describe("calcPmValue", () => {
  const reqs: ReqItem[] = [
    req({ pm: "Luis", grupo: "Desarrollo", benefitType: "HardSaving", costRH: 1000, costSft: 0, benefit: 5000, name: "R1" }),
    req({ pm: "Luis", grupo: "Aprobación", benefitType: "Soft", costRH: 500, costSft: 0, benefit: 2000, name: "R2" }),
    req({ pm: "Luis", grupo: "Cerrados", benefitType: "HardSaving", costRH: 200, costSft: 0, benefit: 9000, name: "R4" }),
    req({ pm: "Otro", grupo: "Desarrollo", benefitType: "HardSaving", costRH: 999, costSft: 0, benefit: 999, name: "R3" }),
  ];

  it("acumulativo: un REQ Confirmado (Cerrados) también suma en Aprobación", () => {
    const v = calcPmValue("Luis", reqs, [], [], false);
    expect(v.validacionCost).toBe(500);
    expect(v.validacionBenefit).toBe(2000);       // R2 (Aprobación)
    expect(v.aprobacionCost).toBe(1200);          // R1 (Desarrollo) + R4 (Cerrados)
    expect(v.aprobacionBenefit).toBe(14000);      // 5000 + 9000 (confirmado incluido)
    expect(v.confirmacionCost).toBe(200);
    expect(v.confirmacionBenefit).toBe(9000);     // R4 (Cerrados) — subconjunto de Aprobación
    expect(v.totalCost).toBe(1700);
    expect(v.totalBenefit).toBe(16000);           // Validación + Aprobación; excluye a "Otro"
  });

  it("hardOnly limita a benefitType HardSaving", () => {
    const v = calcPmValue("Luis", reqs, [], [], true);
    expect(v.validacionBenefit).toBe(0);          // R2 (Soft) excluido
    expect(v.totalBenefit).toBe(14000);           // R1 + R4
  });

  it("REQ en Cierre ROI (sin cerrar) cuenta como Aprobación", () => {
    const v = calcPmValue("Luis", [req({ pm: "Luis", grupo: "Cierre ROI", benefitType: "HardSaving", costRH: 1, costSft: 0, benefit: 50, name: "R5" })], [], [], false);
    expect(v.aprobacionBenefit).toBe(50);
  });

  it("un proyecto solo con Validación Done cuenta en esa etapa, con el monto del Business Case (Kick Off)", () => {
    const projBoards = [board({ id: "b1", pm: "Luis", benefitType: "HardSaving" })];
    const projItems = [
      proj({ boardId: "b1", boardName: "P1", status: "Done", name: "Kick Off Project Meeting (Entregable Business Case redactado)", grupo: "Valuación | Formulación del proyecto", cost: 300, benefit: 1000 }),
      proj({ boardId: "b1", boardName: "P1", status: "Done", name: "VPA valida Business Case (Entregable Business Case validado por VPA)", grupo: "Valuación | Formulación del proyecto", cost: 0, benefit: 0 }),
    ];
    const v = calcPmValue("Luis", [], projItems, projBoards, false);
    expect(v.validacionCost).toBe(300);
    expect(v.validacionBenefit).toBe(1000);
    expect(v.aprobacionBenefit).toBe(0);
    expect(v.confirmacionBenefit).toBe(0);
  });

  it("un proyecto con dato VPA Recopila (Confirmación) usa el costo/beneficio del step, no la suma del board", () => {
    const projBoards = [board({ id: "b1", pm: "Luis", benefitType: "HardSaving" })];
    const projItems = [
      proj({ boardId: "b1", boardName: "P1", status: "Working on it", name: "Otro paso", grupo: "Launch | Desarrollo", cost: 300, benefit: 1000 }),
      proj({ boardId: "b1", boardName: "P1", status: "Done", name: "VPA Recopila datos a 30 dias (Compara Valor real contra BC)", grupo: "Revisión | Cierre ROI", cost: 5, benefit: 4000 }),
    ];
    const v = calcPmValue("Luis", [], projItems, projBoards, false);
    expect(v.confirmacionBenefit).toBe(4000);   // benefit del step de 30 días, no la suma del board
    expect(v.confirmacionCost).toBe(5);         // costo del mismo step, no la suma del board
    expect(v.validacionBenefit).toBe(0);
    expect(v.aprobacionBenefit).toBe(4000);     // confirmado ⇒ también aprobado (sin BC en el board → mismo monto)
    expect(v.detail.projects[0].stages.confirmacion).toEqual({ cost: 5, benefit: 4000 });
    expect(v.detail.projects[0].stages.aprobacion).toEqual({ cost: 5, benefit: 4000 });
  });

  it("proyecto confirmado CON Business Case: Aprobación usa el BC; Confirmación el valor medido", () => {
    const projBoards = [board({ id: "b1", pm: "Luis", benefitType: "HardSaving" })];
    const projItems = [
      proj({ boardId: "b1", boardName: "P1", status: "Done", name: "Kick Off Project Meeting (Entregable Business Case redactado)", grupo: "Valuación | Formulación del proyecto", cost: 10, benefit: 1000 }),
      proj({ boardId: "b1", boardName: "P1", status: "Done", name: "VPA Recopila datos a 30 dias (Compara Valor real contra BC)", grupo: "Revisión | Cierre ROI", cost: 5, benefit: 1200 }),
    ];
    const v = calcPmValue("Luis", [], projItems, projBoards, false);
    expect(v.aprobacionBenefit).toBe(1000);     // Business Case (valor aprobado)
    expect(v.confirmacionBenefit).toBe(1200);   // valor real medido
    expect(v.totalBenefit).toBe(1000);          // Validación(0) + Aprobación(1000); Confirmación no re-suma
  });
});

describe("buildBoardHealthMap", () => {
  it("deriva la salud de cada board (item Done a tiempo → on-track)", () => {
    const projBoards = [{ id: "b1" }];
    const projItems = [proj({ boardId: "b1", status: "Done", estado: "EN TIEMPO", cost: 100 })];
    const m = buildBoardHealthMap(projItems, projBoards, {});
    expect(m.get("b1")).toBeDefined();
    expect(m.get("b1")!.healthStatus).toBe("on-track");
  });
});

describe("pmWorstStatus", () => {
  const emptyBhm = new Map<string, BoardHealthData>();

  it("un REQ off-track del PM → estado peor off-track", () => {
    const reqs = [req({ pm: "Luis", estado: "EN PROCESO", grupo: "Desarrollo", vem: 0.5 })];
    expect(pmWorstStatus("Luis", [], reqs, [], emptyBhm, new Map())).toBe("off-track");
  });

  it("todo On Track → on-track", () => {
    const reqs = [req({ pm: "Luis", estado: "EN PROCESO", grupo: "Desarrollo", vem: 0.98 })];
    expect(pmWorstStatus("Luis", [], reqs, [], emptyBhm, new Map())).toBe("on-track");
  });
});

describe("calcEntregaStats (Cumplimiento de Entrega: REQ + FASES de Proyecto)", () => {
  // Fase por defecto: board b1, grupo "Fase 1".
  const step = (o: Partial<ReturnType<typeof proj>>) => proj({ boardId: "b1", grupo: "Fase 1", ...o });

  it("REQ cerrado cuenta 1 unidad c/u; solo excusa si el responsable es ≠ PM", () => {
    const reqs = [
      req({ id: "r1", onTime: onTime("on-time") }),
      req({ id: "r2", onTime: onTime("late") }),
      req({ id: "r3", onTime: onTime("late") }),
    ];
    const delays: DelayMap = { r3: { responsible: "VPA" } }; // r3 excusado
    expect(calcEntregaStats(reqs, [], delays)).toEqual({ total: 2, onTime: 1, late: 1, pct: 50 });
  });

  it("un item de Proyecto SIN subitems SÍ cuenta ahora (steps y hitos comparten la misma fase)", () => {
    const projs = [step({ id: "p1", entrega: "late" })];
    expect(calcEntregaStats([], projs, {})).toEqual({ total: 1, onTime: 0, late: 1, pct: 0 });
  });

  it("una fase con 8 de 10 items a tiempo cuenta como UNA unidad 'con atraso' (binario, no fraccional)", () => {
    const projs = [
      step({ id: "p1", entrega: "on-time" }),
      step({ id: "p2", entrega: "late" }, ),
      step({
        id: "p3", entrega: "on-time",
        subitems: Array.from({ length: 8 }, (_, i) => sub({ id: `s${i}`, entrega: i < 6 ? "on-time" : "late" })),
      }),
    ];
    // 10 items evaluados en la fase (2 steps + 8 hitos), 8 a tiempo / 2 atrasados → 1 sola fase, "con atraso".
    expect(calcEntregaStats([], projs, {})).toEqual({ total: 1, onTime: 0, late: 1, pct: 0 });
  });

  it("una fase sin ningún atraso cuenta como 'sin atraso' aunque tenga muchos items evaluados", () => {
    const projs = [
      step({ id: "p1", entrega: "on-time", subitems: [sub({ id: "s1", entrega: "on-time" }), sub({ id: "s2", entrega: "on-time" })] }),
      step({ id: "p2", entrega: "on-time" }),
    ];
    expect(calcEntregaStats([], projs, {})).toEqual({ total: 1, onTime: 1, late: 0, pct: 100 });
  });

  it("excusar la FASE (no un item) libera TODOS sus atrasos a la vez", () => {
    const projs = [
      step({ id: "p1", entrega: "late", subitems: [sub({ id: "s1", entrega: "late" }), sub({ id: "s2", entrega: "on-time" })] }),
    ];
    const delays: DelayMap = { "b1::Fase 1": { responsible: "Sponsor" } }; // excusa la fase entera
    expect(calcEntregaStats([], projs, delays)).toEqual({ total: 1, onTime: 1, late: 0, pct: 100 });
  });

  it("dos fases del mismo board son unidades independientes", () => {
    const projs = [
      step({ id: "p1", entrega: "late" }),                                   // Fase 1 → con atraso
      proj({ id: "p2", boardId: "b1", grupo: "Fase 2", entrega: "on-time" }), // Fase 2 → sin atraso
    ];
    expect(calcEntregaStats([], projs, {})).toEqual({ total: 2, onTime: 1, late: 1, pct: 50 });
  });

  it("el mismo nombre de fase en boards distintos NO se mezcla (la clave incluye el board)", () => {
    const projs = [
      step({ id: "p1", boardId: "b1", entrega: "late" }),
      step({ id: "p2", boardId: "b2", entrega: "on-time" }),
    ];
    expect(calcEntregaStats([], projs, {})).toEqual({ total: 2, onTime: 1, late: 1, pct: 50 });
  });

  it("una fase sin nada evaluado todavía (todo pendiente) no cuenta — medición progresiva", () => {
    const projs = [step({ id: "p1", entrega: null, subitems: [sub({ id: "s1", entrega: null })] })];
    expect(calcEntregaStats([], projs, {})).toEqual({ total: 0, onTime: 0, late: 0, pct: null });
  });
});

describe("calcEntregaStatsRaw (tarjeta principal: todas las fases con atraso, sin excusar por responsable)", () => {
  const step = (o: Partial<ReturnType<typeof proj>>) => proj({ boardId: "b1", grupo: "Fase 1", ...o });

  it("un atraso con responsable ≠ PM cuenta igual (no se excusa, a diferencia de calcEntregaStats)", () => {
    const reqs = [req({ id: "r1", onTime: onTime("on-time") }), req({ id: "r2", onTime: onTime("late") })];
    const projs = [step({ id: "p1", entrega: "late" })];
    // Nota: calcEntregaStatsRaw no recibe delays — no hay forma de excusar nada.
    expect(calcEntregaStatsRaw(reqs, projs)).toEqual({ total: 3, onTime: 1, late: 2, pct: 33 });
  });

  it("una fase sigue pesando 1 unidad sin importar cuántos steps/hitos atrasados tenga", () => {
    const projs = [
      step({
        id: "p1", entrega: "late",
        subitems: [sub({ id: "s1", entrega: "on-time" }), sub({ id: "s2", entrega: "late" })],
      }),
    ];
    const stats = calcEntregaStatsRaw([], projs);
    expect(stats).toEqual({ total: 1, onTime: 0, late: 1, pct: 0 });
  });
});

describe("calcReprocesoPct (5º componente del KPI: nota 0/50/100 por item de Proyecto)", () => {
  const cerrado = (id: string) => req({ id, pm: "Luis", estado: "CERRADO" });
  const CPM_INI = new Date(2026, 0, 1), CPM_FIN = new Date(2026, 0, 31);
  // Grupo por defecto "Launch" = Fase 3 (única fase que mide Calidad/Reproceso, ver isFase3).
  // Done, CON ventana CPM propia y SIN subitems → recuperado: true trivialmente (nada
  // puede quedar "fuera" sin hitos) — aísla el componente "responsable" en los tests.
  const step = (id: string, grupo = "Launch") => proj({ id, grupo, status: "Done", startDate: CPM_INI, deadline: CPM_FIN });

  it("null si no hay unidades en scope (sin REQ cerrados ni items Done/con señal)", () => {
    expect(calcReprocesoPct([req({ id: "1", estado: "EN PROCESO" })], [proj({ id: "p1", status: "Working on it" })], {})).toBeNull();
  });

  it("sin asignar penaliza (REQ): 2 cerrados sin responsable → 0% limpio", () => {
    expect(calcReprocesoPct([cerrado("1"), cerrado("2")], [], {})).toBe(0);
  });

  it("100% solo si todos los cerrados están excusados (responsable ≠ PM)", () => {
    const reqs = [cerrado("1"), cerrado("2")];
    expect(calcReprocesoPct(reqs, [], { "1": { responsible: "VPA" }, "2": { responsible: "CKU" } })).toBe(100);
  });

  it("PM y sin asignar penalizan; solo un responsable ≠ PM excusa (1 de 4 → 25%)", () => {
    const reqs = [cerrado("1"), cerrado("2"), cerrado("3"), cerrado("4")];
    expect(calcReprocesoPct(reqs, [], { "1": { responsible: "PM" }, "2": { responsible: "Sponsor" } })).toBe(25);
  });

  it("un item recuperado (ventana CPM propia, sin hitos fuera) pero SIN responsable asignado se queda en 50 — ya no hay bypass automático por CPM", () => {
    expect(calcReprocesoPct([], [step("p1")], {})).toBe(50);
  });

  it("excusando el responsable (≠ PM) un item recuperado llega a 100; \"PM\" no excusa, se queda en 50", () => {
    expect(calcReprocesoPct([], [step("p1")], { p1: { responsible: "Sin reproceso" } })).toBe(100);
    expect(calcReprocesoPct([], [step("p1")], { p1: { responsible: "PM" } })).toBe(50);
  });

  it("sin ventana CPM propia (falta startDate/deadline) no se puede verificar \"recuperado\" → pierde ese 50% aunque el responsable esté excusado", () => {
    const sinVentana = proj({ id: "p1", grupo: "Launch", status: "Done" });
    expect(calcReprocesoPct([], [sinVentana], { p1: { responsible: "Sin reproceso" } })).toBe(50);
  });

  it("un hito fuera de la ventana CPM del item quita el 50% de \"recuperado\", aunque el responsable esté excusado", () => {
    const hitoFuera = sub({ id: "h1", name: "h1", deadline: new Date(2026, 1, 5) }); // después de CPM_FIN
    const p = proj({ id: "p1", grupo: "Launch", status: "Done", startDate: CPM_INI, deadline: CPM_FIN, subitems: [hitoFuera] });
    expect(calcReprocesoPct([], [p], { p1: { responsible: "Sin reproceso" } })).toBe(50);
  });

  it("combina REQ cerrados + items de Proyecto (medición progresiva: sin señal aún no entran)", () => {
    const reqs = [cerrado("r1")];
    const projs = [
      step("p1"),                                    // Done, recuperado, sin responsable → nota 50
      proj({ id: "p2", status: "Working on it" }),    // sin hitos Done ni pendientes vencidos → no entra
    ];
    // r1 sin atribución → nota 0; p1 → nota 50. Promedio (0+50)/2 = 25.
    expect(calcReprocesoPct(reqs, projs, {})).toBe(25);
  });

  it("cada item es su propia unidad, no toda la fase junta", () => {
    const projs = [step("p1"), step("p2"), step("p3")];
    const reproceso: DelayMap = { p1: { responsible: "Sin reproceso" }, p3: { responsible: "Sin reproceso" } };
    // p1/p3 excusados y recuperados → 100 c/u; p2 sin excusar → 50. Promedio (100+100+50)/3 ≈ 83.
    expect(calcReprocesoPct([], projs, reproceso)).toBe(83);
  });

  it("SOLO Fase 3 (Launch) mide Calidad/Reproceso: un item de otra fase no cuenta, aunque esté Done", () => {
    const projs = [
      step("p1"),                                                                                   // Fase 3, cuenta
      proj({ id: "p2", grupo: "Valuación | Formulación del proyecto", status: "Done", startDate: CPM_INI, deadline: CPM_FIN }), // otra fase, no cuenta
      proj({ id: "p3", grupo: "Revisión | Cierre ROI", status: "Done", startDate: CPM_INI, deadline: CPM_FIN }),                // otra fase, no cuenta
    ];
    // Si contaran las 3 (sin responsable asignado a ninguna) el promedio sería igual (50),
    // pero el total debe ser 1 (no 3) — lo confirmamos vía calcReprocesoStats.
    expect(calcReprocesoStats([], projs, {})).toMatchObject({ total: 1, pct: 50 });
  });

  it("Fase 3 con plantilla vieja (\"Launch | Desarrollo\") también cuenta — se detecta por prefijo, no por nombre exacto", () => {
    const projs = [step("p1", "Launch | Desarrollo")];
    expect(calcReprocesoPct([], projs, { p1: { responsible: "Sin reproceso" } })).toBe(100);
  });
});

describe("buildEntregaRows (auditoría Cumplimiento de Entrega)", () => {
  it("una fila por REQ y una por FASE de Proyecto con algo evaluado (excluye n/a y fases sin nada Done)", () => {
    const reqs = [
      req({ id: "r1", name: "R1", grupo: "Desarrollo", pm: "Luis", deadline: null, onTime: onTime("late") }),
      req({ id: "r2", name: "R2", grupo: "Desarrollo", pm: "Luis", deadline: null, onTime: onTime("n/a") }),
    ];
    const projs = [
      proj({ id: "p1", boardId: "b1", boardName: "P1", grupo: "Launch", pm: "Otro", name: "Hito", deadline: null, entrega: "on-time",
        subitems: [sub({ id: "s1", name: "Sub", deadline: null, entrega: "late" }), sub({ id: "s2", name: "Sub2", deadline: null, entrega: null })] }),
      proj({ id: "p2", boardId: "b1", boardName: "P1", grupo: "Sin evaluar", pm: "Otro", name: "Pendiente", deadline: null, entrega: null }),
    ];
    const rows = buildEntregaRows(reqs, projs, [board({ id: "b1", pm: "Luis" })]);
    // La fase "Sin evaluar" no tiene nada Done todavía → no aparece.
    expect(rows.map((r) => r.id).sort()).toEqual(["b1::Launch", "r1"]);
  });

  it("agrupa steps + hitos de la fase; itemsAtrasados trae SOLO los atrasados y atribuye el PM del board", () => {
    const projs = [proj({ id: "p1", boardId: "b1", boardName: "P1", grupo: "Launch", pm: "ItemPm", name: "Step A", deadline: null, entrega: "late",
      subitems: [
        sub({ id: "s1", name: "Hito 1", deadline: null, entrega: "late" }),
        sub({ id: "s2", name: "Hito 2", deadline: null, entrega: "on-time" }),
      ] })];
    const rows = buildEntregaRows([], projs, [board({ id: "b1", pm: "BoardPm" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "b1::Launch", tipo: "PM", fase: "Launch", pm: "BoardPm", verdict: "late",
      totalEvaluados: 3, totalAtrasados: 2,
    });
    expect(rows[0].itemsAtrasados.map((it) => it.name).sort()).toEqual(["Hito 1", "Step A"]);
    expect(rows[0].itemsAtrasados.find((it) => it.kind === "hito")).toMatchObject({ name: "Hito 1", stepPadre: "Step A" });
  });

  it("separa el código y el nombre del proyecto desde el nombre del board", () => {
    const projs = [proj({ id: "p1", boardId: "b1", boardName: "PM-003 | DUCAfast 2.0 GT", grupo: "Launch", name: "Step A", deadline: null, entrega: "late" })];
    const rows = buildEntregaRows([], projs, [board({ id: "b1", pm: "BoardPm" })]);
    expect(rows[0]).toMatchObject({ projCode: "PM-003", projName: "DUCAfast 2.0 GT" });
  });

  it("los REQ no cuelgan de un proyecto: projCode y projName vacíos", () => {
    const reqs = [req({ id: "r1", name: "R1", grupo: "Desarrollo", pm: "Luis", deadline: null, onTime: onTime("late") })];
    const rows = buildEntregaRows(reqs, [], []);
    expect(rows[0]).toMatchObject({ tipo: "PML", projCode: "", projName: "" });
  });
});

describe("buildLateResponsibleRows / buildLateResponsibleRowsRaw (detalle de la tarjeta principal)", () => {
  const step = (o: Partial<ReturnType<typeof proj>>) => proj({ boardId: "b1", boardName: "P1", grupo: "Launch", ...o });

  it("una fase con atraso sin excusar aparece; el responsable es el de la FASE, no el de un item", () => {
    const projs = [step({ id: "p1", entrega: "late", subitems: [sub({ id: "s1", entrega: "on-time" })] })];
    const delays: DelayMap = { s1: { responsible: "VPA" } }; // asignado al item, NO a la fase → no excusa
    const rows = buildLateResponsibleRows([], projs, [board({ id: "b1", pm: "BoardPm" })], delays);
    expect(rows).toEqual([{ id: "b1::Launch", source: "Proyecto", name: "P1 · Launch", pm: "BoardPm", responsible: null, onTime: 1, doneTotal: 2 }]);
  });

  it("excusar la fase (clave projPhaseKey) hace que deje de aparecer, aunque tenga atrasos", () => {
    const projs = [step({ id: "p1", entrega: "late" })];
    const delays: DelayMap = { "b1::Launch": { responsible: "Sponsor" } };
    expect(buildLateResponsibleRows([], projs, [board({ id: "b1", pm: "BoardPm" })], delays)).toEqual([]);
  });

  it("Raw: una fase con atraso aparece aunque esté excusada — solo informativo", () => {
    const projs = [step({ id: "p1", entrega: "late" })];
    const delays: DelayMap = { "b1::Launch": { responsible: "Sponsor" } };
    const rows = buildLateResponsibleRowsRaw([], projs, [board({ id: "b1", pm: "BoardPm" })], delays);
    expect(rows).toEqual([{ id: "b1::Launch", source: "Proyecto", name: "P1 · Launch", pm: "BoardPm", responsible: "Sponsor", onTime: 0, doneTotal: 1 }]);
  });
});

describe("buildReprocesoRows (auditoría Calidad de Entregas)", () => {
  const CPM_INI = new Date(2026, 0, 1), CPM_FIN = new Date(2026, 0, 31);

  it("incluye REQ CERRADOS y items Done (cada uno su propia fila), con nota/verdict según responsable + recuperado", () => {
    const reqs = [req({ id: "r1", name: "R1", pm: "Luis", estado: "CERRADO", onTime: onTime("on-time") })];
    const projs = [
      proj({ id: "p1", name: "Step A", boardId: "b1", boardName: "P1", grupo: "Launch", pm: "Otro", status: "Done", startDate: CPM_INI, deadline: CPM_FIN }),
      proj({ id: "p2", name: "Step B", boardId: "b1", boardName: "P1", grupo: "Launch", pm: "Otro", status: "Done" }), // sin ventana CPM propia
    ];
    const rows = buildReprocesoRows(reqs, projs, [board({ id: "b1", pm: "Luis" })], { r1: { responsible: "VPA" }, p1: { responsible: "Sin reproceso" } });
    expect(rows).toHaveLength(3);
    const req1 = rows.find((r) => r.id === "r1")!;
    const stepA = rows.find((r) => r.id === "p1")!;
    const stepB = rows.find((r) => r.id === "p2")!;
    expect(req1.verdict).toBe("clean"); expect(req1.nota).toBe(100);         // excusado (VPA)
    expect(stepA.verdict).toBe("clean"); expect(stepA.nota).toBe(100);       // excusado + recuperado (ventana CPM propia, sin hitos)
    expect(stepB.verdict).toBe("reproceso"); expect(stepB.nota).toBe(0);     // sin excusar y sin ventana CPM → no recuperado
    expect(stepA.pm).toBe("Luis");            // PM del board, no del item
    expect(stepA.name).toBe("Step A");        // el entregable, no "<proyecto> · <fase>"
    expect(stepA.fase).toBe("Launch");
    expect(req1.unitKind).toBe("req");
    expect(stepA.unitKind).toBe("step");      // plantilla nueva: no hay "Desarrollo por iteraciones..." en la fase
  });

  it("un item recuperado pero sin excusar queda en nota 50 (reproceso); excusando el responsable llega a 100 (clean)", () => {
    const projs = [proj({ id: "p1", boardId: "b1", boardName: "P1", grupo: "Launch", status: "Done", startDate: CPM_INI, deadline: CPM_FIN })];
    const sinExcusar = buildReprocesoRows([], projs, [board({ id: "b1", pm: "Luis" })], {});
    expect(sinExcusar[0]).toMatchObject({ nota: 50, verdict: "reproceso" });
    const excusado = buildReprocesoRows([], projs, [board({ id: "b1", pm: "Luis" })], { p1: { responsible: "Sin reproceso" } });
    expect(excusado[0]).toMatchObject({ nota: 100, verdict: "clean" });
  });

  it("un item sin ninguna señal (no Done, sin hitos Done ni pendientes vencidos) no genera fila", () => {
    const projs = [proj({ id: "p1", boardId: "b1", boardName: "P1", grupo: "Launch", status: "Working on it" })];
    expect(buildReprocesoRows([], projs, [board({ id: "b1", pm: "Luis" })], {})).toEqual([]);
  });
});

describe("calcReprocesoCascade (diagnóstico de recuperación: hito atrasado vs. veredicto del step)", () => {
  const hito = (id: string, entrega: "on-time" | "late" | null) => sub({ id, name: id, deadline: null, entrega });

  it("sin hitos atrasados → recuperado: null (nada que diagnosticar), sin importar el veredicto del step", () => {
    const p = proj({ entrega: "on-time", subitems: [hito("h1", "on-time"), hito("h2", "on-time")] });
    expect(calcReprocesoCascade(p)).toMatchObject({ primerAtrasoIdx: null, recuperado: null });
  });

  it("hubo un hito atrasado pero el STEP cerró a tiempo (CPM) → PM se recuperó", () => {
    const p = proj({ entrega: "on-time", subitems: [hito("h1", "on-time"), hito("h2", "late"), hito("h3", "on-time")] });
    expect(calcReprocesoCascade(p)).toMatchObject({ primerAtrasoIdx: 1, recuperado: true });
  });

  it("hubo un hito atrasado y el STEP también terminó atrasado → no se recuperó", () => {
    const p = proj({ entrega: "late", subitems: [hito("h1", "on-time"), hito("h2", "late"), hito("h3", "late")] });
    expect(calcReprocesoCascade(p)).toMatchObject({ primerAtrasoIdx: 1, recuperado: false });
  });

  it("hubo un hito atrasado pero el step está Done sin fechas para verificar (entrega null) → no se recuperó (conservador)", () => {
    const p = proj({ entrega: null, subitems: [hito("h1", "late")] });
    expect(calcReprocesoCascade(p)).toMatchObject({ primerAtrasoIdx: 0, recuperado: false });
  });

  it("usa el primer hito atrasado (por índice) aunque el step se haya recuperado", () => {
    const p = proj({ entrega: "on-time", subitems: [hito("h1", "late"), hito("h2", "late"), hito("h3", "on-time")] });
    expect(calcReprocesoCascade(p)).toMatchObject({ primerAtrasoIdx: 0, recuperado: true });
  });
});

describe("calcItemCalidad (veredicto progresivo de un item — no exige que esté Done)", () => {
  const daysFromToday = (n: number): Date => {
    const d = today();
    d.setDate(d.getDate() + n);
    return d;
  };
  const CPM_INI = new Date(2026, 0, 1), CPM_FIN = new Date(2026, 0, 31);
  const hito = (id: string, deadline: Date | null, status = "Done") => sub({ id, name: id, deadline, status, entrega: null });

  it("con ventana CPM propia y todos los hitos dentro → recuperado: true", () => {
    const p = proj({ status: "Done", startDate: CPM_INI, deadline: CPM_FIN, subitems: [hito("h1", new Date(2026, 0, 15))] });
    expect(calcItemCalidad(p)).toMatchObject({ recuperado: true, qualifies: true, fueraDeCpm: [] });
  });

  it("un hito con Limit Date DESPUÉS del fin del CPM del item → no se recuperó, sin importar si ya cerró o sigue pendiente", () => {
    const cerrado = proj({ status: "Done", startDate: CPM_INI, deadline: CPM_FIN, subitems: [hito("h1", new Date(2026, 1, 5))] });
    const abierto = proj({ status: "Working on it", startDate: CPM_INI, deadline: CPM_FIN, subitems: [hito("h1", new Date(2026, 1, 5), "Working on it")] });
    expect(calcItemCalidad(cerrado).recuperado).toBe(false);
    expect(calcItemCalidad(abierto).recuperado).toBe(false);
    expect(calcItemCalidad(cerrado).fueraDeCpm.map((h) => h.id)).toEqual(["h1"]);
  });

  it("un hito con Limit Date ANTES del inicio del CPM del item NO cuenta como fuera — solo se verifica el fin", () => {
    // "Start Date" no es un arranque fijo del compromiso: se corre hacia adelante
    // conforme avanza el trabajo (confirmado con datos reales de Monday, a veces
    // incluso queda DESPUÉS del fin del CPM) — compararlo producía falsos positivos
    // con hitos que sí estaban dentro del CPM real. Por eso solo se verifica el fin.
    const p = proj({ status: "Done", startDate: CPM_INI, deadline: CPM_FIN, subitems: [hito("h1", new Date(2025, 11, 20))] });
    expect(calcItemCalidad(p)).toMatchObject({ recuperado: true, fueraDeCpm: [] });
  });

  it("sin \"Start Date\" propio (falta o no aplica) el item igual puede recuperarse — ya no se requiere para el chequeo", () => {
    const p = proj({ status: "Done", deadline: CPM_FIN, subitems: [hito("h1", new Date(2026, 0, 15))] });
    expect(calcItemCalidad(p).recuperado).toBe(true);
  });

  it("sin \"deadline\" propio (fin del CPM) no se puede verificar → recuperado: false, conservador", () => {
    expect(calcItemCalidad(proj({ status: "Done", startDate: CPM_INI })).recuperado).toBe(false);
  });

  it("un hito sin Limit Date no puede evaluarse como fuera de la ventana — no penaliza recuperado", () => {
    const p = proj({ status: "Done", startDate: CPM_INI, deadline: CPM_FIN, subitems: [hito("h1", null)] });
    expect(calcItemCalidad(p)).toMatchObject({ recuperado: true, fueraDeCpm: [] });
  });

  it("item sin subitems: recuperado es trivialmente true si tiene su propia ventana CPM (nada puede quedar fuera)", () => {
    expect(calcItemCalidad(proj({ status: "Done", startDate: CPM_INI, deadline: CPM_FIN })).recuperado).toBe(true);
  });

  it("qualifies: no Done, sin hitos Done y sin pendientes vencidos → false (nada que evaluar todavía)", () => {
    expect(calcItemCalidad(proj({ status: "Working on it", subitems: [] })).qualifies).toBe(false);
    const conFuturos = proj({ status: "Working on it", subitems: [hito("h1", null, "Future Steps")] });
    expect(calcItemCalidad(conFuturos).qualifies).toBe(false); // sin fecha → no cuenta como vencido
  });

  it("qualifies: no Done, con un hito pendiente YA vencido → true de inmediato, sin esperar a que cierre", () => {
    const p = proj({ status: "Working on it", subitems: [hito("h1", daysFromToday(-1), "Working on it")] });
    const c = calcItemCalidad(p);
    expect(c.qualifies).toBe(true);
    expect(c.pendingAtrasados.map((x) => x.id)).toEqual(["h1"]);
  });

  it("qualifies: no Done, con al menos un hito Done → true", () => {
    expect(calcItemCalidad(proj({ status: "Working on it", subitems: [hito("h1", null, "Done")] })).qualifies).toBe(true);
  });
});

describe("calcItemNota (nota 0/50/100: responsable + recuperado)", () => {
  const reproceso: DelayMap = { excusado: { responsible: "Sin reproceso" }, pm: { responsible: "PM" } };

  it("excusado + recuperado -> 100", () => {
    expect(calcItemNota("excusado", true, reproceso)).toBe(100);
  });
  it("excusado + no recuperado -> 50", () => {
    expect(calcItemNota("excusado", false, reproceso)).toBe(50);
  });
  it("no excusado + recuperado -> 50", () => {
    expect(calcItemNota("pm", true, reproceso)).toBe(50);
  });
  it("sin asignar + no recuperado -> 0", () => {
    expect(calcItemNota("sin-asignar", false, reproceso)).toBe(0);
  });
});

describe("calidadUnits (unidad = ITEM, no hito; ver calcItemCalidad para el veredicto)", () => {
  const CPM_INI = new Date(2026, 0, 1), CPM_FIN = new Date(2026, 0, 31);
  const hito = (id: string, deadline: Date | null = null, status = "Done") => sub({ id, name: id, deadline, status, entrega: null });

  it("si existe \"Desarrollo por iteraciones...\" en la fase, la unidad es ESE STEP — los demás steps no aportan nada", () => {
    const projs = [
      proj({ id: "analisis", name: "Analisis técnico / Fechas estimadas de desarrollo (Costo DEV)", boardId: "b1", grupo: "Launch | Desarrollo", status: "Done" }),
      proj({ id: "vg", name: "Value Gate (BC) Firmado y aprobado", boardId: "b1", grupo: "Launch | Desarrollo", status: "Done" }),
      proj({ id: "desarrollo", name: "Desarrollo por iteraciones (Hitos) / Entrega CKU", boardId: "b1", grupo: "Launch | Desarrollo", status: "Done",
        subitems: [hito("h1"), hito("h2")] }),
    ];
    const units = calidadUnits(projs);
    // ni "analisis" ni "vg" aportan unidad, aunque estén Done
    expect(units.map((u) => u.id)).toEqual(["desarrollo"]);
    expect(units[0].kind).toBe("step");
  });

  it("recuperado del step \"Desarrollo por iteraciones...\" viene de su propia ventana CPM (variante plural \"Entregas CKU\" también matchea)", () => {
    const recuperado = proj({ id: "d1", name: "Desarrollo por iteraciones (Hitos) / Entrega CKU", boardId: "b1", grupo: "Launch",
      status: "Done", startDate: CPM_INI, deadline: CPM_FIN, subitems: [hito("h1", CPM_INI)] });
    const noRecuperado = proj({ id: "d2", name: "Desarrollo por iteraciones (Hitos) / Entregas CKU", boardId: "b2", grupo: "Launch",
      status: "Done", startDate: CPM_INI, deadline: CPM_FIN, subitems: [hito("h1", new Date(2026, 1, 5))] });
    expect(calidadUnits([recuperado])[0]).toMatchObject({ id: "d1", recuperado: true });
    expect(calidadUnits([noRecuperado])[0]).toMatchObject({ id: "d2", recuperado: false });
  });

  it("plantilla nueva, item sin subitems: solo genera unidad si está Done (fallback, caso raro)", () => {
    const abierto = proj({ id: "poc", name: "POC", boardId: "b1", grupo: "Launch | Lanzamiento", status: "Working on it" });
    const cerrado = proj({ id: "xd", name: "xDocking", boardId: "b2", grupo: "Launch | Lanzamiento", status: "Done" });
    expect(calidadUnits([abierto])).toEqual([]);
    expect(calidadUnits([cerrado])).toEqual([expect.objectContaining({ id: "xd", kind: "step" })]);
  });

  it("plantilla nueva: cada step de la fase mide por SUS PROPIOS hitos — progresivo, no espera a que cierre, independiente de los demás steps", () => {
    const projs = [
      proj({ id: "poc", name: "POC", boardId: "b1", grupo: "Launch", status: "Working on it", startDate: CPM_INI, deadline: CPM_FIN, subitems: [hito("h1", CPM_INI)] }),
      proj({ id: "xd", name: "xDocking", boardId: "b1", grupo: "Launch", status: "Working on it", startDate: CPM_INI, deadline: CPM_FIN, subitems: [hito("h2", new Date(2026, 1, 5))] }),
    ];
    const units = calidadUnits(projs);
    expect(units.map((u) => u.id).sort()).toEqual(["poc", "xd"]);
    expect(units.find((u) => u.id === "poc")).toMatchObject({ recuperado: true });
    expect(units.find((u) => u.id === "xd")).toMatchObject({ recuperado: false }); // h2 quedó fuera de la ventana CPM de xd
  });

  it("agrupa por proyecto (board+fase): dos boards distintos no se mezclan aunque compartan nombre de fase", () => {
    const projs = [
      proj({ id: "d1", name: "Desarrollo por iteraciones (Hitos) / Entrega CKU", boardId: "b1", grupo: "Launch",
        status: "Done", subitems: [hito("h1")] }),
      proj({ id: "poc2", name: "POC", boardId: "b2", grupo: "Launch", status: "Done" }),
    ];
    const units = calidadUnits(projs);
    expect(units.map((u) => u.id).sort()).toEqual(["d1", "poc2"]);
  });
});

describe("calidadProjectStatus (trayectoria de Calidad por proyecto: Done + pendiente, a día de hoy)", () => {
  const daysFromToday = (n: number): Date => {
    const d = today();
    d.setDate(d.getDate() + n);
    return d;
  };
  const hito = (id: string, o: Partial<ProjSubitem> = {}) => sub({ id, name: id, deadline: null, entrega: null, status: "Working on it", ...o });

  it("sin nada Done y sin nada pendiente vencido → sin-atrasos", () => {
    const projs = [
      proj({ id: "poc", name: "POC", boardId: "b1", grupo: "Launch", status: "Working on it",
        subitems: [hito("h1", { deadline: daysFromToday(5) })] }),
    ];
    const [status] = calidadProjectStatus(projs);
    expect(status).toMatchObject({ doneTotal: 0, doneLate: 0, pendingTotal: 1, trayectoria: "sin-atrasos" });
  });

  it("hubo un Done atrasado pero lo pendiente sigue dentro de su CPM → recuperado", () => {
    const projs = [
      proj({ id: "poc", name: "POC", boardId: "b1", grupo: "Launch", status: "Working on it",
        subitems: [
          hito("h1", { status: "Done", entrega: "late", deadline: daysFromToday(-10) }),
          hito("h2", { deadline: daysFromToday(5) }),
        ] }),
    ];
    const [status] = calidadProjectStatus(projs);
    expect(status).toMatchObject({ doneTotal: 1, doneLate: 1, pendingTotal: 1, trayectoria: "recuperado" });
  });

  it("hay un pendiente ya vencido (aún no Done) → atrasado, sin importar el historial", () => {
    const projs = [
      proj({ id: "poc", name: "POC", boardId: "b1", grupo: "Launch", status: "Working on it",
        subitems: [hito("h1", { deadline: daysFromToday(-3) })] }),
    ];
    const [status] = calidadProjectStatus(projs);
    expect(status.trayectoria).toBe("atrasado");
    expect(status.pendingAtrasados.map((p) => p.id)).toEqual(["h1"]);
  });

  it("un pendiente SIN deadline (Future Steps al fondo del pipeline, aún sin CPM) NO cuenta como vencido", () => {
    const projs = [
      proj({ id: "poc", name: "POC", boardId: "b1", grupo: "Launch", status: "Working on it",
        subitems: [hito("h1", { deadline: null, status: "Future Steps" })] }),
    ];
    const status = calidadProjectStatus(projs)[0];
    expect(status.trayectoria).toBe("sin-atrasos");
    expect(status.pendingTotal).toBe(1);
    expect(status.pendingAtrasados).toEqual([]);
  });

  it("un proyecto sin nada Done ni pendiente en Fase 3 no aparece en el resultado", () => {
    const projs = [proj({ id: "poc", name: "POC", boardId: "b1", grupo: "Otra fase", status: "Working on it" })];
    expect(calidadProjectStatus(projs)).toEqual([]);
  });

  it("plantilla vieja: solo lo pendiente del step \"Desarrollo por iteraciones...\" cuenta — un checkpoint vencido en OTRO step no afecta la trayectoria", () => {
    const projs = [
      proj({ id: "analisis", name: "Analisis técnico", boardId: "b1", grupo: "Launch | Desarrollo", status: "Working on it", deadline: daysFromToday(-30) }),
      proj({ id: "desarrollo", name: "Desarrollo por iteraciones (Hitos) / Entrega CKU", boardId: "b1", grupo: "Launch | Desarrollo", status: "Working on it",
        subitems: [hito("h1", { deadline: daysFromToday(5) })] }),
    ];
    const [status] = calidadProjectStatus(projs);
    expect(status.trayectoria).toBe("sin-atrasos"); // "analisis" vencido no cuenta: no es el step que mide Calidad
    expect(status.pendingTotal).toBe(1);
  });

  it("plantilla nueva: varios steps en progreso, cada uno con sus propios hitos pendientes — solo cuenta el vencido (caso PM-011 ROAD NEW)", () => {
    const projs = [
      proj({ id: "poc", name: "POC", boardId: "b1", grupo: "Launch", status: "Working on it",
        subitems: [hito("h1", { status: "Done", entrega: "on-time", deadline: daysFromToday(-5) }), hito("h2", { deadline: daysFromToday(-1) })] }),
      proj({ id: "xd", name: "xDocking", boardId: "b1", grupo: "Launch", status: "Working on it",
        subitems: [hito("h3", { deadline: daysFromToday(10) })] }),
    ];
    const [status] = calidadProjectStatus(projs);
    expect(status.doneTotal).toBe(1);
    expect(status.pendingTotal).toBe(2);
    expect(status.pendingAtrasados.map((p) => p.id)).toEqual(["h2"]);
    expect(status.trayectoria).toBe("atrasado");
  });

  // Caso real que expuso la inconsistencia (PM-007 VOLT): un hito reprogramado más
  // allá del CPM de su item, pero con Limit Date TODAVÍA en el futuro (no vencido
  // hoy) — antes esto no afectaba la trayectoria (solo miraba "vencido hoy") y el
  // header mostraba "↩ PM recuperado" mientras la nota del item ya marcaba
  // recuperado=false. Ahora usa la MISMA señal (hitosFueraDeCpm) que la nota.
  it("un Done llegó tarde en el pasado, nada vencido hoy, pero un hito quedó fuera del CPM del item → sigue atrasado, NO recuperado", () => {
    const projs = [
      proj({ id: "desarrollo", name: "Desarrollo por iteraciones", boardId: "b1", grupo: "Launch", status: "Working on it",
        deadline: daysFromToday(-5), // fin del CPM del item ya pasó
        subitems: [
          hito("h1", { status: "Done", entrega: "late", deadline: daysFromToday(-40) }),
          hito("h2", { deadline: daysFromToday(20) }), // futuro (no vencido hoy) pero después del fin del CPM
        ] }),
    ];
    const [status] = calidadProjectStatus(projs);
    expect(status.pendingAtrasados).toEqual([]); // nada vencido hoy
    expect(status.fueraDeCpm.map((p) => p.id)).toEqual(["h2"]);
    expect(status.trayectoria).toBe("atrasado");
  });

  it("un hito fuera del CPM de su item, sin historial de atrasos Done → también atrasado (no 'sin-atrasos')", () => {
    const projs = [
      proj({ id: "poc", name: "POC", boardId: "b1", grupo: "Launch", status: "Working on it",
        deadline: daysFromToday(-1),
        subitems: [hito("h1", { deadline: daysFromToday(15) })] }),
    ];
    const [status] = calidadProjectStatus(projs);
    expect(status.doneLate).toBe(0);
    expect(status.fueraDeCpm.map((p) => p.id)).toEqual(["h1"]);
    expect(status.trayectoria).toBe("atrasado");
  });

  it("recuperado de verdad: hubo un Done atrasado, nada vencido hoy, y ningún hito quedó fuera del CPM del item", () => {
    const projs = [
      proj({ id: "desarrollo", name: "Desarrollo por iteraciones", boardId: "b1", grupo: "Launch", status: "Working on it",
        deadline: daysFromToday(30),
        subitems: [
          hito("h1", { status: "Done", entrega: "late", deadline: daysFromToday(-40) }),
          hito("h2", { deadline: daysFromToday(20) }), // futuro, dentro del CPM del item
        ] }),
    ];
    const [status] = calidadProjectStatus(projs);
    expect(status.fueraDeCpm).toEqual([]);
    expect(status.trayectoria).toBe("recuperado");
  });
});

describe("calcPmMetrics", () => {
  it("Reproceso (5º componente): PM y sin asignar penalizan, ≠PM excusa; afecta el KPI", () => {
    const reqs = [
      req({ id: "r1", pm: "Luis", estado: "CERRADO", onTime: onTime("n/a") }),
      req({ id: "r2", pm: "Luis", estado: "CERRADO", onTime: onTime("n/a") }),
    ];
    const run = (reproceso: DelayMap) => calcPmMetrics("Luis", [], reqs, [], [], new Map(), new Map(), [], {}, reproceso);
    expect(run({}).reprocesoPct).toBe(0);                                                            // ambos sin asignar → penalizan
    expect(run({ r1: { responsible: "VPA" }, r2: { responsible: "CKU" } }).reprocesoPct).toBe(100);  // ambos excusados
    const half = run({ r1: { responsible: "VPA" } });                                                // r1 excusado, r2 sin asignar
    expect(half.reprocesoPct).toBe(50);
    expect(run({}).kpi.score).toBeLessThan(half.kpi.score);                                          // más reprocesos → menor KPI
  });

  it("un atraso baja el % del PM por defecto; solo se excusa asignando la FASE completa, no un item suelto", () => {
    const projBoards = [board({ id: "b1", pm: "Luis" })];
    // p1 y p2 comparten fase (b1::Launch): un atraso en cualquiera de sus hitos
    // basta para que la fase entera cuente "con atraso" (binario, por fase).
    const projItems = [
      proj({ boardId: "b1", id: "p1", status: "Done", estado: "EN TIEMPO", name: "x", grupo: "Launch", cost: 0, benefit: 0,
        subitems: [sub({ id: "i1", pmsId: "H1", entrega: "on-time" })] }),
      proj({ boardId: "b1", id: "p2", status: "Done", estado: "ATRASADO", name: "y", grupo: "Launch", cost: 0, benefit: 0,
        subitems: [sub({ id: "i2", pmsId: "H2", entrega: "late" })] }),
    ];
    const bhm = buildBoardHealthMap(projItems, projBoards, {});
    const run = (delays: DelayMap) => calcPmMetrics("Luis", [], [], projItems, projBoards, bhm, new Map(), [], delays);
    expect(run({}).entPct).toBe(0);                                              // sin asignar → la fase cuenta con atraso
    expect(run({ "b1::Launch": { responsible: "PM" } }).entPct).toBe(0);         // PM → sigue contando
    expect(run({ i2: { responsible: "Sponsor" } }).entPct).toBe(0);              // asignado al ITEM, no a la fase → no excusa
    expect(run({ "b1::Launch": { responsible: "Sponsor" } }).entPct).toBe(100);  // excusa la FASE → libera el atraso
  });

  it("compone las métricas del PM (entregas, salud, KPI) de forma coherente", () => {
    const projBoards = [board({ id: "b1", pm: "Luis", benefitType: "HardSaving" })];
    const projItems = [
      proj({ boardId: "b1", boardName: "P1", status: "Done", estado: "EN TIEMPO", name: "x", grupo: "Launch", cost: 100, benefit: 500,
        subitems: [sub({ id: "s1", pmsId: "H1", entrega: "on-time" })] }),
    ];
    const bhm = buildBoardHealthMap(projItems, projBoards, {});
    const m = calcPmMetrics("Luis", [], [], projItems, projBoards, bhm, new Map(), []);
    expect(m.pm).toBe("Luis");
    expect(m.entOn).toBe(1);
    expect(m.entPct).toBe(100);
    expect(m.health).toBe("on-track");
    expect(m.kpi.components).toHaveLength(5);
    expect(m.kpiPct).toBe(Math.round(m.kpi.score));
  });
});
