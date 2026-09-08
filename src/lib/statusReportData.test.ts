import { describe, it, expect } from "vitest";
import { buildStatusReportData, shortPhaseName } from "./statusReportData";
import { buildProjectSummary } from "./projSummary";
import { deriveBoardHealth, calcBoardMetrics } from "./proj";
import { today } from "./business";
import { evaluarStepAtraso, type StepAtraso } from "./projSummary";
import type { ProjBoard, ProjItem, ProjSubitem } from "@/types";

const sub = (o: Partial<ProjSubitem>): ProjSubitem =>
  ({ status: "", estado: "EN TIEMPO", deadline: null, actualEnd: null, entrega: null, startDate: null, ...o }) as ProjSubitem;
const item = (o: Partial<ProjItem>): ProjItem =>
  ({ subitems: [], status: "", estado: "EN TIEMPO", deadline: null, endDate: null, startDate: null, entrega: null, grupo: "Fase", responsible: "", ...o }) as ProjItem;
const board = (o: Partial<ProjBoard>): ProjBoard =>
  ({ id: "b1", name: "PM-012 · DUCAfast Reg", pm: "David", sponsor: "Patricia", cku: "Victoria", estrategia: "DUCAFAST", ...o }) as ProjBoard;

const daysFromToday = (n: number): Date => { const d = today(); d.setDate(d.getDate() + n); return d; };

describe("shortPhaseName", () => {
  it("toma la parte después del primer ' | '", () => {
    expect(shortPhaseName("Valuación | Formulación del proyecto")).toBe("Formulación del proyecto");
    expect(shortPhaseName("Launch | Lanzamiento")).toBe("Lanzamiento");
    expect(shortPhaseName("Sin separador")).toBe("Sin separador");
  });
});

describe("buildStatusReportData", () => {
  const items: ProjItem[] = [
    item({ id: "v1", grupo: "Valuación | Formulación del proyecto", status: "Done", deadline: daysFromToday(-40), endDate: daysFromToday(-40) }),
    item({ id: "a1", grupo: "Aprobación | Value Gate", status: "Working on it", deadline: daysFromToday(10) }),
    item({
      id: "L1", name: "MESA 2 · GT", grupo: "Launch | Lanzamiento", responsible: "Victoria Escobar",
      startDate: daysFromToday(-30),
      subitems: [
        sub({ id: "L1a", status: "Done", deadline: daysFromToday(-10), actualEnd: daysFromToday(-8) }),
        sub({ id: "L1b", status: "Stuck", estado: "ATRASADO", deadline: daysFromToday(-11) }),
      ],
    }),
    item({
      id: "L2", name: "DucaFast · HN", grupo: "Launch | Lanzamiento", responsible: "Victoria Escobar",
      startDate: daysFromToday(-20), deadline: daysFromToday(20), status: "Working on it",
    }),
  ];

  const summary = buildProjectSummary(items);
  const health = deriveBoardHealth(calcBoardMetrics(items, {}));
  const atrasos = items
    .filter((it) => it.grupo.toLowerCase().startsWith("launch"))
    .map((it) => evaluarStepAtraso(it, today()))
    .filter((x): x is StepAtraso => x !== null);
  const responsabilidadAtraso = [{ label: "CKU", pct: 100 }];
  const atrasoDetalles = { L1: { responsable: "CKU", motivo: "Aduana pendiente" } };

  const data = buildStatusReportData({
    board: board({}), code: "PM-012", name: "DUCAfast Reg",
    summary, health, atrasos, atrasoDetalles, responsabilidadAtraso,
    avancePlanificado: 28, valorProyecto: 22503, roi: 83345, payback: 0,
    now: today().getTime(),
  });

  it("encabezado y KPIs con el formato del spec", () => {
    expect(data.project).toMatchObject({ id: "PM-012", name: "DUCAfast Reg", pm: "David", cku: "Victoria" });
    expect(data.avance_real).toMatch(/%$/);
    expect(data.avance_plan).toBe("28%");
    expect(data.roi).toBe("83,345%");
    expect(data.payback).toBe("0.0 meses");
    expect(data.valor_generado).toBe("$22,503");
    expect(["good", "warn", "crit", "neutral"]).toContain(data.salud_tone);
  });

  it("stepper VALOR: banda actual + Launch marcada como atrasada", () => {
    expect(["V", "A", "L", "O", "R"]).toContain(data.current_band);
    expect(data.late_bands).toContain("L");
  });

  it("Gantt: fases de nivel 0 con banda + Launch expandida en steps indentados", () => {
    const top = data.phases.filter((p) => p.indent === 0);
    const steps = data.phases.filter((p) => p.indent === 1);
    expect(top.map((p) => p.name)).toContain("Formulación del proyecto");
    expect(top.find((p) => p.name === "Lanzamiento")?.band).toBe("L");
    expect(steps.map((p) => p.name)).toEqual(expect.arrayContaining(["MESA 2 · GT", "DucaFast · HN"]));
    // MESA 2 tiene un hito en Stuck → status "late"
    expect(steps.find((p) => p.name === "MESA 2 · GT")?.status).toBe("late");
  });

  it("Causas de atraso: usa 'actividad(es)', nunca 'hito'", () => {
    expect(data.atrasos.length).toBeGreaterThan(0);
    for (const a of data.atrasos) {
      expect(a.actividades).toMatch(/actividad(es)?/);
      expect(a.actividades).not.toMatch(/hito/i);
    }
    const mesa2 = data.atrasos.find((a) => a.hito === "MESA 2 · GT")!;
    expect(mesa2.resp).toBe("CKU");
    expect(mesa2.motivo).toBe("Aduana pendiente");
    expect(mesa2.actividades).toContain("Stuck");
  });

  it("resp_dist refleja responsabilidadAtraso", () => {
    expect(data.resp_dist).toEqual([{ label: "CKU", value: 100, color: "violet" }]);
  });

  it("fechas del timeline en YYYY-MM-DD", () => {
    expect(data.timeline_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.timeline_end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
