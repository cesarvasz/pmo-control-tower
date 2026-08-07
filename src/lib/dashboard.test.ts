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
  completedProjectPhases,
  buildEntregaRows,
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
const onTime = (verdict: "on-time" | "late" | "n/a"): ReqItem["onTime"] => ({ verdict } as ReqItem["onTime"]);

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

describe("calcEntregaStats (Cumplimiento de Entrega: REQ + hitos únicos de Proyectos)", () => {
  const step = (subitems: ReturnType<typeof sub>[]) => proj({ boardId: "b1", subitems });

  it("REQ cerrado cuenta 1 unidad c/u; solo excusa si el responsable es ≠ PM", () => {
    const reqs = [
      req({ id: "r1", onTime: onTime("on-time") }),
      req({ id: "r2", onTime: onTime("late") }),
      req({ id: "r3", onTime: onTime("late") }),
    ];
    const delays: DelayMap = { r3: { responsible: "VPA" } }; // r3 excusado
    expect(calcEntregaStats(reqs, [], delays)).toEqual({ total: 2, onTime: 1, late: 1, pct: 50 });
  });

  it("un item de Proyecto SIN subitems ya no cuenta (solo cuentan los hitos)", () => {
    const projs = [proj({ id: "p1", boardId: "b1", entrega: "late" })];
    expect(calcEntregaStats([], projs, {})).toEqual({ total: 0, onTime: 0, late: 0, pct: null });
  });

  it("un hito repetido en varios steps (mismo PMS ID) pesa 1 sola unidad, con su propio % entre ocurrencias Done", () => {
    const projs = [
      step([sub({ id: "s1", pmsId: "H1", entrega: "on-time" })]),
      step([sub({ id: "s2", pmsId: "H1", entrega: "on-time" })]),
      step([sub({ id: "s3", pmsId: "H1", entrega: "late" })]),
      step([sub({ id: "s4", pmsId: "H1", entrega: "late" })]),
    ];
    // 2 a tiempo de 4 Done → 50% para el hito H1, única unidad en scope.
    expect(calcEntregaStats([], projs, {})).toEqual({ total: 1, onTime: 1, late: 0, pct: 50 });
  });

  it("una ocurrencia atrasada y excusada (responsable ≠ PM) no cuenta ni a favor ni en contra del hito", () => {
    const projs = [
      step([sub({ id: "s1", pmsId: "H1", entrega: "on-time" })]),
      step([sub({ id: "s2", pmsId: "H1", entrega: "late" })]), // excusado
    ];
    const delays: DelayMap = { s2: { responsible: "Sponsor" } };
    expect(calcEntregaStats([], projs, delays)).toEqual({ total: 1, onTime: 1, late: 0, pct: 100 });
  });

  it("un hito sin ninguna ocurrencia Done evaluable todavía no cuenta", () => {
    const projs = [step([sub({ id: "s1", pmsId: "H1", entrega: null })])]; // Working on it / Future Steps
    expect(calcEntregaStats([], projs, {})).toEqual({ total: 0, onTime: 0, late: 0, pct: null });
  });

  it("cada hito pesa igual sin importar cuántas ocurrencias (steps) recorrió", () => {
    // H1: 8 ocurrencias, 4 a tiempo / 4 atrasadas → 50%.
    const h1steps = Array.from({ length: 8 }, (_, i) =>
      step([sub({ id: `h1-${i}`, pmsId: "H1", entrega: i < 4 ? "on-time" : "late" })]),
    );
    // H2: 1 sola ocurrencia, a tiempo → 100%.
    const h2step = step([sub({ id: "h2-0", pmsId: "H2", entrega: "on-time" })]);
    const stats = calcEntregaStats([], [...h1steps, h2step], {});
    // Promedio simple (50 + 100) / 2 = 75%, NO ponderado por cantidad de ocurrencias.
    expect(stats.total).toBe(2);
    expect(stats.pct).toBe(75);
  });

  it("subitems sin PMS ID no se deduplican entre sí (cada uno es su propio hito)", () => {
    const projs = [
      step([sub({ id: "s1", pmsId: "", entrega: "on-time" })]),
      step([sub({ id: "s2", pmsId: "", entrega: "late" })]),
    ];
    expect(calcEntregaStats([], projs, {})).toEqual({ total: 2, onTime: 1, late: 1, pct: 50 });
  });
});

describe("calcEntregaStatsRaw (tarjeta principal: todos los atrasados, sin excusar por responsable)", () => {
  const step = (subitems: ReturnType<typeof sub>[]) => proj({ boardId: "b1", subitems });

  it("un atraso con responsable ≠ PM cuenta igual (no se excusa, a diferencia de calcEntregaStats)", () => {
    const reqs = [req({ id: "r1", onTime: onTime("on-time") }), req({ id: "r2", onTime: onTime("late") })];
    const projs = [
      step([sub({ id: "s1", pmsId: "H1", entrega: "late" })]),
    ];
    // Nota: calcEntregaStatsRaw no recibe delays — no hay forma de excusar nada.
    expect(calcEntregaStatsRaw(reqs, projs)).toEqual({ total: 3, onTime: 1, late: 2, pct: 33 });
  });

  it("cada hito sigue pesando 1 unidad (misma agrupación por PMS ID que calcEntregaStats)", () => {
    const projs = [
      step([sub({ id: "s1", pmsId: "H1", entrega: "on-time" })]),
      step([sub({ id: "s2", pmsId: "H1", entrega: "late" })]),
      step([sub({ id: "s3", pmsId: "H1", entrega: "late" })]),
    ];
    // H1: 1 a tiempo de 3 Done → 33%, única unidad en scope.
    const stats = calcEntregaStatsRaw([], projs);
    expect(stats.total).toBe(1);
    expect(stats.pct).toBe(33);
  });
});

describe("completedProjectPhases", () => {
  it("una fase (board+grupo) está completa solo si TODOS sus items están Done", () => {
    const projs = [
      proj({ boardId: "b1", grupo: "Launch", status: "Done" }),
      proj({ boardId: "b1", grupo: "Launch", status: "Done" }),
      proj({ boardId: "b1", grupo: "Aprobación", status: "Working on it" }), // fase incompleta
      proj({ boardId: "b2", grupo: "Launch", status: "Done" }),
    ];
    expect(completedProjectPhases(projs).sort()).toEqual(["b1::Launch", "b2::Launch"]);
  });
});

describe("calcReprocesoPct (5º componente del KPI)", () => {
  const cerrado = (id: string) => req({ id, pm: "Luis", estado: "CERRADO" });
  const faseDone = (boardId: string, grupo: string) => proj({ boardId, grupo, status: "Done" });

  it("null si no hay unidades en scope (sin REQ cerrados ni fases completadas)", () => {
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
    // 1=PM (penaliza), 2=Sponsor (excusa), 3 y 4 sin asignar (penalizan) → 1 limpio de 4.
    expect(calcReprocesoPct(reqs, [], { "1": { responsible: "PM" }, "2": { responsible: "Sponsor" } })).toBe(25);
  });

  it("combina REQ cerrados + fases de proyecto COMPLETADAS (las incompletas no cuentan)", () => {
    const reqs = [cerrado("r1")];
    const projs = [
      faseDone("b1", "Launch"),                                    // fase completa → unidad "b1::Launch"
      proj({ boardId: "b1", grupo: "Dev", status: "Working on it" }), // incompleta → fuera de scope
    ];
    // 2 unidades: r1 (sin asignar → penaliza) y b1::Launch ("Sin reproceso" → excusa) → 1 de 2 = 50%.
    expect(calcReprocesoPct(reqs, projs, { "b1::Launch": { responsible: "Sin reproceso" } })).toBe(50);
  });

  it("'Sin reproceso' excusa la unidad; vacío o PM en una fase completada penalizan", () => {
    const projs = [faseDone("b1", "Launch"), faseDone("b1", "Ops"), faseDone("b2", "Launch")];
    // b1::Launch=Sin reproceso (excusa), b1::Ops=PM (penaliza), b2::Launch=vacío (penaliza) → 1 de 3 = 33%.
    expect(calcReprocesoPct([], projs, {
      "b1::Launch": { responsible: "Sin reproceso" },
      "b1::Ops": { responsible: "PM" },
    })).toBe(33);
  });
});

describe("buildEntregaRows (auditoría Cumplimiento de Entrega)", () => {
  it("solo incluye REQ y SUBITEMS con veredicto on-time o late (excluye n/a, null y el ITEM padre)", () => {
    const reqs = [
      req({ id: "r1", name: "R1", grupo: "Desarrollo", pm: "Luis", deadline: null, onTime: onTime("late") }),
      req({ id: "r2", name: "R2", grupo: "Desarrollo", pm: "Luis", deadline: null, onTime: onTime("n/a") }),
    ];
    const projs = [
      proj({ id: "p1", boardId: "b1", boardName: "P1", grupo: "Launch", pm: "Otro", name: "Hito", deadline: null, entrega: "on-time",
        subitems: [sub({ id: "s1", name: "Sub", deadline: null, entrega: "late" }), sub({ id: "s2", name: "Sub2", deadline: null, entrega: null })] }),
    ];
    const rows = buildEntregaRows(reqs, projs, [board({ id: "b1", pm: "Luis" })]);
    // El ITEM padre p1 (aunque tenga entrega on-time) NO cuenta en el KPI de Entrega → no aparece.
    expect(rows.map((r) => r.id).sort()).toEqual(["r1", "s1"]);
  });

  it("desglosa tipo/fase/step padre/hito y atribuye el PM del board (no el del item) a los hitos", () => {
    const projs = [proj({ id: "p1", boardId: "b1", boardName: "P1", grupo: "Launch", pm: "ItemPm", name: "Step A", deadline: null, entrega: "late",
      subitems: [sub({ id: "s1", name: "Hito 1", deadline: null, entrega: "late" })] })];
    const rows = buildEntregaRows([], projs, [board({ id: "b1", pm: "BoardPm" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "s1", tipo: "PM", fase: "Launch", stepPadre: "Step A", hito: "Hito 1", pm: "BoardPm" });
  });
});

describe("buildReprocesoRows (auditoría Calidad de Entregas)", () => {
  it("incluye REQ CERRADOS y fases completadas, con verdict clean/reproceso según el DelayMap", () => {
    const reqs = [req({ id: "r1", name: "R1", pm: "Luis", estado: "CERRADO" })];
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

  it("un atraso baja el % del PM por defecto; solo se excusa con responsable ≠ PM (por hito, no por item)", () => {
    const projBoards = [board({ id: "b1", pm: "Luis" })];
    const projItems = [
      proj({ boardId: "b1", id: "p1", status: "Done", estado: "EN TIEMPO", name: "x", grupo: "Launch", cost: 0, benefit: 0,
        subitems: [sub({ id: "i1", pmsId: "H1", entrega: "on-time" })] }),
      proj({ boardId: "b1", id: "p2", status: "Done", estado: "ATRASADO", name: "y", grupo: "Launch", cost: 0, benefit: 0,
        subitems: [sub({ id: "i2", pmsId: "H2", entrega: "late" })] }),
    ];
    const bhm = buildBoardHealthMap(projItems, projBoards, {});
    const run = (delays: DelayMap) => calcPmMetrics("Luis", [], [], projItems, projBoards, bhm, new Map(), [], delays);
    expect(run({}).entPct).toBe(50);                                    // sin asignar → atraso cuenta (1 de 2 hitos)
    expect(run({ i2: { responsible: "PM" } }).entPct).toBe(50);          // PM → cuenta (1 de 2)
    expect(run({ i2: { responsible: "Sponsor" } }).entPct).toBe(100);    // excusado → excluido
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
