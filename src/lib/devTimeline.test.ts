import { describe, it, expect } from "vitest";
import { buildDevTeamRoster, buildDevTimelines, classifyDev } from "./devTimeline";
import type { MondayItem, ProjBoard, ProjItem, ProjSubitem } from "@/types";

const board = (o: Partial<ProjBoard>): ProjBoard => o as ProjBoard;
const sub = (o: Partial<ProjSubitem>): ProjSubitem => o as ProjSubitem;
const step = (o: Partial<ProjItem>): ProjItem => ({ subitems: [], ...o }) as ProjItem;
const d = (s: string) => new Date(s);

// Un board con los 3 steps y un mismo hito (PMS ID PMO-1) en cada uno.
const boards = [board({ id: "b1", name: "Proyecto Alfa", pm: "Luis" })];
const stepsFor = (opts: {
  firmado?: string | null; analisis?: string | null; limit?: string | null; entrega?: string | null;
  devStatus?: string; developer?: string;
}): ProjItem[] => [
  step({ boardId: "b1", boardName: "Proyecto Alfa", grupo: "Valuación | Formulación del proyecto",
    name: "Sponsor/CKU Valida Hitos (Entregable Hitos Docs Firmados)",
    subitems: [sub({ id: "sa", name: "Hito 1", pmsId: "PMO-1", actualEnd: opts.firmado ? d(opts.firmado) : null, deadline: null, status: "Done", developer: "" })] }),
  step({ boardId: "b1", boardName: "Proyecto Alfa", grupo: "Launch | Desarrollo",
    name: "Analisis técnico / Fechas estimadas de desarrollo (Costo DEV)",
    subitems: [sub({ id: "sb", name: "Hito 1", pmsId: "PMO-1", actualEnd: opts.analisis ? d(opts.analisis) : null, deadline: null, status: "Done", developer: "" })] }),
  step({ boardId: "b1", boardName: "Proyecto Alfa", grupo: "Launch | Desarrollo",
    name: "Desarrollo por iteraciones (Hitos) / Entregas CKU",
    subitems: [sub({ id: "sc", name: "Hito 1 dev", pmsId: "PMO-1",
      deadline: opts.limit ? d(opts.limit) : null, actualEnd: opts.entrega ? d(opts.entrega) : null,
      status: opts.devStatus ?? "Working on it", developer: opts.developer ?? "Ana" })] }),
];

describe("buildDevTimelines", () => {
  it("une las 4 fechas del mismo hito (por PMS ID) tomadas de los 3 steps", () => {
    const rows = buildDevTimelines(
      stepsFor({ firmado: "2026-01-10", analisis: "2026-02-01", limit: "2026-03-15", entrega: "2026-03-20" }),
      boards,
    );
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.firmado).toEqual(d("2026-01-10"));
    expect(r.analisis).toEqual(d("2026-02-01"));
    expect(r.limit).toEqual(d("2026-03-15"));
    expect(r.entrega).toEqual(d("2026-03-20"));
    expect(r.proyecto).toBe("Proyecto Alfa");
    expect(r.pm).toBe("Luis");
    expect(r.developer).toBe("Ana");
    expect(r.hito).toBe("Hito 1 dev"); // el nombre viene del step de iteraciones
  });

  it("devPhase=done / enDesarrollo=false cuando el step de iteraciones está Done", () => {
    const rows = buildDevTimelines(stepsFor({ firmado: "2026-01-10", devStatus: "Done", entrega: "2026-03-20" }), boards);
    expect(rows[0].devPhase).toBe("done");
    expect(rows[0].enDesarrollo).toBe(false);
  });

  it("devPhase=working / enDesarrollo=true cuando el step está Working on it", () => {
    const rows = buildDevTimelines(stepsFor({ firmado: "2026-01-10", devStatus: "Working on it" }), boards);
    expect(rows[0].devPhase).toBe("working");
    expect(rows[0].enDesarrollo).toBe(true);
    expect(rows[0].entrega).toBeNull();
  });

  it("devPhase=future / enDesarrollo=false cuando el step es Future Steps (no iniciado)", () => {
    const rows = buildDevTimelines(stepsFor({ firmado: "2026-01-10", devStatus: "Future Steps" }), boards);
    expect(rows[0].devPhase).toBe("future");
    expect(rows[0].enDesarrollo).toBe(false);
  });

  it("excluye hitos sin step de \"Desarrollo por iteraciones\" (aún no están en desarrollo)", () => {
    const soloValida = [step({ boardId: "b1", boardName: "Proyecto Alfa", grupo: "Valuación | Formulación del proyecto",
      name: "Sponsor/CKU Valida Hitos (Entregable Hitos Docs Firmados)",
      subitems: [sub({ id: "sa", name: "Hito 2", pmsId: "PMO-2", actualEnd: d("2026-01-10"), deadline: null, status: "Done", developer: "" })] })];
    expect(buildDevTimelines(soloValida, boards)).toEqual([]);
  });

  it("separa hitos distintos por PMS ID y atribuye el PM/proyecto del board", () => {
    const steps = [
      step({ boardId: "b1", boardName: "Proyecto Alfa", grupo: "Launch | Desarrollo",
        name: "Desarrollo por iteraciones (Hitos) / Entregas CKU",
        subitems: [
          sub({ id: "s1", name: "Hito A", pmsId: "PMO-1", deadline: d("2026-03-01"), actualEnd: null, status: "Working on it", developer: "Ana" }),
          sub({ id: "s2", name: "Hito B", pmsId: "PMO-2", deadline: d("2026-04-01"), actualEnd: null, status: "Working on it", developer: "Beto" }),
        ] }),
    ];
    const rows = buildDevTimelines(steps, boards).sort((a, b) => a.hito.localeCompare(b.hito));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.developer)).toEqual(["Ana", "Beto"]);
    expect(rows.every((r) => r.pm === "Luis" && r.proyecto === "Proyecto Alfa")).toBe(true);
  });
});

describe("buildDevTimelines (plantilla nueva: item = hito, subitem = step)", () => {
  const boardsNew = [board({ id: "b2", name: "PM-010 | AIR & SEA", pm: "Cesar" })];
  const roster = new Set(["javier aragon", "kelvyn magzul"]);

  const hitoNuevo = (opts: {
    analisisResp?: string; iteraciones?: { name: string; responsible: string; status?: string; limit?: string; entrega?: string }[];
  }): ProjItem => step({
    boardId: "b2", boardName: "PM-010 | AIR & SEA", grupo: "Launch | Lanzamiento",
    name: "Clasificación SAC con IA",
    subitems: [
      sub({ id: "an", name: "Analisis tecnico (Fecha entrega Dev)", pmsId: "PMO-1-1",
        actualEnd: d("2026-01-15"), deadline: null, status: "Done",
        responsible: opts.analisisResp ?? "Javier Aragon", developer: "" }),
      ...(opts.iteraciones ?? []).map((it, i) => sub({
        id: `it${i}`, name: it.name, pmsId: `PMO-1-${i + 2}`,
        deadline: it.limit ? d(it.limit) : null, actualEnd: it.entrega ? d(it.entrega) : null,
        status: it.status ?? "Working on it", responsible: it.responsible, developer: "",
      })),
    ],
  });

  it("incluye el hito cuando el step de iteraciones tiene Responsible del roster RH", () => {
    const rows = buildDevTimelines(
      [hitoNuevo({ iteraciones: [{ name: "Desarrollo por iteraciones +QA (1)", responsible: "Kelvyn Magzul", limit: "2026-03-01", entrega: "2026-03-05" }] })],
      boardsNew, roster,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].hito).toBe("Clasificación SAC con IA");
    expect(rows[0].developer).toBe("Kelvyn Magzul");
    expect(rows[0].analisis).toEqual(d("2026-01-15")); // tomado del step "Analisis tecnico" del mismo item
    expect(rows[0].limit).toEqual(d("2026-03-01"));
    expect(rows[0].entrega).toEqual(d("2026-03-05"));
    expect(rows[0].firmado).toBeNull(); // sin equivalente en la plantilla nueva
    expect(rows[0].proyecto).toBe("PM-010 | AIR & SEA");
    expect(rows[0].pm).toBe("Cesar");
  });

  it("excluye el hito si el Responsible del step de iteraciones NO está en el roster RH", () => {
    const rows = buildDevTimelines(
      [hitoNuevo({ iteraciones: [{ name: "Desarrollo por iteraciones +QA (1)", responsible: "Sponsor Externo" }] })],
      boardsNew, roster,
    );
    expect(rows).toEqual([]);
  });

  it("emite una fila por cada iteración del mismo hito con Responsible en el roster", () => {
    const rows = buildDevTimelines(
      [hitoNuevo({ iteraciones: [
        { name: "Desarrollo por iteraciones +QA (1)", responsible: "Javier Aragon" },
        { name: "Desarrollo por iteraciones +QA (2)", responsible: "Kelvyn Magzul" },
      ] })],
      boardsNew, roster,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.developer).sort()).toEqual(["Javier Aragon", "Kelvyn Magzul"]);
  });

  it("tolera el typo 'Desarollo por iteraciones' (sin la primera 'r')", () => {
    const rows = buildDevTimelines(
      [hitoNuevo({ iteraciones: [{ name: "Desarollo por iteraciones + QA", responsible: "Javier Aragon" }] })],
      boardsNew, roster,
    );
    expect(rows).toHaveLength(1);
  });

  it("no confunde un item de la plantilla vieja con uno de la nueva (mismo grupo Launch)", () => {
    // Item de la plantilla VIEJA en grupo "Launch | Lanzamiento": su nombre no matchea
    // ningún step de la nueva y sus subitems son hitos (no steps) → no genera filas nuevas.
    const itemViejo = step({
      boardId: "b2", boardName: "PM-010 | AIR & SEA", grupo: "Launch | Lanzamiento",
      name: "Value Gate (BC) Actualizado y firmado",
      subitems: [sub({ id: "x", name: "Modulo File Tablero", pmsId: "PMO-9", responsible: "Javier Aragon", status: "Done", deadline: null, actualEnd: null, developer: "" })],
    });
    expect(buildDevTimelines([itemViejo], boardsNew, roster)).toEqual([]);
  });
});

describe("buildDevTeamRoster", () => {
  const hrItem = (name: string, groupTitle: string): MondayItem =>
    ({ id: name, name, group: { title: groupTitle }, column_values: [] }) as MondayItem;

  it("junta los nombres (normalizados) de Equipo Desarrollo Interno + Externo", () => {
    const roster = buildDevTeamRoster([
      hrItem("Javier Aragón", "Equipo Desarrollo Interno"),
      hrItem("Kelvyn Magzul", "Equipo Desarrollo Externo"),
      hrItem("Evelyn Vega", "Sponsor"),
    ]);
    expect(roster.has("javier aragon")).toBe(true); // sin acento, minúsculas
    expect(roster.has("kelvyn magzul")).toBe(true);
    expect(roster.has("evelyn vega")).toBe(false);
    expect(roster.size).toBe(2);
  });
});

describe("classifyDev", () => {
  it("mapea Done→done, Working on it→working, Future Steps/vacío/Not Started→future", () => {
    expect(classifyDev("Done")).toBe("done");
    expect(classifyDev("Working on it")).toBe("working");
    expect(classifyDev("Stuck")).toBe("working");   // activo, no iniciado ni terminado
    expect(classifyDev("Future Steps")).toBe("future");
    expect(classifyDev("Not Started")).toBe("future");
    expect(classifyDev("")).toBe("future");
  });
});
