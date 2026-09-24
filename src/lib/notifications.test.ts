import { describe, it, expect } from "vitest";
import { buildTodoNotifications } from "./notifications";
import { today } from "./business";
import type { DashboardData, DirectorioEntry, IniItem, ProjItem, ReqItem } from "@/types";

const ME = { email: "ana@empresa.com", displayName: "Ana Pérez" };

const ini = (o: Partial<IniItem>): IniItem => ({
  id: "i1", name: "Ini", grupo: "New", pm: "Ana Pérez", status: "New", benefit: "",
  estado: "EN TIEMPO", dias: null, limite: null, deadline: null, creacion: null,
  ...o,
}) as IniItem;

const req = (o: Partial<ReqItem>): ReqItem => ({
  id: "r1", name: "Req", grupo: "Valuación", pm: "Ana Pérez", resp: "", status: "En Proceso",
  estado: "EN TIEMPO", deadline: null,
  ...o,
}) as ReqItem;

const proj = (o: Partial<ProjItem>): ProjItem => ({
  boardId: "b1", boardName: "PM-001 | Alfa", id: "p1", name: "Item", grupo: "Fase",
  pm: "Ana Pérez", resp: "", responsible: "", status: "Working on it", deadline: null,
  estado: "EN TIEMPO", entrega: null, subitems: [], cost: 0, benefit: 0, valueNet: 0,
  ...o,
}) as ProjItem;

const directorio: DirectorioEntry[] = [{ name: "Ana Pérez", email: "ana@empresa.com" }];

const daysFromToday = (n: number): Date => {
  const d = today();
  d.setDate(d.getDate() + n);
  return d;
};

const mkData = (o: Partial<DashboardData>): DashboardData => ({
  ini: [], req: [], proj: [], projBoards: [], projItemBaselines: {}, calMap: new Map(),
  nps: { nps: null, promoters: 0, passives: 0, detractors: 0, total: 0, responses: [], questions: [], overallAvg: null },
  npsRecords: [], delayAttributions: {}, reprocesoAttributions: {}, atrasoDetalles: {},
  boardAlcance: {}, directorio, devTeamRoster: new Set(), estrategiaMap: new Map(),
  reminderMap: new Map(), fetchedAt: new Date(),
  ...o,
}) as DashboardData;

describe("buildTodoNotifications", () => {
  it("clasifica por rango de fecha: atrás / hoy / adelante", () => {
    const data = mkData({
      proj: [
        proj({ id: "p-atras", name: "Vencido hace 2d", deadline: daysFromToday(-2), status: "Working on it" }),
        proj({ id: "p-hoy", name: "Vence hoy", deadline: daysFromToday(0), status: "Working on it" }),
        proj({ id: "p-adelante", name: "Vence en 3d", deadline: daysFromToday(3), status: "Working on it" }),
        proj({ id: "p-fuera", name: "Fuera de rango", deadline: daysFromToday(10), status: "Working on it" }),
      ],
    });
    const b = buildTodoNotifications(data, ME);
    expect(b.atras.map((n) => n.name)).toEqual(["Vencido hace 2d"]);
    expect(b.hoy.map((n) => n.name)).toEqual(["Vence hoy"]);
    expect(b.adelante.map((n) => n.name)).toEqual(["Vence en 3d"]);
  });

  it("excluye Done de hoy/adelante pero lo incluye en atrás", () => {
    const data = mkData({
      proj: [
        proj({ id: "p1", name: "Done pasado", deadline: daysFromToday(-1), status: "Done" }),
        proj({ id: "p2", name: "Done hoy", deadline: daysFromToday(0), status: "Done" }),
        proj({ id: "p3", name: "Done futuro", deadline: daysFromToday(2), status: "Done" }),
      ],
    });
    const b = buildTodoNotifications(data, ME);
    expect(b.atras.map((n) => n.name)).toEqual(["Done pasado"]);
    expect(b.atras[0].done).toBe(true);
    expect(b.hoy).toHaveLength(0);
    expect(b.adelante).toHaveLength(0);
  });

  it("filtra por PM: solo lo del usuario logueado", () => {
    const data = mkData({
      proj: [
        proj({ id: "mio", name: "Mío", pm: "Ana Pérez", deadline: daysFromToday(0) }),
        proj({ id: "otro", name: "De otro", pm: "Carlos Ruiz", deadline: daysFromToday(0) }),
      ],
    });
    const b = buildTodoNotifications(data, ME);
    expect(b.hoy.map((n) => n.name)).toEqual(["Mío"]);
  });

  it("resuelve el nombre por EMAIL vía el directorio, ignorando el displayName del login", () => {
    const data = mkData({
      proj: [proj({ id: "p1", name: "Vía directorio", pm: "Ana Pérez", deadline: daysFromToday(0) })],
    });
    // displayName totalmente distinto al nombre real — el match debe salir
    // del email resuelto contra el Directorio RH, no de este campo.
    const b = buildTodoNotifications(data, { email: "ana@empresa.com", displayName: "cualquier-cosa" });
    expect(b.hoy.map((n) => n.name)).toEqual(["Vía directorio"]);
  });

  it("si el email no está en el directorio, cae al displayName como último recurso", () => {
    const data = mkData({
      proj: [proj({ id: "p1", name: "Sin directorio", pm: "Carlos Ruiz", deadline: daysFromToday(0) })],
    });
    const b = buildTodoNotifications(data, { email: "carlos@fuera-de-rh.com", displayName: "Carlos Ruiz" });
    expect(b.hoy.map((n) => n.name)).toEqual(["Sin directorio"]);
  });

  it("soporta PM multi-persona separado por coma", () => {
    const data = mkData({
      proj: [proj({ id: "p1", name: "Compartido", pm: "Carlos Ruiz, Ana Pérez", deadline: daysFromToday(0) })],
    });
    const b = buildTodoNotifications(data, ME);
    expect(b.hoy.map((n) => n.name)).toEqual(["Compartido"]);
  });

  it("los hitos (subitems) heredan el PM del item padre", () => {
    const data = mkData({
      proj: [
        proj({
          id: "p1", name: "Proyecto", pm: "Ana Pérez",
          subitems: [{ id: "h1", name: "Hito 1", status: "Working on it", deadline: daysFromToday(0) } as ProjItem["subitems"][number]],
        }),
      ],
    });
    const b = buildTodoNotifications(data, ME);
    expect(b.hoy.map((n) => n.name)).toEqual(["Hito 1"]);
    expect(b.hoy[0].context).toBe("Alfa · Proyecto");
  });

  it("Iniciativas: solo cuenta con deadline (funnel activo) y usa el status crudo", () => {
    const data = mkData({
      ini: [ini({ id: "i1", name: "Revisar", status: "Meeting 1", deadline: daysFromToday(0) })],
    });
    const b = buildTodoNotifications(data, ME);
    expect(b.hoy).toHaveLength(1);
    expect(b.hoy[0].board).toBe("Iniciativas");
    expect(b.hoy[0].status).toBe("Meeting 1");
    expect(b.hoy[0].href).toBe(`/iniciativas?pm=${encodeURIComponent("Ana Pérez")}`);
  });

  it("PML: Cerrado cuenta como done", () => {
    const data = mkData({
      req: [
        req({ id: "r1", name: "Cerrado ayer", deadline: daysFromToday(-1), estado: "CERRADO" }),
        req({ id: "r2", name: "Pendiente ayer", deadline: daysFromToday(-1), estado: "ATRASADO" }),
      ],
    });
    const b = buildTodoNotifications(data, ME);
    const byName = Object.fromEntries(b.atras.map((n) => [n.name, n.done]));
    expect(byName["Cerrado ayer"]).toBe(true);
    expect(byName["Pendiente ayer"]).toBe(false);
  });

  it("ignora items sin deadline", () => {
    const data = mkData({ proj: [proj({ id: "p1", name: "Sin fecha", deadline: null })] });
    const b = buildTodoNotifications(data, ME);
    expect(b.atras).toHaveLength(0);
    expect(b.hoy).toHaveLength(0);
    expect(b.adelante).toHaveLength(0);
  });

  it("ordena cada bucket por fecha ascendente", () => {
    const data = mkData({
      proj: [
        proj({ id: "p1", name: "Más tarde", deadline: daysFromToday(3) }),
        proj({ id: "p2", name: "Más pronto", deadline: daysFromToday(1) }),
      ],
    });
    const b = buildTodoNotifications(data, ME);
    expect(b.adelante.map((n) => n.name)).toEqual(["Más pronto", "Más tarde"]);
  });
});
