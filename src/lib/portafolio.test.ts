import { describe, it, expect, vi } from "vitest";
import type { BoardHealthData } from "@/lib/proj";
import type { DashboardData, ProjItem, ProjSubitem, ReqItem } from "@/types";

// La fase y si un proyecto está completo salen de reglas de Monday con sus propias pruebas.
vi.mock("@/lib/projSummary", () => ({
  buildProjectSummary: (items: { grupo: string; completo?: boolean }[]) => ({
    completion: { isComplete: items.length > 0 && items.every((i) => i.completo) },
    phases: items.length ? [{ grupo: items[0].grupo }] : [],
  }),
  currentPhaseIndex: (phases: unknown[]) => (phases.length ? 0 : -1),
}));

vi.mock("@/lib/ini", () => ({
  calcIniPMHealth: (pm: string) => (pm === "Luis" ? { index: 0.8, total: 2 } : pm === "David" ? { index: 1, total: 1 } : { index: 1, total: 0 }),
}));

import {
  actividadesPortafolio, atrasosAbiertos, avancePorProyecto, conteoGravedad, conteoSalud, curvaPlanReal,
  elementosPortafolio, gravedadAtraso, partesEvmPortafolio, pasaFiltros, proximosHitos, resumenGerencial,
  saludIniciativas, SIN_FILTROS_PORTAFOLIO, type ActividadPortafolio,
} from "./portafolio";

const d = (s: string) => new Date(`${s}T00:00:00`);
const HOY = d("2026-11-04"); // miércoles

const sub = (id: string, o: Partial<ProjSubitem> = {}): ProjSubitem => ({
  id, name: `Hito ${id}`, pmsId: "", status: "Future Steps", person: "", responsible: "Ana Dev", developer: "", tld: "",
  deadline: null, estado: "EN TIEMPO", startDate: null, actualEnd: null, newLimitDate: null, entrega: null, cost: 0, benefit: 0, ...o,
});

const item = (boardId: string, id: string, o: Partial<ProjItem> & { completo?: boolean } = {}) => ({
  boardId, boardName: "", id, name: `Step ${id}`, grupo: "L | Launch", pm: "", resp: "", responsible: "Resp Item", status: "Future Steps",
  deadline: null, startDate: null, cpmStart: null, endDate: null, entrega: null, cost: 0, benefit: 0, valueNet: 0, estado: "EN TIEMPO",
  subitems: [], ...o,
}) as ProjItem;

const pml = (id: string, o: Partial<ReqItem> = {}) => ({
  id, name: `Req ${id}`, grupo: "Desarrollo", pm: "Luis", resp: "Resp PML", status: "", estrategia: "Estrategia Uno", cku: "",
  estado: "EN TIEMPO", deadline: null, vem: 0.9, ...o,
}) as ReqItem;

const data = {
  clases: { b2: { clase: "A", by: "x", at: "" } },
  estrategiaMap: new Map([["estrategia uno", { uNeg: "Aduanas", pais: "GT", sponsor: "" }]]),
  projBoards: [
    { id: "b1", name: "PM-016 | Segundo", pm: "Luis", estrategia: "Estrategia Uno" },
    { id: "b2", name: "PM-004 | Primero", pm: "David" },
    { id: "b3", name: "PM-020 | Cerrado", pm: "Luis" },
  ],
  proj: [
    item("b1", "i1", { subitems: [
      sub("s1", { status: "Done", deadline: d("2026-10-20"), actualEnd: d("2026-10-30") }),
      sub("s2", { status: "Working on it", deadline: d("2026-10-21"), estado: "ATRASADO" }),
      sub("s3", { status: "Working on it", deadline: d("2026-11-06"), newLimitDate: d("2026-11-10") }),
    ] }),
    item("b2", "i2", { grupo: "A | Aprobación", deadline: d("2026-11-05") }),
    item("b3", "i3", { completo: true, status: "Done", deadline: d("2026-01-01") }),
  ],
  req: [
    pml("PML-10", { grupo: "Aprobación", vem: 0.7, deadline: d("2026-10-01"), estado: "ATRASADO" }),
    pml("PML-2", { pm: "David", estrategia: "", vem: null }),
    pml("PML-3", { grupo: "REQ Cerrados", estado: "CERRADO" }),
  ],
} as unknown as DashboardData;

const salud = new Map<string, BoardHealthData>([
  ["b1", { healthIndex: 0.96 } as BoardHealthData],
  ["b2", { healthIndex: 0.85 } as BoardHealthData],
  ["b3", { healthIndex: 1 } as BoardHealthData],
]);

const elementos = elementosPortafolio(data, salud);
const actividades = actividadesPortafolio(elementos, data.proj, data.req);
const el = (id: string) => elementos.find((e) => e.id === id)!;

describe("elementosPortafolio", () => {
  it("todos los proyectos (también los completos) y solo los PML activos, proyectos primero", () => {
    expect(elementos.map((e) => e.id)).toEqual(["b2", "b1", "b3", "PML-2", "PML-10"]);
  });

  it("proyecto: código, nombre, clase, Unidad de Negocio de su Estrategia, salud y fase", () => {
    expect(el("b1")).toMatchObject({
      tipo: "proyecto", codigo: "PM-016", nombre: "Segundo", pm: "Luis", clase: "Sin clasificar", uNeg: "Aduanas",
      healthIndex: 0.96, salud: "on-track", fase: "Launch", completo: false,
    });
    expect(el("b2")).toMatchObject({ clase: "A", salud: "off-track", fase: "Aprobación", uNeg: "" });
    expect(el("b3")).toMatchObject({ completo: true, fase: "Completado" });
  });

  it("PML: su VEM es la salud, su grupo la fase y su clase por defecto C", () => {
    expect(el("PML-10")).toMatchObject({ tipo: "pml", clase: "C", healthIndex: 0.7, salud: "off-track", fase: "Aprobación", uNeg: "Aduanas" });
    expect(el("PML-2")).toMatchObject({ healthIndex: null, salud: null, uNeg: "" });
  });
});

describe("actividadesPortafolio", () => {
  it("un hito por subitem, el item si no tiene hitos, una por PML; nada de lo completo", () => {
    expect(actividades.map((a) => a.id)).toEqual(["s1", "s2", "s3", "i2", "PML-10", "PML-2"]);
  });

  it("lleva la fase sin letra, el responsable y las fechas del hito", () => {
    expect(actividades.find((a) => a.id === "s3")).toMatchObject({
      codigo: "PM-016", elemento: "Segundo", fase: "Launch", responsable: "Ana Dev",
      limite: d("2026-11-06"), nuevaFecha: d("2026-11-10"), done: false,
    });
    expect(actividades.find((a) => a.id === "PML-10")).toMatchObject({ tipo: "pml", nombre: "Fase Aprobación", responsable: "Resp PML", done: false });
  });
});

describe("filtros", () => {
  it("sin filtros pasa todo; por tipo, PM, clase y Unidad de Negocio", () => {
    expect(elementos.every((e) => pasaFiltros(e, SIN_FILTROS_PORTAFOLIO))).toBe(true);
    const ids = (f: Partial<typeof SIN_FILTROS_PORTAFOLIO>) =>
      elementos.filter((e) => pasaFiltros(e, { ...SIN_FILTROS_PORTAFOLIO, ...f })).map((e) => e.id);
    expect(ids({ tipo: "pml" })).toEqual(["PML-2", "PML-10"]);
    expect(ids({ pm: ["David"] })).toEqual(["b2", "PML-2"]);
    expect(ids({ clase: ["A", "C"] })).toEqual(["b2", "PML-2", "PML-10"]);
    expect(ids({ uNeg: ["Aduanas"] })).toEqual(["b1", "PML-10"]);
  });

  it("ignorar una dimensión la deja fuera (para contar las opciones de su filtro)", () => {
    expect(pasaFiltros(el("b1"), { ...SIN_FILTROS_PORTAFOLIO, pm: ["David"] }, "pm")).toBe(true);
  });
});

describe("KPI", () => {
  it("conteoSalud cuenta solo lo activo", () => {
    expect(conteoSalud(elementos)).toEqual({ onTrack: 1, inRisk: 0, offTrack: 2, sinDatos: 1, total: 4 });
  });

  it("saludIniciativas promedia a los PMs que tienen Iniciativas", () => {
    expect(saludIniciativas(["Luis", "David", "Ana"], [], new Map())).toBeCloseTo(0.9);
    expect(saludIniciativas(["Ana"], [], new Map())).toBeNull();
  });

  it("partesEvmPortafolio promedia por clase, con los completos y sin lo «Sin clasificar»", () => {
    // A: b2 0.85 · C: PML-10 0.7 (PML-2 sin nota) · b1 y b3 sin clasificar no cuentan.
    expect(partesEvmPortafolio(0.5, elementos)).toEqual({ ini: 0.5, A: 0.85, B: null, C: 0.7 });
  });
});

describe("atrasos", () => {
  it("gravedad: más de 10 días alta, de 5 a 10 media, menos de 5 baja", () => {
    expect([11, 10, 5, 4, 0].map(gravedadAtraso)).toEqual(["alta", "media", "media", "baja", "baja"]);
  });

  it("solo lo abierto y ATRASADO, en días hábiles desde su Limit Date, el peor primero", () => {
    const at = atrasosAbiertos(actividades, HOY);
    expect(at.map((a) => [a.id, a.dias, a.gravedad])).toEqual([["PML-10", 23, "alta"], ["s2", 10, "media"]]);
    expect(conteoGravedad(at)).toEqual({ alta: 1, media: 1, baja: 0 });
  });
});

describe("curvaPlanReal", () => {
  const a = (o: Partial<ActividadPortafolio>) => ({ tipo: "proyecto", done: false, limite: null, fin: null, ...o }) as ActividadPortafolio;
  const acts = [
    a({ limite: d("2026-10-20"), done: true, fin: d("2026-10-22") }),
    a({ limite: d("2026-10-27"), done: true, fin: null }), // Done sin fecha → cerrada desde siempre
    a({ limite: d("2026-11-03") }),
    a({ limite: d("2026-11-12") }),
    a({ tipo: "pml", limite: d("2026-10-01") }), // los PML no entran
  ];

  it("semanas cerradas en domingo; plan por Limit Date y real por fecha de cierre; sin real a futuro", () => {
    const c = curvaPlanReal(acts, HOY, 2, 1);
    expect(c.map((p) => [p.semana.getDate(), p.plan, p.real])).toEqual([
      [25, 25, 50],   // 25 oct: solo vencía la del 20; ya estaban cerradas dos
      [1, 50, 50],   // 1 nov: el 3 nov aún no vence
      [8, 75, 50],   // semana actual
      [15, 100, null],
    ]);
  });

  it("sin actividades de proyecto con fecha no hay curva", () => {
    expect(curvaPlanReal([a({ tipo: "pml", limite: d("2026-10-01") })], HOY)).toEqual([]);
  });
});

describe("avancePorProyecto", () => {
  it("cada actividad en un solo grupo: Done, Atrasada, En curso o Pendiente", () => {
    expect(avancePorProyecto(actividades)).toEqual([
      { id: "b2", codigo: "PM-004", nombre: "Primero", done: 0, enCurso: 0, atrasadas: 0, pendientes: 1, total: 1 },
      { id: "b1", codigo: "PM-016", nombre: "Segundo", done: 1, enCurso: 1, atrasadas: 1, pendientes: 0, total: 3 },
    ]);
  });
});

describe("proximosHitos y resumen gerencial", () => {
  it("lo abierto que vence en la ventana, por la fecha vigente (la nueva si se movió)", () => {
    expect(proximosHitos(actividades, HOY).map((a) => a.id)).toEqual(["i2", "s3"]);
    expect(proximosHitos(actividades, HOY, 3).map((a) => a.id)).toEqual(["i2"]);
  });

  it("logros de los últimos 7 días, peores riesgos, lo que espera Aprobación y el foco de la semana", () => {
    const r = resumenGerencial(elementos, actividades, HOY);
    expect(r.logros).toEqual({ cerradas: 1, top: [{ codigo: "PM-016", nombre: "Segundo", n: 1 }] });
    expect(r.riesgos.map((e) => e.id)).toEqual(["PML-10", "b2"]);
    expect(r.decisiones.map((e) => e.id)).toEqual(["b2", "PML-10"]);
    expect(r.foco).toBe(2);
  });
});
