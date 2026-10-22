import { describe, it, expect } from "vitest";
import { detalleCalidad, detalleCumplimiento } from "./ckuDetalle";
import { calcEntregaStatsPonderado, calcReprocesoStatsPonderado } from "./dashboard";
import { swapPmCku } from "./players";
import type { DelayMap } from "./delay";
import type { IniItem, ProjBoard, ProjItem, ReqItem } from "@/types";

const reqE = (id: string, verdict: "on-time" | "late", extra: Partial<ReqItem> = {}): ReqItem =>
  ({ id, name: `PML ${id}`, grupo: "Desarrollo", pm: "Javier", estado: "CERRADO", onTime: { verdict, phases: [] }, ...extra }) as unknown as ReqItem;

const board = { id: "b1", name: "PM-001 | Demo", pm: "Javier" } as ProjBoard;
const fase = (id: string, grupo: string, entrega: "on-time" | "late"): ProjItem =>
  ({ id, boardId: "b1", boardName: "PM-001 | Demo", pm: "Javier", grupo, entrega, status: "Done", subitems: [] }) as unknown as ProjItem;

const creacion = new Date(2026, 0, 5);
const iniE = (id: string, aTiempo: boolean): IniItem =>
  ({ id, name: `Ini ${id}`, grupo: "Aprobadas", status: "PM Aprobado", estado: "APROBADA", pm: "Javier",
    creacion, meet1: aTiempo ? "2026-01-12" : "2026-01-13", meet2: "2026-01-26" }) as IniItem;

describe("detalleCumplimiento — qué se mide y cómo pesa cada fuente", () => {
  it("clasifica cada unidad: a tiempo / atraso que penaliza / atraso excusado, y arma el % por fuente", () => {
    const delays: DelayMap = { r3: { responsible: "Sponsor" }, "b1::Fase 2": { responsible: "Sponsor" } };
    const s = {
      req: [reqE("r1", "on-time"), reqE("r2", "late"), reqE("r3", "late")],
      proj: [fase("p1", "Fase 1", "on-time"), fase("p2", "Fase 2", "late"), fase("p3", "Fase 3", "late")],
      projBoards: [board], ini: [iniE("i1", true), iniE("i2", false)],
    };
    const d = detalleCumplimiento(s, delays);
    const por = (id: string) => d.unidades.find((u) => u.id === id)!;

    expect(por("r1")).toMatchObject({ estado: "ok", cuenta: true });
    expect(por("r2")).toMatchObject({ estado: "atraso", cuenta: true, valor: 0 });
    // PML con atraso excusado: SALE de la cuenta (no suma ni resta).
    expect(por("r3")).toMatchObject({ estado: "excusado", cuenta: false });
    // Fase de Proyecto con atraso excusado: SÍ cuenta, como a tiempo.
    expect(por("b1::Fase 2")).toMatchObject({ estado: "excusado", cuenta: true, valor: 1 });
    expect(por("b1::Fase 3")).toMatchObject({ estado: "atraso", cuenta: true, extra: "1 de 1 con atraso" });

    const f = (k: string) => d.fuentes.find((x) => x.fuente === k)!;
    expect(f("req")).toMatchObject({ total: 2, buenas: 1, pct: 50 });   // r1 ok, r2 atraso (r3 excluido)
    expect(f("proj")).toMatchObject({ total: 3, buenas: 2, pct: 67 });  // p1 ok, p2 excusada, p3 atraso
    expect(f("ini")).toMatchObject({ total: 2, buenas: 1, pct: 50 });
  });

  it("el % del detalle y las unidades que cuentan coinciden con el del scoreboard", () => {
    const delays: DelayMap = { r3: { responsible: "Sponsor" }, "b1::Fase 2": { responsible: "Sponsor" } };
    const s = {
      req: [reqE("r1", "on-time"), reqE("r2", "late"), reqE("r3", "late")],
      proj: [fase("p1", "Fase 1", "on-time"), fase("p2", "Fase 2", "late"), fase("p3", "Fase 3", "late")],
      projBoards: [board], ini: [iniE("i1", true), iniE("i2", false)],
    };
    const d = detalleCumplimiento(s, delays);
    const stats = calcEntregaStatsPonderado(s.req, s.proj, delays, s.ini);
    expect(d.pct).toBe(stats.pct);
    expect(d.fuentes.reduce((n, f) => n + f.total, 0)).toBe(stats.total);
    expect(d.fuentes.reduce((n, f) => n + f.buenas, 0)).toBe(stats.onTime);
  });

  it("los pesos efectivos reparten el de las fuentes sin unidades (sin PML: Iniciativas 12.5% · Proyectos 87.5%)", () => {
    const d = detalleCumplimiento(
      { req: [], proj: [fase("p1", "Fase 1", "on-time")], projBoards: [board], ini: [iniE("i1", true)] }, {});
    const f = (k: string) => d.fuentes.find((x) => x.fuente === k)!;
    expect(f("req")).toMatchObject({ total: 0, pct: null, pesoEfectivo: null });
    expect(f("ini").pesoEfectivo).toBeCloseTo(0.125, 5);
    expect(f("proj").pesoEfectivo).toBeCloseTo(0.875, 5);
    expect(d.fuentes.reduce((s, x) => s + (x.pesoEfectivo ?? 0), 0)).toBeCloseTo(1, 5);
  });

  it("para un CKU penaliza 'CKU' (no 'PM'): el mapa intercambiado decide, la etiqueta es la original", () => {
    const original: DelayMap = { r1: { responsible: "CKU" }, r2: { responsible: "PM" } };
    const s = { req: [reqE("r1", "late"), reqE("r2", "late")], proj: [], projBoards: [], ini: [] };
    const d = detalleCumplimiento(s, swapPmCku(original), original);
    const por = (id: string) => d.unidades.find((u) => u.id === id)!;
    expect(por("r1")).toMatchObject({ estado: "atraso", responsable: "CKU" });     // atribuido al CKU → penaliza
    expect(por("r2")).toMatchObject({ estado: "excusado", responsable: "PM" });    // atribuido al PM → excusa
  });

  it("sin unidades: pct null y todas las fuentes vacías", () => {
    const d = detalleCumplimiento({ req: [], proj: [], projBoards: [], ini: [] }, {});
    expect(d.pct).toBeNull();
    expect(d.fuentes.every((f) => f.total === 0 && f.pct === null)).toBe(true);
  });
});

describe("detalleCalidad — notas 0 / 50 / 100 por unidad", () => {
  const CPM_INI = new Date(2026, 0, 1), CPM_FIN = new Date(2026, 0, 31);
  // Fase 3 ("Launch"), Done, con ventana CPM propia → recuperado: sin responsable vale 50, con uno ≠ PM vale 100.
  const stepF3 = (id: string): ProjItem =>
    ({ id, name: `Entregable ${id}`, boardId: "b1", boardName: "PM-001 | Demo", pm: "Javier", grupo: "Launch",
      status: "Done", startDate: CPM_INI, deadline: CPM_FIN, subitems: [] }) as unknown as ProjItem;

  it("PML e Iniciativas son binarias; un entregable de Proyecto sin responsable queda en 50 (parcial)", () => {
    const rep: DelayMap = { r1: { responsible: "Sponsor" } };
    const s = { req: [reqE("r1", "on-time"), reqE("r2", "on-time")], proj: [stepF3("p1")], projBoards: [board], ini: [iniE("i1", true)] };
    const d = detalleCalidad(s, rep);
    const por = (id: string) => d.unidades.find((u) => u.id === id)!;
    expect(por("r1")).toMatchObject({ nota: 100, estado: "ok", responsable: "Sponsor" });
    expect(por("r2")).toMatchObject({ nota: 0, estado: "atraso", responsable: null });
    expect(por("p1")).toMatchObject({ nota: 50, estado: "parcial", fuente: "proj" });
    expect(por("i1")).toMatchObject({ nota: 0, estado: "atraso", fuente: "ini" });
  });

  it("el % del detalle y el conteo coinciden con el del scoreboard", () => {
    const rep: DelayMap = { r1: { responsible: "Sponsor" }, p1: { responsible: "Sin reproceso" } };
    const s = { req: [reqE("r1", "on-time"), reqE("r2", "on-time")], proj: [stepF3("p1"), stepF3("p2")], projBoards: [board], ini: [iniE("i1", true)] };
    const d = detalleCalidad(s, rep);
    const stats = calcReprocesoStatsPonderado(s.req, s.proj, rep, s.ini);
    expect(d.pct).toBe(stats.pct);
    expect(d.fuentes.reduce((n, f) => n + f.total, 0)).toBe(stats.total);
    expect(d.fuentes.reduce((n, f) => n + f.buenas, 0)).toBe(stats.limpias);
  });

  it("marca como 'en curso' el entregable de Proyecto con hitos aún abiertos (su nota es provisional)", () => {
    // Un hito Done y otro todavía en trabajo → ya mide (hay señal) pero no ha cerrado del todo.
    const abierto = {
      ...stepF3("p9"), status: "Working on it",
      subitems: [{ id: "h1", name: "Hito 1", status: "Done" }, { id: "h2", name: "Hito 2", status: "Working on it" }],
    } as unknown as ProjItem;
    const d = detalleCalidad({ req: [], proj: [stepF3("p1"), abierto], projBoards: [board], ini: [] }, {});
    expect(d.unidades.find((u) => u.id === "p9")?.enCurso).toBe(true);
    expect(d.unidades.find((u) => u.id === "p1")?.enCurso).toBe(false);
  });

  it("sin unidades: pct null", () => {
    const d = detalleCalidad({ req: [], proj: [], projBoards: [], ini: [] }, {});
    expect(d.pct).toBeNull();
  });
});
