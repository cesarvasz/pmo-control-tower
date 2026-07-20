import { describe, it, expect } from "vitest";
import {
  isValueGateSigned,
  calcPmValue,
  pmWorstStatus,
  buildBoardHealthMap,
  calcPmMetrics,
  countDeliveries,
  calcReprocesoPct,
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

describe("isValueGateSigned", () => {
  it("detecta un Value Gate (BC) firmado en cualquier fase", () => {
    expect(isValueGateSigned("Value Gate (BC) Firmado y aprobado (Sponsor+VPA+PMO Mgr)")).toBe(true);
    expect(isValueGateSigned("Value Gate (BC) Actualizado y firmado")).toBe(true);
    expect(isValueGateSigned("Otro paso cualquiera")).toBe(false);
  });
});

describe("calcPmValue", () => {
  const reqs: ReqItem[] = [
    req({ pm: "Luis", grupo: "Desarrollo", benefitType: "HardSaving", costRH: 1000, costSft: 0, benefit: 5000, name: "R1" }),
    req({ pm: "Luis", grupo: "Aprobación", benefitType: "Soft", costRH: 500, costSft: 0, benefit: 2000, name: "R2" }),
    req({ pm: "Otro", grupo: "Desarrollo", benefitType: "HardSaving", costRH: 999, costSft: 0, benefit: 999, name: "R3" }),
  ];

  it("clasifica REQ en Confirmación (pasó fase 2) vs Aprobación (en fase 2)", () => {
    const v = calcPmValue("Luis", reqs, [], [], false);
    expect(v.confirmCost).toBe(1000);
    expect(v.confirmBenefit).toBe(5000);   // R1 (Desarrollo)
    expect(v.aprobCost).toBe(500);
    expect(v.aprobBenefit).toBe(2000);     // R2 (Aprobación)
    expect(v.totalCost).toBe(1500);
    expect(v.totalBenefit).toBe(7000);     // excluye a "Otro"
  });

  it("hardOnly limita a benefitType HardSaving", () => {
    const v = calcPmValue("Luis", reqs, [], [], true);
    expect(v.totalBenefit).toBe(5000);     // solo R1
    expect(v.aprobBenefit).toBe(0);        // R2 (Soft) excluido
  });

  it("un proyecto con Value Gate de Aprobación firmado cuenta en el bucket Aprobación", () => {
    const projBoards = [board({ id: "b1", pm: "Luis", benefitType: "HardSaving" })];
    const projItems = [
      proj({ boardId: "b1", boardName: "P1", status: "Done", name: "Value Gate (BC) Firmado y aprobado", grupo: "Aprobación | Value Gate", cost: 300, benefit: 1000 }),
    ];
    const v = calcPmValue("Luis", [], projItems, projBoards, false);
    expect(v.aprobCost).toBe(300);
    expect(v.aprobBenefit).toBe(1000);
    expect(v.confirmBenefit).toBe(0);      // sin Launch firmado
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

describe("countDeliveries (responsable del atraso)", () => {
  const p = (id: string, entrega: "on-time" | "late" | null) => proj({ id, boardId: "b1", entrega });

  it("un atraso sin asignar SÍ cuenta como atraso (penaliza por defecto)", () => {
    expect(countDeliveries([], [p("1", "on-time"), p("2", "late")], {})).toEqual({ on: 1, late: 1 });
  });

  it("PM y sin asignar cuentan; solo un responsable ≠ PM excusa el atraso", () => {
    const projs = [p("1", "on-time"), p("2", "late"), p("3", "late"), p("4", "late")];
    const delays: DelayMap = { "2": { responsible: "PM" }, "3": { responsible: "VPA" } };
    // p2 (PM) cuenta, p3 (VPA) excusado, p4 (sin asignar) cuenta → 2 atrasos, 1 a tiempo.
    expect(countDeliveries([], projs, delays)).toEqual({ on: 1, late: 2 });
  });

  it("cuenta REQ y subitems con la misma regla", () => {
    const reqs = [req({ id: "r1", onTime: onTime("late") })];
    const projs = [proj({ id: "p1", boardId: "b1", entrega: null, subitems: [sub({ id: "s1", entrega: "late" })] })];
    const delays: DelayMap = { r1: { responsible: "PM" }, s1: { responsible: "Sponsor" } };
    // r1 (PM) cuenta; s1 (Sponsor) excusado.
    expect(countDeliveries(reqs, projs, delays)).toEqual({ on: 0, late: 1 });
  });
});

describe("calcReprocesoPct (5º componente del KPI)", () => {
  const cerrado = (id: string) => req({ id, pm: "Luis", estado: "CERRADO" });

  it("null si no hay REQ cerrados (componente pendiente)", () => {
    expect(calcReprocesoPct([req({ id: "1", estado: "EN PROCESO" })], {})).toBeNull();
  });

  it("sin asignar penaliza: 2 cerrados sin responsable → 0% limpio", () => {
    expect(calcReprocesoPct([cerrado("1"), cerrado("2")], {})).toBe(0);
  });

  it("100% solo si todos los cerrados están excusados (responsable ≠ PM)", () => {
    const reqs = [cerrado("1"), cerrado("2")];
    expect(calcReprocesoPct(reqs, { "1": { responsible: "VPA" }, "2": { responsible: "CKU" } })).toBe(100);
  });

  it("PM y sin asignar penalizan; solo un responsable ≠ PM excusa (1 de 4 → 25%)", () => {
    const reqs = [cerrado("1"), cerrado("2"), cerrado("3"), cerrado("4")];
    // 1=PM (penaliza), 2=Sponsor (excusa), 3 y 4 sin asignar (penalizan) → 1 limpio de 4.
    expect(calcReprocesoPct(reqs, { "1": { responsible: "PM" }, "2": { responsible: "Sponsor" } })).toBe(25);
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

  it("un atraso baja el % del PM por defecto; solo se excusa con responsable ≠ PM", () => {
    const projBoards = [board({ id: "b1", pm: "Luis" })];
    const projItems = [
      proj({ boardId: "b1", id: "i1", status: "Done", estado: "EN TIEMPO", entrega: "on-time", name: "x", grupo: "Launch", cost: 0, benefit: 0 }),
      proj({ boardId: "b1", id: "i2", status: "Done", estado: "ATRASADO", entrega: "late", name: "y", grupo: "Launch", cost: 0, benefit: 0 }),
    ];
    const bhm = buildBoardHealthMap(projItems, projBoards, {});
    const run = (delays: DelayMap) => calcPmMetrics("Luis", [], [], projItems, projBoards, bhm, new Map(), [], delays);
    expect(run({}).entPct).toBe(50);                                    // sin asignar → atraso cuenta (1 de 2)
    expect(run({ i2: { responsible: "PM" } }).entPct).toBe(50);          // PM → cuenta (1 de 2)
    expect(run({ i2: { responsible: "Sponsor" } }).entPct).toBe(100);    // excusado → excluido
  });

  it("compone las métricas del PM (entregas, salud, KPI) de forma coherente", () => {
    const projBoards = [board({ id: "b1", pm: "Luis", benefitType: "HardSaving" })];
    const projItems = [
      proj({ boardId: "b1", boardName: "P1", status: "Done", estado: "EN TIEMPO", name: "x", grupo: "Launch", cost: 100, benefit: 500, entrega: "on-time" }),
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
