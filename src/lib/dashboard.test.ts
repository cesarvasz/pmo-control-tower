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
  buildEntregaRows,
  buildLateResponsibleRows,
  buildLateResponsibleRowsRaw,
  buildReprocesoRows,
} from "./dashboard";
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

describe("calcReprocesoPct (5º componente del KPI)", () => {
  const cerrado = (id: string) => req({ id, pm: "Luis", estado: "CERRADO" });

  it("null si no hay unidades en scope (sin REQ cerrados ni fases con items Done)", () => {
    expect(calcReprocesoPct([req({ id: "1", estado: "EN PROCESO" })], [], {})).toBeNull();
  });

  it("sin asignar penaliza: 2 cerrados sin responsable → 0% limpio", () => {
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

  it("combina REQ cerrados + fases de proyecto con al menos 1 item Done (medición progresiva)", () => {
    const reqs = [cerrado("r1")];
    const projs = [
      proj({ boardId: "b1", grupo: "Launch", status: "Done" }),                    // 1 step Done
      proj({ boardId: "b1", grupo: "Dev", status: "Working on it" }),              // incompleta, sin items Done
    ];
    expect(calcReprocesoPct(reqs, projs, { "b1::Launch": { responsible: "Sin reproceso" } })).toBe(50);
  });

  it("fase con ≥1 item Done entra en scope aunque no esté 100% completada", () => {
    const projs = [
      proj({ boardId: "b1", grupo: "Launch", status: "Done" }),
      proj({ boardId: "b1", grupo: "Launch", status: "Working on it" }),            // mismo grupo, otro item
      proj({ boardId: "b1", grupo: "Ops", status: "Done" }),
      proj({ boardId: "b2", grupo: "Launch", status: "Done" }),
    ];
    // 3 fases: b1::Launch (1 Done, aunque otra esté en progreso), b1::Ops (1 Done), b2::Launch (1 Done)
    // b1::Launch=Sin reproceso (excusa), b1::Ops=PM (penaliza), b2::Launch=vacío (penaliza) → 1 de 3 = 33%.
    expect(calcReprocesoPct([], projs, {
      "b1::Launch": { responsible: "Sin reproceso" },
      "b1::Ops": { responsible: "PM" },
    })).toBe(33);
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
  it("incluye REQ CERRADOS y fases completadas, con verdict clean/reproceso según el DelayMap", () => {
    const reqs = [req({ id: "r1", name: "R1", pm: "Luis", estado: "CERRADO", onTime: onTime("on-time") })];
    const projs = [
      proj({ id: "p1", boardId: "b1", boardName: "P1", grupo: "Launch", pm: "Otro", status: "Done" }),
      proj({ id: "p2", boardId: "b1", boardName: "P1", grupo: "Launch", pm: "Otro", status: "Done" }),
    ];
    const rows = buildReprocesoRows(reqs, projs, [board({ id: "b1", pm: "Luis" })], { r1: { responsible: "VPA" } });
    expect(rows).toHaveLength(2);
    const req1 = rows.find((r) => r.id === "r1")!;
    const fase = rows.find((r) => r.id === "b1::Launch")!;
    expect(req1.verdict).toBe("clean");      // excusado (VPA)
    expect(fase.verdict).toBe("reproceso");  // sin asignar → penaliza
    expect(fase.pm).toBe("Luis");            // PM del board, no del item
  });

  it("una fase incompleta (no todos Done) no genera fila", () => {
    const projs = [proj({ id: "p1", boardId: "b1", boardName: "P1", grupo: "Launch", status: "Working on it" })];
    expect(buildReprocesoRows([], projs, [board({ id: "b1", pm: "Luis" })], {})).toEqual([]);
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
