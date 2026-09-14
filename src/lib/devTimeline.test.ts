import { describe, it, expect } from "vitest";
import { buildDevTeamRoster, buildDevTimelines, classifyDev } from "./devTimeline";
import type { MondayItem, ProjBoard, ProjItem, ProjSubitem } from "@/types";

const board = (o: Partial<ProjBoard>): ProjBoard => o as ProjBoard;
const sub = (o: Partial<ProjSubitem>): ProjSubitem => o as ProjSubitem;
const step = (o: Partial<ProjItem>): ProjItem => ({ subitems: [], ...o }) as ProjItem;
const d = (s: string) => new Date(s);

// Un board con los 4 steps y un mismo hito (PMS ID PMO-1) en cada uno.
const boards = [board({ id: "b1", name: "Proyecto Alfa", pm: "Luis" })];
const stepsFor = (opts: {
  cpmStart?: string | null; reqTerminado?: string | null; analisis?: string | null;
  limit?: string | null; salida?: string | null;
  devStatus?: string; developer?: string;
}): ProjItem[] => [
  step({ boardId: "b1", boardName: "Proyecto Alfa", grupo: "Valuación | Formulación del proyecto",
    name: "Sponsor/CKU Valida Hitos (Entregable Hitos Docs Firmados)", cpmStart: opts.cpmStart ? d(opts.cpmStart) : null,
    subitems: [sub({ id: "sa", name: "Hito 1", pmsId: "PMO-1", actualEnd: opts.reqTerminado ? d(opts.reqTerminado) : null, deadline: null, status: "Done", developer: "" })] }),
  step({ boardId: "b1", boardName: "Proyecto Alfa", grupo: "Launch | Desarrollo",
    name: "Analisis técnico / Fechas estimadas de desarrollo (Costo DEV)",
    subitems: [sub({ id: "sb", name: "Hito 1", pmsId: "PMO-1", actualEnd: opts.analisis ? d(opts.analisis) : null, deadline: null, status: "Done", developer: "" })] }),
  step({ boardId: "b1", boardName: "Proyecto Alfa", grupo: "Launch | Desarrollo",
    name: "Desarrollo por iteraciones (Hitos) / Entregas CKU",
    subitems: [sub({ id: "sc", name: "Hito 1 dev", pmsId: "PMO-1",
      deadline: opts.limit ? d(opts.limit) : null, actualEnd: null,
      status: opts.devStatus ?? "Working on it", developer: opts.developer ?? "Ana" })] }),
  step({ boardId: "b1", boardName: "Proyecto Alfa", grupo: "Operación | Implementación",
    name: "Go live en producción",
    subitems: [sub({ id: "sd", name: "Hito 1", pmsId: "PMO-1", deadline: opts.salida ? d(opts.salida) : null, actualEnd: null, status: "Done", developer: "" })] }),
];

describe("buildDevTimelines", () => {
  it("une las 5 fechas del mismo hito (por PMS ID) tomadas de los 4 steps", () => {
    const rows = buildDevTimelines(
      stepsFor({ cpmStart: "2026-01-01", reqTerminado: "2026-01-10", analisis: "2026-02-01", limit: "2026-03-15", salida: "2026-03-20" }),
      boards,
    );
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.plantilla).toBe("vieja");
    expect(r.firmado).toEqual(d("2026-01-01"));       // Inicio: CPM del item "Sponsor/CKU Valida Hitos"
    expect(r.reqTerminado).toEqual(d("2026-01-10"));  // Req Terminado: Actual End del hito en ese mismo item
    expect(r.analisis).toEqual(d("2026-02-01"));
    expect(r.limit).toEqual(d("2026-03-15"));         // Entrega Desarrollo
    expect(r.entrega).toEqual(d("2026-03-20"));       // Salida en vivo: Limit Date del hito en "Go live en producción"
    expect(r.proyecto).toBe("Proyecto Alfa");
    expect(r.pm).toBe("Luis");
    expect(r.developer).toBe("Ana");
    expect(r.hito).toBe("Hito 1 dev"); // el nombre viene del step de iteraciones
  });

  it("Inicio (CPM) es el mismo para TODOS los hitos que comparten el item Valida Hitos", () => {
    const validaHitos = step({
      boardId: "b1", boardName: "Proyecto Alfa", grupo: "Valuación | Formulación del proyecto",
      name: "Sponsor/CKU Valida Hitos (Entregable Hitos Docs Firmados)", cpmStart: d("2026-01-01"),
      subitems: [
        sub({ id: "sa1", name: "Hito 1", pmsId: "PMO-1", actualEnd: null, deadline: null, status: "Done", developer: "" }),
        sub({ id: "sa2", name: "Hito 2", pmsId: "PMO-2", actualEnd: null, deadline: null, status: "Done", developer: "" }),
      ],
    });
    const devIter = step({
      boardId: "b1", boardName: "Proyecto Alfa", grupo: "Launch | Desarrollo",
      name: "Desarrollo por iteraciones (Hitos) / Entregas CKU",
      subitems: [
        sub({ id: "sc1", name: "Hito A", pmsId: "PMO-1", deadline: null, actualEnd: null, status: "Working on it", developer: "Ana" }),
        sub({ id: "sc2", name: "Hito B", pmsId: "PMO-2", deadline: null, actualEnd: null, status: "Working on it", developer: "Beto" }),
      ],
    });
    const rows = buildDevTimelines([validaHitos, devIter], boards);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.firmado?.getTime() === d("2026-01-01").getTime())).toBe(true);
  });

  it("Salida en vivo queda null si el hito no tiene subitem bajo \"Go live en producción\" (aunque esté Done)", () => {
    const rows = buildDevTimelines(
      stepsFor({ reqTerminado: "2026-01-10", analisis: "2026-02-01", limit: "2026-03-15", devStatus: "Done" }), // sin `salida`
      boards,
    );
    expect(rows[0].devPhase).toBe("done");
    expect(rows[0].entrega).toBeNull();
  });

  it("devPhase=done / enDesarrollo=false cuando el step de iteraciones está Done", () => {
    const rows = buildDevTimelines(stepsFor({ reqTerminado: "2026-01-10", devStatus: "Done", salida: "2026-03-20" }), boards);
    expect(rows[0].devPhase).toBe("done");
    expect(rows[0].enDesarrollo).toBe(false);
  });

  it("devPhase=working / enDesarrollo=true cuando el step está Working on it", () => {
    const rows = buildDevTimelines(stepsFor({ reqTerminado: "2026-01-10", devStatus: "Working on it" }), boards);
    expect(rows[0].devPhase).toBe("working");
    expect(rows[0].enDesarrollo).toBe(true);
    expect(rows[0].entrega).toBeNull();
  });

  it("devPhase=future / enDesarrollo=false cuando el step es Future Steps (no iniciado)", () => {
    const rows = buildDevTimelines(stepsFor({ reqTerminado: "2026-01-10", devStatus: "Future Steps" }), boards);
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

describe("buildDevTimelines (plantilla nueva: item = hito, subitem = step, una fila por item)", () => {
  const boardsNew = [board({ id: "b2", name: "PM-010 | AIR & SEA", pm: "Cesar" })];
  const roster = new Set(["javier aragon", "kelvyn magzul"]);

  const hitoNuevo = (opts: {
    cpmStart?: string | null;
    reqTerminado?: { name: string; limit: string }[];
    analisis?: { name: string; limit: string; responsible?: string }[];
    iteraciones?: { name: string; responsible: string; status?: string; limit?: string }[];
    salida?: { name: string; limit: string }[];
  }): ProjItem => step({
    boardId: "b2", boardName: "PM-010 | AIR & SEA", grupo: "Launch | Lanzamiento",
    name: "Clasificación SAC con IA", cpmStart: opts.cpmStart ? d(opts.cpmStart) : null,
    subitems: [
      ...(opts.reqTerminado ?? []).map((it, i) => sub({ id: `rt${i}`, name: it.name, deadline: d(it.limit), status: "Done", responsible: "", developer: "" })),
      ...(opts.analisis ?? []).map((it, i) => sub({ id: `an${i}`, name: it.name, deadline: d(it.limit), status: "Done", responsible: it.responsible ?? "", developer: "" })),
      ...(opts.iteraciones ?? []).map((it, i) => sub({
        id: `it${i}`, name: it.name,
        deadline: it.limit ? d(it.limit) : null,
        status: it.status ?? "Working on it", responsible: it.responsible, developer: "",
      })),
      ...(opts.salida ?? []).map((it, i) => sub({ id: `sv${i}`, name: it.name, deadline: d(it.limit), status: "Done", responsible: "", developer: "" })),
    ],
  });

  it("arma una fila por item con las 5 fechas (inicio CPM, Req Terminado, análisis, iteraciones, salida en vivo)", () => {
    const rows = buildDevTimelines(
      [hitoNuevo({
        cpmStart: "2026-01-01",
        reqTerminado: [{ name: "Req Terminado \"Exento de IVA\"", limit: "2026-01-10" }],
        analisis: [{ name: "Analisis tecnico (Fecha entrega Dev)", limit: "2026-01-20" }],
        iteraciones: [{ name: "Desarrollo por iteraciones +QA (1)", responsible: "Kelvyn Magzul", limit: "2026-02-01" }],
        salida: [{ name: "Salida en vivo", limit: "2026-02-15" }],
      })],
      boardsNew, roster,
    );
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.plantilla).toBe("nueva");
    expect(r.hito).toBe("Clasificación SAC con IA");
    expect(r.developer).toBe("Kelvyn Magzul");
    expect(r.firmado).toEqual(d("2026-01-01"));       // Inicio = CPM Start Date del item
    expect(r.reqTerminado).toEqual(d("2026-01-10"));
    expect(r.analisis).toEqual(d("2026-01-20"));
    expect(r.limit).toEqual(d("2026-02-01"));
    expect(r.entrega).toEqual(d("2026-02-15"));         // Salida en vivo
    expect(r.proyecto).toBe("PM-010 | AIR & SEA");
    expect(r.pm).toBe("Cesar");
  });

  it("excluye el hito si NINGÚN subitem tiene Responsible en el roster RH", () => {
    const rows = buildDevTimelines(
      [hitoNuevo({ iteraciones: [{ name: "Desarrollo por iteraciones +QA (1)", responsible: "Sponsor Externo" }] })],
      boardsNew, roster,
    );
    expect(rows).toEqual([]);
  });

  it("incluye el hito si el Responsible en el roster está en OTRO subitem (no el de iteraciones) — común: el step de iteraciones viene sin Responsible propio", () => {
    const rows = buildDevTimelines(
      [hitoNuevo({
        analisis: [{ name: "Analisis tecnico (Fecha entrega Dev)", limit: "2026-01-20", responsible: "Javier Aragon" }],
        iteraciones: [{ name: "Desarrollo por iteraciones +QA (1)", responsible: "", limit: "2026-02-01" }],
      })],
      boardsNew, roster,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].developer).toBe("Javier Aragon"); // fallback: el Responsible de "Analisis tecnico"
  });

  it("con varios 'Req Terminado'/iteraciones para distintos requerimientos, toma el Limit Date más tardío de cada categoría", () => {
    const rows = buildDevTimelines(
      [hitoNuevo({
        reqTerminado: [
          { name: "Req Terminado \"Exento de IVA\"", limit: "2026-01-10" },
          { name: "Req Terminado Fixes al sistema", limit: "2026-03-01" }, // el más tardío
        ],
        iteraciones: [
          { name: "Desarrollo por iteraciones +QA", responsible: "Javier Aragon", limit: "2026-02-01" },
          { name: "Desarrollo por iteraciones +QA", responsible: "Kelvyn Magzul", limit: "2026-03-15" }, // el más tardío
        ],
      })],
      boardsNew, roster,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].reqTerminado).toEqual(d("2026-03-01"));
    expect(rows[0].limit).toEqual(d("2026-03-15"));
    expect(rows[0].developer).toBe("Kelvyn Magzul"); // el del step de iteraciones elegido (más tardío)
  });

  it("reconoce 'Requerimiento terminado' (variante de nombre de PM-013) como Req Terminado", () => {
    const rows = buildDevTimelines(
      [hitoNuevo({
        reqTerminado: [{ name: "Requerimiento terminado", limit: "2026-01-10" }],
        iteraciones: [{ name: "Desarrollo por iteraciones +QA (1)", responsible: "Javier Aragon", limit: "2026-02-01" }],
      })],
      boardsNew, roster,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].reqTerminado).toEqual(d("2026-01-10"));
  });

  it("tolera el typo 'Desarollo por iteraciones' (sin la primera 'r')", () => {
    const rows = buildDevTimelines(
      [hitoNuevo({ iteraciones: [{ name: "Desarollo por iteraciones + QA", responsible: "Javier Aragon", limit: "2026-02-01" }] })],
      boardsNew, roster,
    );
    expect(rows).toHaveLength(1);
  });

  it("sin 'Req Terminado' ni 'Salida en vivo' (hito aún no llega a esas etapas), esos campos quedan null", () => {
    const rows = buildDevTimelines(
      [hitoNuevo({ iteraciones: [{ name: "Desarrollo por iteraciones +QA (1)", responsible: "Javier Aragon", limit: "2026-02-01" }] })],
      boardsNew, roster,
    );
    expect(rows[0].reqTerminado).toBeNull();
    expect(rows[0].entrega).toBeNull();
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
