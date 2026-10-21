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
  iniEntregaVerdict,
  calcReprocesoPct,
  calcReprocesoStats,
  calcReprocesoStatsRaw,
  iniUnidadesCalidad,
  calcReprocesoCascade,
  calidadUnits,
  calcItemCalidad,
  calcItemNota,
  calidadProjectStatus,
  buildEntregaRows,
  buildLateResponsibleRows,
  buildLateResponsibleRowsRaw,
  buildReprocesoRows,
  buildReprocesoRowsRaw,
  calcConfirmacionRoi,
  calcConfirmacionRoiDetalle,
  confirmacionRoiPorPm,
  type ConfirmacionRoiPm,
} from "./dashboard";
import { today } from "./business";
import { metodologiaKey, mesDe } from "./metodologia";
import type { BoardHealthData } from "./proj";
import type { DelayMap } from "./delay";
import { construirExpedientes, ahorroDucafast, TARIFA_HORA_DEFECTO, ETAPA_KEYS } from "./tramites";
import { construirRegistros, costoClonacionPorOrigen, TARIFA_CLONACION_DEFECTO } from "./clonaciones";
import type { IniItem, ProjBoard, ProjItem, ProjSubitem, ReqItem, RoiRow, ClonacionRow } from "@/types";

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

  it("Aprobación: CFO + un gate firmado Done (los dos gates); monto = Business Case (Kick Off)", () => {
    const items = [
      bc(10, 100),
      cfo("Done"),
      vg("Aprobación | Value Gate", "Done"),
      vg("Launch | Desarrollo", "Done"),
    ];
    expect(resolveProjStage(items)).toEqual({ stage: "aprobacion", cost: 10, benefit: 100 });
  });

  it("Aprobación: basta el gate de Aprobación Done aunque el de Launch siga en curso", () => {
    const items = [
      bc(10, 100),
      cfo("Done"),
      vg("Aprobación | Value Gate", "Done"),
      vg("Launch | Desarrollo", "Working on it"),
      val("Done"),
    ];
    expect(resolveProjStage(items)).toEqual({ stage: "aprobacion", cost: 10, benefit: 100 });
  });

  it("Aprobación: basta el gate de Launch Done (\"actualizado y firmado\") aunque no haya gate en Aprobación", () => {
    const items = [
      bc(10, 100),
      cfo("Done"),
      vg("Launch | Desarrollo", "Done", "Value Gate (BC) Actualizado y firmado (Sponsor+VPA+PMO Mgr)"),
    ];
    expect(resolveProjStage(items)).toEqual({ stage: "aprobacion", cost: 10, benefit: 100 });
  });

  it("Aprobación: sin el CFO Done no cuenta aunque los dos gates estén Done (cae a Validación)", () => {
    const items = [
      bc(1, 1),
      cfo("Working on it"),
      vg("Aprobación | Value Gate", "Done"),
      vg("Launch | Desarrollo", "Done"),
      val("Done"),
    ];
    expect(resolveProjStage(items)).toEqual({ stage: "validacion", cost: 1, benefit: 1 });
  });

  it("Aprobación: CFO Done pero ningún gate firmado → no cuenta (cae a Validación)", () => {
    const items = [bc(1, 1), cfo("Done"), val("Done")];
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

// Plantilla "NEW" de boards de Proyectos (PM-010/011/012 — ver proj.ts): mismos hitos,
// texto distinto. Sin un segundo Value Gate en Launch (un solo step "VPA APROBADO" cierra
// Aprobación). Nombres tomados 1:1 de un board real (PM-011 | ROAD NEW🚛).
describe("resolveProjStage (plantilla NEW: PM-010/011/012)", () => {
  const bc = (cost = 0, benefit = 0): ProjItem =>
    proj({ grupo: "Valuación | Formulación del proyecto", name: "Kick Off Project Meeting (Entregable Business Case redactado)", status: "Done", cost, benefit });
  const valNew = (status: string): ProjItem =>
    proj({ grupo: "Valuación | Formulación del proyecto", name: "VPA VALIDADO (Entregable Business Case validado por VPA)", status, cost: 0, benefit: 0 });
  const cfo = (status: string): ProjItem =>
    proj({ grupo: "Aprobación | Value Gate", name: "Plan de beneficios acordados con CFO", status, cost: 0, benefit: 0 });
  const vgAprobNew = (status: string): ProjItem =>
    proj({ grupo: "Aprobación | Value Gate", name: "VPA APROBADO (Entregable Business Case validado por Sponsor+VPA+PMO Mgr)", status, cost: 0, benefit: 0 });
  const roiNew = (dias: 30 | 60 | 90, status: string, cost = 0, benefit = 0): ProjItem =>
    proj({ grupo: "Revisión | Cierre ROI", name: `VPA CONFIRMADO a ${dias} dias (Compara Valor real contra BC)`, status, cost, benefit });

  it("Validación con el texto 'VPA VALIDADO' (sin 'valida Business Case')", () => {
    expect(resolveProjStage([bc(10, 100), valNew("Done")])).toEqual({ stage: "validacion", cost: 10, benefit: 100 });
  });

  it("Aprobación: CFO + VPA APROBADO Done, SIN un segundo gate en Launch", () => {
    const items = [bc(10, 100), cfo("Done"), vgAprobNew("Done")];
    expect(resolveProjStage(items)).toEqual({ stage: "aprobacion", cost: 10, benefit: 100 });
  });

  it("Aprobación: si VPA APROBADO no está Done, cae a Validación", () => {
    const items = [bc(1, 1), cfo("Done"), vgAprobNew("Working on it"), valNew("Done")];
    expect(resolveProjStage(items)).toEqual({ stage: "validacion", cost: 1, benefit: 1 });
  });

  it("Confirmación con el texto 'VPA CONFIRMADO a N dias'", () => {
    expect(resolveProjStage([roiNew(30, "Working on it", 1, 100)])).toEqual({ stage: "confirmacion", cost: 1, benefit: 100 });
    expect(resolveProjStage([roiNew(30, "Done", 1, 100), roiNew(60, "Done", 2, 200)])).toEqual({ stage: "confirmacion", cost: 2, benefit: 200 });
  });

  it("caso real (PM-011 | ROAD NEW🚛): Validación y Aprobación Done, Confirmación aún en Future Steps → cae en Aprobación (antes daba null)", () => {
    const items = [
      bc(27, 360000),
      valNew("Done"),
      cfo("Done"),
      vgAprobNew("Done"),
      roiNew(30, "Future steps"), roiNew(60, "Future steps"), roiNew(90, "Future steps"),
    ];
    expect(resolveProjStage(items)).toEqual({ stage: "aprobacion", cost: 27, benefit: 360000 });
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

describe("iniEntregaVerdict (Cumplimiento de Entrega retrospectivo de Iniciativas APROBADAS)", () => {
  // 05-ene-2026 (lunes). Meeting 1 a tiempo = hasta 5 días hábiles después (12-ene,
  // también lunes). Meeting 2 a tiempo = hasta 10 días hábiles después de Meeting 1
  // (26-ene, lunes).
  const creacion = new Date(2026, 0, 5);
  const ini = (o: Partial<IniItem>): IniItem => ({ estado: "APROBADA", creacion, ...o }) as IniItem;

  it("no APROBADA → n/a, sin importar las fechas", () => {
    expect(iniEntregaVerdict(ini({ estado: "EN TIEMPO", meet1: "2026-01-12", meet2: "2026-01-26" }))).toBe("n/a");
  });

  it("APROBADA sin creación, Meeting 1 o Meeting 2 → n/a (no se puede reconstruir)", () => {
    expect(iniEntregaVerdict(ini({ creacion: null, meet1: "2026-01-12", meet2: "2026-01-26" }))).toBe("n/a");
    expect(iniEntregaVerdict(ini({ meet2: "2026-01-26" }))).toBe("n/a"); // sin meet1
    expect(iniEntregaVerdict(ini({ meet1: "2026-01-12" }))).toBe("n/a"); // sin meet2
  });

  it("ambas etapas dentro de su límite (5 y 10 días hábiles) → on-time", () => {
    expect(iniEntregaVerdict(ini({ meet1: "2026-01-12", meet2: "2026-01-26" }))).toBe("on-time");
  });

  it("Meeting 1 se pasó de 5 días hábiles → late, aunque Meeting 2 esté a tiempo", () => {
    expect(iniEntregaVerdict(ini({ meet1: "2026-01-13", meet2: "2026-01-26" }))).toBe("late");
  });

  it("Meeting 2 se pasó de 10 días hábiles desde Meeting 1 → late, aunque Meeting 1 esté a tiempo", () => {
    expect(iniEntregaVerdict(ini({ meet1: "2026-01-12", meet2: "2026-01-27" }))).toBe("late");
  });
});

describe("calcEntregaStats / calcEntregaStatsRaw con Iniciativas APROBADAS", () => {
  const creacion = new Date(2026, 0, 5);
  const iniOnTime = (o: Partial<IniItem>): IniItem =>
    ({ estado: "APROBADA", creacion, meet1: "2026-01-12", meet2: "2026-01-26", pm: "Luis", ...o }) as IniItem;
  const iniLate = (o: Partial<IniItem>): IniItem =>
    ({ estado: "APROBADA", creacion, meet1: "2026-01-13", meet2: "2026-01-26", pm: "Luis", ...o }) as IniItem;

  it("calcEntregaStats: suma las Iniciativas APROBADAS evaluables a REQ/Proyecto, y excusa igual que un REQ", () => {
    const inis = [iniOnTime({ id: "i1" }), iniLate({ id: "i2" })];
    expect(calcEntregaStats([], [], {}, inis)).toEqual({ total: 2, onTime: 1, late: 1, pct: 50 });
    const delays: DelayMap = { i2: { responsible: "VPA" } }; // excusa i2
    expect(calcEntregaStats([], [], delays, inis)).toEqual({ total: 1, onTime: 1, late: 0, pct: 100 });
  });

  it("una Iniciativa activa (no APROBADA) o sin fechas suficientes no cuenta (n/a)", () => {
    const inis = [iniOnTime({ id: "i1", estado: "EN TIEMPO" }), iniOnTime({ id: "i2", meet2: undefined })];
    expect(calcEntregaStats([], [], {}, inis)).toEqual({ total: 0, onTime: 0, late: 0, pct: null });
  });

  it("calcEntregaStatsRaw: cuenta la Iniciativa atrasada sin excusar (no recibe delays)", () => {
    const inis = [iniOnTime({ id: "i1" }), iniLate({ id: "i2" })];
    expect(calcEntregaStatsRaw([], [], inis)).toEqual({ total: 2, onTime: 1, late: 1, pct: 50 });
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

  it("incluye una fila por Iniciativa APROBADA evaluable (tipo INI, sin proyecto); las n/a no aparecen", () => {
    const creacion = new Date(2026, 0, 5);
    const i = (o: Partial<IniItem>): IniItem => ({ estado: "APROBADA", creacion, pm: "Luis", grupo: "G", name: "Ini 1", ...o }) as IniItem;
    const inis = [
      i({ id: "i1", meet1: "2026-01-12", meet2: "2026-01-26" }), // on-time
      i({ id: "i2", estado: "EN TIEMPO" }),                      // n/a (no aprobada)
    ];
    const rows = buildEntregaRows([], [], [], inis);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "i1", source: "Iniciativa", tipo: "INI", verdict: "on-time", pm: "Luis", projCode: "", projName: "" });
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

  it("una Iniciativa APROBADA atrasada aparece; se excusa igual que un REQ (Raw la muestra siempre)", () => {
    const creacion = new Date(2026, 0, 5);
    const i = (o: Partial<IniItem>): IniItem => ({ estado: "APROBADA", creacion, pm: "Luis", name: "Ini 1", meet1: "2026-01-13", meet2: "2026-01-26", ...o }) as IniItem; // meet1 atrasado
    expect(buildLateResponsibleRows([], [], [], {}, [i({ id: "i1" })]))
      .toEqual([{ id: "i1", source: "Iniciativa", name: "Ini 1", pm: "Luis", responsible: null }]);
    const delays: DelayMap = { i1: { responsible: "VPA" } };
    expect(buildLateResponsibleRows([], [], [], delays, [i({ id: "i1" })])).toEqual([]); // excusada → no aparece
    expect(buildLateResponsibleRowsRaw([], [], [], delays, [i({ id: "i1" })]))
      .toEqual([{ id: "i1", source: "Iniciativa", name: "Ini 1", pm: "Luis", responsible: "VPA" }]);
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

  it("allDone: REQ siempre true (ya está CERRADO); Proyecto sigue a calcItemCalidad (habilita calificar el responsable)", () => {
    const reqs = [req({ id: "r1", name: "R1", pm: "Luis", estado: "CERRADO", onTime: onTime("on-time") })];
    const projs = [
      proj({ id: "p1", boardId: "b1", boardName: "P1", grupo: "Launch", status: "Done", deadline: CPM_FIN }), // sin subitems, Done → allDone true
      proj({ id: "p2", boardId: "b1", boardName: "P1", grupo: "Launch", status: "Working on it", deadline: CPM_FIN,
        subitems: [
          sub({ id: "h1", name: "h1", deadline: null, status: "Done", entrega: null }),      // qualifies (al menos un hito Done)
          sub({ id: "h2", name: "h2", deadline: null, status: "Working on it", entrega: null }), // pero NO todos Done
        ] }),
    ];
    const rows = buildReprocesoRows(reqs, projs, [board({ id: "b1", pm: "Luis" })], {});
    expect(rows.find((r) => r.id === "r1")).toMatchObject({ allDone: true });
    expect(rows.find((r) => r.id === "p1")).toMatchObject({ allDone: true });
    expect(rows.find((r) => r.id === "p2")).toMatchObject({ allDone: false });
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

  // allDone habilita la calificación del responsable (el otro 50% de la nota) en la
  // UI — solo cuando el item ya cerró del todo, porque antes "recuperado" todavía
  // puede cambiar (ver reprocesoResponsibleCell en calidad-cumplimiento/page.tsx).
  describe("allDone (habilita calificar el responsable — item ya cerró del todo)", () => {
    it("todos los hitos Done → true, sin importar el status del item padre", () => {
      const p = proj({ status: "Working on it", deadline: CPM_FIN, subitems: [hito("h1", null, "Done"), hito("h2", null, "Done")] });
      expect(calcItemCalidad(p).allDone).toBe(true);
    });

    it("al menos un hito NO Done (aunque esté dentro del CPM) → false", () => {
      const p = proj({ status: "Working on it", deadline: CPM_FIN,
        subitems: [hito("h1", null, "Done"), hito("h2", new Date(2026, 0, 20), "Working on it")] });
      expect(calcItemCalidad(p).allDone).toBe(false);
    });

    it("sin subitems: allDone sigue el status del item mismo", () => {
      expect(calcItemCalidad(proj({ status: "Done" })).allDone).toBe(true);
      expect(calcItemCalidad(proj({ status: "Working on it" })).allDone).toBe(false);
    });

    it("un hito ya fuera de CPM pero aún no Done → allDone false (aunque recuperado ya sea false)", () => {
      const p = proj({ status: "Working on it", deadline: CPM_FIN,
        subitems: [hito("h1", new Date(2026, 1, 5), "Working on it")] });
      const c = calcItemCalidad(p);
      expect(c.recuperado).toBe(false);
      expect(c.allDone).toBe(false);
    });
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

  it("propaga allDone desde calcItemCalidad (habilita calificar el responsable en la UI)", () => {
    const cerrado = proj({ id: "d1", name: "Desarrollo por iteraciones (Hitos)", boardId: "b1", grupo: "Launch",
      status: "Done", deadline: CPM_FIN, subitems: [hito("h1", CPM_INI, "Done")] });
    const enCurso = proj({ id: "d2", name: "Desarrollo por iteraciones (Hitos)", boardId: "b2", grupo: "Launch",
      status: "Working on it", deadline: CPM_FIN, subitems: [hito("h1", CPM_INI, "Done"), hito("h2", CPM_INI, "Working on it")] });
    expect(calidadUnits([cerrado])[0]).toMatchObject({ id: "d1", allDone: true });
    expect(calidadUnits([enCurso])[0]).toMatchObject({ id: "d2", allDone: false });
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

describe("Calidad de Entregas con Iniciativas (aprobadas, nota binaria como un PML cerrado)", () => {
  const ini = (o: Partial<IniItem>): IniItem => ({ grupo: "G", status: "PM Aprobado", estado: "APROBADA", pm: "Luis", ...o }) as IniItem;
  const aprobadas = [ini({ id: "INI-1", name: "Uno" }), ini({ id: "INI-2", name: "Dos" })];

  it("solo cuentan las APROBADAS (PM / PML Aprobado) y con id; el resto del embudo no mide Calidad", () => {
    const resto = [
      ini({ id: "INI-3", estado: "EN TIEMPO", status: "New" }), ini({ id: "INI-4", estado: "POR_DEFINIR", status: "Meeting 2" }),
      ini({ id: "INI-5", estado: "EN_ESPERA", status: "Sin Valor Def" }), ini({ id: "", name: "sin id" }),
    ];
    expect(iniUnidadesCalidad([...aprobadas, ...resto]).map((i) => i.id)).toEqual(["INI-1", "INI-2"]);
    expect(calcReprocesoStats([], [], {}, resto).total).toBe(0);
    expect(calcReprocesoPct([], [], {}, resto)).toBeNull();
  });

  it("sin asignar y PM penalizan; un responsable ≠ PM o \"Sin reproceso\" excusa (como un PML cerrado)", () => {
    expect(calcReprocesoPct([], [], {}, aprobadas)).toBe(0);
    expect(calcReprocesoPct([], [], { "INI-1": { responsible: "PM" }, "INI-2": { responsible: "PM" } }, aprobadas)).toBe(0);
    expect(calcReprocesoPct([], [], { "INI-1": { responsible: "Sin reproceso" } }, aprobadas)).toBe(50);
    expect(calcReprocesoPct([], [], { "INI-1": { responsible: "Sponsor" }, "INI-2": { responsible: "VPA" } }, aprobadas)).toBe(100);
  });

  it("se promedian junto con los PML cerrados", () => {
    const reqs = [req({ id: "R1", pm: "Luis", estado: "CERRADO" })];
    // 1 PML excusado (100) + 2 iniciativas: una excusada (100) y una sin asignar (0) → 200/3
    const m = { R1: { responsible: "VPA" as const }, "INI-1": { responsible: "Sin reproceso" as const } };
    expect(calcReprocesoStats(reqs, [], m, aprobadas)).toMatchObject({ total: 3, limpias: 2, conReproceso: 1, pct: 67 });
  });

  it("calcReprocesoStatsRaw solo cuenta las iniciativas con selección hecha", () => {
    const raw = calcReprocesoStatsRaw([], [], { "INI-1": { responsible: "Sin reproceso" } }, aprobadas);
    expect(raw).toMatchObject({ total: 1, limpias: 1, conReproceso: 0, pct: 100 });
  });

  it("buildReprocesoRows lista la iniciativa como unidad INI, siempre calificable", () => {
    const rows = buildReprocesoRows([], [], [], { "INI-1": { responsible: "PM" } }, aprobadas);
    expect(rows.map((r) => [r.id, r.source, r.tipo, r.unitKind, r.verdict, r.allDone])).toEqual([
      ["INI-1", "Iniciativa", "INI", "ini", "reproceso", true],
      ["INI-2", "Iniciativa", "INI", "ini", "reproceso", true],
    ]);
    const limpia = buildReprocesoRows([], [], [], { "INI-1": { responsible: "VPA" } }, aprobadas)[0];
    expect(limpia).toMatchObject({ verdict: "clean", nota: 100, pm: "Luis" });
  });

  it("buildReprocesoRowsRaw lista solo las iniciativas con responsable elegido", () => {
    const rows = buildReprocesoRowsRaw([], [], [], { "INI-2": { responsible: "PM" } }, aprobadas);
    expect(rows).toEqual([{ id: "INI-2", source: "Iniciativa", name: "Dos", pm: "Luis", responsible: "PM", projCode: "" }]);
  });

  it("calcPmMetrics suma solo las iniciativas de ESE PM al % de Calidad de su KPI", () => {
    const todas = [...aprobadas, ini({ id: "INI-9", pm: "Otro" })];
    const sinNada = calcPmMetrics("Luis", todas, [], [], [], new Map(), new Map(), []);
    expect(sinNada.reprocesoPct).toBe(0); // 2 iniciativas de Luis sin asignar
    const m = { "INI-1": { responsible: "VPA" as const }, "INI-2": { responsible: "VPA" as const } };
    const conTodo = calcPmMetrics("Luis", todas, [], [], [], new Map(), new Map(), [], {}, m);
    expect(conTodo.reprocesoPct).toBe(100);
    const otro = calcPmMetrics("Otro", todas, [], [], [], new Map(), new Map(), []);
    expect(otro.reprocesoPct).toBe(0); // INI-9 de "Otro" sin asignar
  });
});
describe("calcPmMetrics", () => {
  it("EVM del PM = promedio ponderado (INI 10% · REQ 20% · Proyectos 70%) y eso alimenta el KPI", () => {
    // 1 board 100% Done y en tiempo → healthIndex 1 (Proyectos = 1.0)
    const projBoards = [board({ id: "b1", pm: "Luis" })];
    const projItems = [
      proj({ boardId: "b1", id: "p1", name: "x", grupo: "Launch", status: "Done", estado: "EN TIEMPO", cost: 100,
        subitems: [] }),
    ];
    const bhm = buildBoardHealthMap(projItems, projBoards, {});
    // 1 REQ con VEM 0.5 (REQ = 0.5). Sin iniciativas → ese 10% se reparte.
    const reqs = [req({ id: "r1", pm: "Luis", estado: "EN PROCESO", grupo: "Desarrollo", vem: 0.5, onTime: onTime("n/a") })];

    const m = calcPmMetrics("Luis", [], reqs, projItems, projBoards, bhm, new Map(), []);

    // weightedEvm({ ini: null, req: 0.5, proj: 1 }) = (0.5·0.2 + 1·0.7) / (0.2 + 0.7) = 0.8/0.9
    expect(m.evmRaw).toBeCloseTo(0.8 / 0.9, 10);
    expect(m.evmPct).toBe(89);

    // El componente EVM del KPI (peso 25, meta 100%) usa ese mismo valor.
    const evmComp = m.kpi.components.find((c) => c.key === "evm")!;
    expect(evmComp.weight).toBe(25);
    expect(evmComp.logro).toBeCloseTo(0.8 / 0.9, 10);
    expect(evmComp.real).toBe("89%");
    expect(evmComp.logro * evmComp.weight).toBeCloseTo((0.8 / 0.9) * 25, 6);
  });

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
    expect(m.kpi.components).toHaveLength(6);
    expect(m.kpiPct).toBe(Math.round(m.kpi.score));
  });
});

describe("calcConfirmacionRoi (Confirmación del portafolio vía ROI — reemplaza a la de Monday en Costo & Beneficio/Pipeline/histórico semanal)", () => {
  it("sin filas de ninguna fuente, da 0", () => {
    expect(calcConfirmacionRoi([], [])).toBe(0);
  });

  it("suma el Ahorro real con Ducafast (003) + el Ahorro $ de Clonación, cada uno recalculado con su propia función pura (sin magic numbers)", () => {
    const roiFila = (o: Partial<RoiRow>): RoiRow => ({
      c807_file: "F1", Proceso: "Aduana", Cliente: "CLIENTE A",
      Usuario: "ANA", Analista: "BETO", Embarque: "Marítimo",
      Documento: "CONOCIMIENTO DE EMBARQUE", Mesa: "Mesa 1", Docalpha: "No Ducafast",
      Creado: "2026-01-05T08:00:00", DPR: "2026-01-05T09:00:00",
      Clasificacion_exacta: "2026-01-05T10:00:00", Creacion_Pre_DUCA: "2026-01-05T11:00:00",
      Revision_Analista: "2026-01-05T12:00:00", Solicitar_firma_def: "2026-01-05T13:00:00",
      ...o,
    } as RoiRow);
    const roiRows = [
      roiFila({ c807_file: "F1", Docalpha: "No Ducafast" }),
      roiFila({
        c807_file: "F2", Docalpha: "Ducafast",
        Creado: "2026-01-05T08:00:00", DPR: "2026-01-05T08:30:00",
        Clasificacion_exacta: "2026-01-05T09:00:00", Creacion_Pre_DUCA: "2026-01-05T09:30:00",
        Revision_Analista: "2026-01-05T10:00:00", Solicitar_firma_def: "2026-01-05T10:30:00",
      }),
    ];

    const clonRow = (file: string, solicitud: string, creacion: string, comentario = ""): ClonacionRow => ({
      c807_file: file, Fecha: "", Solicitud_fecha: solicitud, Creacion_fecha: creacion,
      Usuario: "U", Cliente: "C", Mesa: "", Proceso: "", Comentario: comentario,
    });
    const clonRows = [
      clonRow("GT-2026-00001", "2026-01-05T08:00:00", "2026-01-05T08:30:00"), // padre
      clonRow("GT-2026-00002", "2026-01-05T09:00:00", "2026-01-05T09:15:00", "Creado como réplica del file GT-2026-00001"), // "v"
    ];

    const total = calcConfirmacionRoi(roiRows, clonRows);
    const expectedDuca = ahorroDucafast(construirExpedientes(roiRows), TARIFA_HORA_DEFECTO, ETAPA_KEYS).ahorro;
    const expectedClon = costoClonacionPorOrigen(construirRegistros(clonRows), TARIFA_CLONACION_DEFECTO).contrafactual.ahorro;
    expect(expectedDuca).toBeGreaterThan(0);
    expect(expectedClon).not.toBe(0); // confirma que el registro "v" sí se reconoció (si fuera 0, nFilesV=0)
    expect(total).toBeCloseTo(expectedDuca + expectedClon, 5);

    // El detalle por tramos es la misma cifra, partida: T0 = Clonación, T1→T3 + T4→T5 = Ducafast.
    const d = calcConfirmacionRoiDetalle(roiRows, clonRows);
    expect(d.total).toBeCloseTo(total, 5);
    expect(d.t0).toBeCloseTo(expectedClon, 5);
    expect(d.t13 + d.t45).toBeCloseTo(expectedDuca, 5);
  });
});

describe("Confirmación vía ROI por PM (Luis: T0 + T4→T5 · David: T1→T3)", () => {
  const detalle = { t0: 2_000, t13: 50_000, t45: 18_000, total: 70_000 };

  it("reparte los tramos entre Luis y David sin repetir ninguno: entre los dos suman el total", () => {
    const porPm = confirmacionRoiPorPm(detalle);
    expect(porPm["Luis Aguilar"].monto).toBe(20_000);  // T0 + T4→T5
    expect(porPm["David Guzmán"].monto).toBe(50_000);  // T1→T3
    expect(Object.values(porPm).reduce((s, c) => s + c.monto, 0)).toBe(detalle.total);
  });

  it("calcPmMetrics usa la Confirmación de ROI en vez de la de Monday y eso mueve el KPI", () => {
    const projBoards = [board({ id: "b1", pm: "Luis Aguilar", benefitType: "HardSaving" })];
    const projItems = [proj({ boardId: "b1", boardName: "P1", status: "Done", estado: "EN TIEMPO", name: "x", grupo: "Launch", cost: 100, benefit: 500 })];
    const bhm = buildBoardHealthMap(projItems, projBoards, {});
    const run = (roi: Record<string, ConfirmacionRoiPm>) =>
      calcPmMetrics("Luis Aguilar", [], [], projItems, projBoards, bhm, new Map(), [], {}, {}, undefined, {}, roi);

    const monday = run({});
    const conRoi = run(confirmacionRoiPorPm(detalle));
    expect(monday.pmValueHard.confirmacionRoi).toBeUndefined();
    expect(conRoi.pmValueHard.confirmacionBenefit).toBe(20_000);
    expect(conRoi.pmValueHard.confirmacionRoi).toMatch(/T0/);
    expect(conRoi.pmValueAll.confirmacionBenefit).toBe(20_000);
    expect(conRoi.pmValueHard.aprobacionBenefit).toBe(monday.pmValueHard.aprobacionBenefit); // Aprobación sigue de Monday
    expect(conRoi.kpi.score).toBeGreaterThan(monday.kpi.score);
  });

  it("a un PM sin reparto de ROI no le toca nada", () => {
    const projBoards = [board({ id: "b1", pm: "Otro PM" })];
    const bhm = buildBoardHealthMap([], projBoards, {});
    const m = calcPmMetrics("Otro PM", [], [], [], projBoards, bhm, new Map(), [], {}, {}, undefined, {}, confirmacionRoiPorPm(detalle));
    expect(m.pmValueHard.confirmacionRoi).toBeUndefined();
    expect(m.pmValueHard.confirmacionBenefit).toBe(0);
  });
});

describe("Metodología VALOR en el KPI del PM (nota vigente = la del mes en curso)", () => {
  const boards = [board({ id: "b1", pm: "Luis Aguilar" })];
  const run = (m: Record<string, { score: number }>, pm = "Luis Aguilar") =>
    calcPmMetrics(pm, [], [], [], boards, buildBoardHealthMap([], boards, {}), new Map(), [], {}, {}, undefined, m);

  it("sin notas editadas el PM arranca en 100% y el componente suma sus 15 puntos", () => {
    const m = run({});
    expect(m.metodologiaPct).toBe(100);
    const comp = m.kpi.components.find((c) => c.key === "metodologia")!;
    expect(comp.weight).toBe(15);
    expect(comp.pending).toBeFalsy();
    expect(comp.logro).toBe(1);
  });

  it("usa la nota editada por el Admin del mes en curso", () => {
    const mes = mesDe(today());
    const m = run({ [metodologiaKey(mes, "Luis Aguilar")]: { score: 80 } });
    expect(m.metodologiaPct).toBe(80);
    const comp = m.kpi.components.find((c) => c.key === "metodologia")!;
    expect(comp.logro).toBeCloseTo(0.8, 8);
    expect(run({}).kpi.score - m.kpi.score).toBeCloseTo(0.2 * 15, 8); // 3 pts menos
  });

  it("la nota de otro PM o de otro mes no le afecta", () => {
    const mes = mesDe(today());
    const m = run({ [metodologiaKey(mes, "David Guzmán")]: { score: 10 }, [metodologiaKey("2020-01", "Luis Aguilar")]: { score: 10 } });
    expect(m.metodologiaPct).toBe(100);
  });
});
