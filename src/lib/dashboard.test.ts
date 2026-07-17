import { describe, it, expect } from "vitest";
import {
  isValueGateSigned,
  calcPmValue,
  pmWorstStatus,
  buildBoardHealthMap,
  calcPmMetrics,
} from "./dashboard";
import type { BoardHealthData } from "./proj";
import type { ProjBoard, ProjItem, ReqItem } from "@/types";

// Fixtures mínimos: solo se rellenan los campos que leen las funciones.
const req = (o: Partial<ReqItem>): ReqItem => o as ReqItem;
const proj = (o: Partial<ProjItem>): ProjItem => ({ subitems: [], ...o }) as ProjItem;
const board = (o: Partial<ProjBoard>): ProjBoard => o as ProjBoard;

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

describe("calcPmMetrics", () => {
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
