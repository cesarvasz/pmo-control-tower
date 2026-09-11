import { describe, it, expect } from "vitest";
import { buildStatusReportData, shortPhaseName } from "./statusReportData";
import { buildProjectSummary } from "./projSummary";
import { deriveBoardHealth, calcBoardMetrics } from "./proj";
import { today } from "./business";
import { evaluarStepAtraso, evaluarHitosAtraso, type StepAtraso } from "./projSummary";
import type { ProjBoard, ProjItem, ProjSubitem } from "@/types";

const sub = (o: Partial<ProjSubitem>): ProjSubitem =>
  ({ status: "", estado: "EN TIEMPO", deadline: null, actualEnd: null, entrega: null, startDate: null, ...o }) as ProjSubitem;
const item = (o: Partial<ProjItem>): ProjItem =>
  ({ subitems: [], status: "", estado: "EN TIEMPO", deadline: null, endDate: null, startDate: null, entrega: null, grupo: "Fase", responsible: "", ...o }) as ProjItem;
const board = (o: Partial<ProjBoard>): ProjBoard =>
  ({ id: "b1", name: "PM-012 · DUCAfast Reg", pm: "David", sponsor: "Patricia", cku: "Victoria", estrategia: "DUCAFAST", ...o }) as ProjBoard;

const daysFromToday = (n: number): Date => { const d = today(); d.setDate(d.getDate() + n); return d; };
const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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

  it("Causas de atraso: migra el `responsable` legacy a un tramo del reparto", () => {
    const mesa2 = data.atrasos.find((a) => a.hito === "MESA 2 · GT")!;
    expect(mesa2.reparto.map((r) => r.resp)).toEqual(["CKU"]);
    expect(mesa2.reparto[0].dias).toBe(mesa2.diasNum);
    expect(mesa2.reparto[0].tone).toBe("blue"); // CKU → slot fijo "blue"
  });

  it("resp_dist refleja responsabilidadAtraso con color fijo por rol", () => {
    expect(data.resp_dist).toEqual([{ label: "CKU", value: 100, color: "blue" }]);
  });

  it("fechas del timeline en YYYY-MM-DD", () => {
    expect(data.timeline_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.timeline_end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// Plantilla vieja: existe el step "Desarrollo por iteraciones..." en Fase 3 —
// activa el Gantt por Limit Date (fases 1/2/4/5) y los hitos como entregables
// (ver rowRange/fase3EntregableStatus en statusReportData.ts).
describe("buildStatusReportData — plantilla vieja (fases por Limit Date, Fase 3 = hitos)", () => {
  const items: ProjItem[] = [
    item({ id: "v1", grupo: "Valuación | Formulación del proyecto", status: "Done", deadline: daysFromToday(-60) }),
    item({ id: "v2", grupo: "Valuación | Formulación del proyecto", status: "Done", deadline: daysFromToday(-50) }),
    item({ id: "a1", grupo: "Aprobación | Value Gate", status: "Done", deadline: daysFromToday(-40) }),
    item({ id: "a2", grupo: "Aprobación | Value Gate", status: "Done", deadline: daysFromToday(-38) }),
    // Fase 3: 4 checkpoints — solo "Desarrollo por iteraciones..." importa.
    item({ id: "analisis", name: "Analisis técnico", grupo: "Launch | Desarrollo", status: "Done", deadline: daysFromToday(-35) }),
    item({ id: "vgbc", name: "Value Gate (BC)", grupo: "Launch | Desarrollo", status: "Done", deadline: daysFromToday(-35) }),
    item({ id: "agenda", name: "Agenda BAT/UAT CKU", grupo: "Launch | Desarrollo", status: "Done", deadline: daysFromToday(-35) }),
    item({
      id: "desarrollo", name: "Desarrollo por iteraciones (Hitos) / Entrega CKU", grupo: "Launch | Desarrollo",
      status: "Working on it", responsible: "PM Step",
      subitems: [
        sub({ id: "h1", name: "Entregable 1", status: "Done", deadline: daysFromToday(-20), actualEnd: daysFromToday(-18) }),
        sub({ id: "h2", name: "Entregable 2", status: "Working on it", estado: "EN TIEMPO", deadline: daysFromToday(10) }),
        sub({ id: "h3", name: "Entregable 3", status: "Future Steps", estado: "EN TIEMPO", deadline: daysFromToday(30) }),
        sub({ id: "h4", name: "Entregable atrasado", status: "Working on it", estado: "ATRASADO", deadline: daysFromToday(-5) }),
      ],
    }),
    // o1/o2 tienen hitos con Limit Date MUY fuera de [35,50] a propósito: la
    // fecha de la fase debe salir del item (deadline), no de estos hitos.
    item({
      id: "o1", grupo: "Operación | Implementación", status: "Working on it", deadline: daysFromToday(35),
      subitems: [sub({ id: "o1h1", status: "Done", deadline: daysFromToday(-90) }), sub({ id: "o1h2", status: "Working on it", deadline: daysFromToday(200) })],
    }),
    item({ id: "o2", grupo: "Operación | Implementación", status: "Working on it", deadline: daysFromToday(50) }),
    // Fase 5: "Cierre VMO..." fija el fin, NO el máximo (r1 vence después y se ignora).
    item({ id: "r0", name: "Kickoff de cierre", grupo: "Revisión | Cierre ROI", status: "Working on it", deadline: daysFromToday(20) }),
    item({ id: "r1", name: "Otro trámite administrativo", grupo: "Revisión | Cierre ROI", status: "Working on it", deadline: daysFromToday(90) }),
    item({ id: "cierre", name: "Cierre VMO (OP) del proyecto", grupo: "Revisión | Cierre ROI", status: "Working on it", deadline: daysFromToday(50) }),
    // Item administrativo tardío (real en PM-007: "VPA recopila datos a 90
    // días...") — su Limit Date NO debe estirar el eje de meses, ya que la
    // barra de Fase 5 termina en "cierre" (+50), no en este (+400).
    item({ id: "r2", name: "VPA recopila datos a 90 días", grupo: "Revisión | Cierre ROI", status: "Future Steps", deadline: daysFromToday(400) }),
  ];

  const summary = buildProjectSummary(items);
  const health = deriveBoardHealth(calcBoardMetrics(items, {}));
  const t = today();
  const desarrollo = items.find((it) => it.id === "desarrollo")!;
  const atrasos = evaluarHitosAtraso(desarrollo, t);

  const data = buildStatusReportData({
    board: board({}), code: "PM-007", name: "VOLT",
    summary, health, atrasos, atrasoDetalles: {}, responsabilidadAtraso: [],
    avancePlanificado: 50, valorProyecto: null, roi: null, payback: null,
    now: t.getTime(),
  });

  const top = () => data.phases.filter((p) => p.indent === 0);
  const hitos = () => data.phases.filter((p) => p.indent === 1);

  it("fases 1/2/4 (V/A/O): start = min Limit Date, due = max Limit Date de sus ITEMS — ignora hitos de o1 (-90/+200)", () => {
    expect(top().find((p) => p.name === "Formulación del proyecto")).toMatchObject({ start: ymd(daysFromToday(-60)), due: ymd(daysFromToday(-50)) });
    expect(top().find((p) => p.name === "Value Gate")).toMatchObject({ start: ymd(daysFromToday(-40)), due: ymd(daysFromToday(-38)) });
    expect(top().find((p) => p.name === "Implementación")).toMatchObject({ start: ymd(daysFromToday(35)), due: ymd(daysFromToday(50)) });
  });

  it("fase 5 (Revisión): due = Limit Date de \"Cierre VMO (OP) del proyecto\", NO el máximo de la fase", () => {
    const revision = top().find((p) => p.name === "Cierre ROI")!;
    expect(revision.start).toBe(ymd(daysFromToday(20))); // r0, el más temprano
    expect(revision.due).toBe(ymd(daysFromToday(50)));   // cierre, NO r1 (+90)
  });

  it("el eje de meses NO se estira por r2 (+400 días) — solo cubre lo que de verdad se dibuja", () => {
    // Ninguna barra visible pasa de "cierre" (+50); timeline_end debe quedar
    // cerca de ahí, muy lejos de r2 (+400, ~13 meses después).
    const diffDays = (new Date(data.timeline_end).getTime() - daysFromToday(50).getTime()) / 86_400_000;
    expect(diffDays).toBeLessThan(62); // a lo sumo el redondeo al mes siguiente, muy lejos de los +400 de r2
  });

  it("Fase 3: un rombo por hito de \"Desarrollo por iteraciones...\", posicionado por su Limit Date", () => {
    expect(hitos().map((p) => p.name)).toEqual(expect.arrayContaining(["Entregable 1", "Entregable 2", "Entregable 3", "Entregable atrasado"]));
    expect(hitos().find((p) => p.name === "Entregable 1")?.milestone).toBe(ymd(daysFromToday(-20))); // Limit Date, no Actual End (-18)
  });

  it("estado de cada hito: status crudo de Monday → color, salvo que esté vencido (siempre Atrasada)", () => {
    expect(hitos().find((p) => p.name === "Entregable 1")).toMatchObject({ status: "done", state: "Completada" });
    expect(hitos().find((p) => p.name === "Entregable 2")).toMatchObject({ status: "current", state: "En curso" });
    expect(hitos().find((p) => p.name === "Entregable 3")).toMatchObject({ status: "future", state: "A futuro" });
    // "Entregable atrasado" está "Working on it" mas vencido → Atrasada, no "En curso".
    expect(hitos().find((p) => p.name === "Entregable atrasado")).toMatchObject({ status: "late", state: "Atrasada" });
  });

  it("Causas de atraso: una fila por hito atrasado (no una por checkpoint)", () => {
    expect(data.atrasos.map((a) => a.hito)).toEqual(["Entregable atrasado"]);
    expect(data.atrasos[0].acargo).toBe("PM Step");
  });
});
