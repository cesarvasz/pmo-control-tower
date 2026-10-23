import { describe, it, expect } from "vitest";
import { detalleCalidad, detalleCumplimiento } from "./ckuDetalle";
import { calcEntregaStatsCku, calcReprocesoStatsPonderado } from "./dashboard";
import { swapPmCku } from "./players";
import type { DelayMap } from "./delay";
import type { IniItem, ProjBoard, ProjItem, ReqItem } from "@/types";

const reqE = (id: string, verdict: "on-time" | "late", extra: Partial<ReqItem> = {}): ReqItem =>
  ({ id, name: `PML ${id}`, grupo: "Desarrollo", pm: "Javier", estado: "CERRADO", onTime: { verdict, phases: [] }, ...extra }) as unknown as ReqItem;

const board = { id: "b1", name: "PM-001 | Demo", pm: "Javier" } as ProjBoard;
const boards = ["b1", "b2", "b3"].map((id) => ({ id, name: `PM-00${id.slice(1)} | Demo ${id}`, pm: "Javier" }) as ProjBoard);
const LAUNCH = "Launch | Lanzamiento";
const fase = (id: string, grupo: string, entrega: "on-time" | "late", boardId = "b1"): ProjItem =>
  ({ id, boardId, boardName: `PM-00${boardId.slice(1)} | Demo ${boardId}`, pm: "Javier", grupo, entrega, status: "Done", subitems: [] }) as unknown as ProjItem;

const creacion = new Date(2026, 0, 5);
const iniE = (id: string, aTiempo: boolean): IniItem =>
  ({ id, name: `Ini ${id}`, grupo: "Aprobadas", status: "PM Aprobado", estado: "APROBADA", pm: "Javier",
    creacion, meet1: aTiempo ? "2026-01-12" : "2026-01-13", meet2: "2026-01-26" }) as IniItem;

describe("detalleCumplimiento — qué se mide y cómo pesa cada fuente (Proyectos: solo Fase 3)", () => {
  // Tres proyectos con su Fase 3 (a tiempo / atraso excusado / atraso) y, además, fases
  // atrasadas de otras etapas que para un CKU NO se miden.
  const delays: DelayMap = { r3: { responsible: "Sponsor" }, [`b1::${LAUNCH}`]: { responsible: "Sponsor" } };
  const escenario = () => ({
    req: [reqE("r1", "on-time"), reqE("r2", "late"), reqE("r3", "late")],
    proj: [
      fase("pC", LAUNCH, "on-time", "b3"),
      fase("pA", LAUNCH, "late", "b1"),                                   // Fase 3 con atraso, excusada
      fase("pB", LAUNCH, "late", "b2"),                                   // Fase 3 con atraso, penaliza
      fase("pX", "Valuación | Formulación del proyecto", "late", "b1"),   // otra fase: NO se mide
      fase("pY", "Operación | Implementación", "late", "b2"),             // otra fase: NO se mide
    ],
    projBoards: boards, ini: [iniE("i1", true), iniE("i2", false)],
  });

  it("clasifica cada unidad: a tiempo / atraso que penaliza / atraso excusado, y arma el % por fuente", () => {
    const d = detalleCumplimiento(escenario(), delays);
    const por = (id: string) => d.unidades.find((u) => u.id === id)!;

    expect(por("r1")).toMatchObject({ estado: "ok", cuenta: true });
    expect(por("r2")).toMatchObject({ estado: "atraso", cuenta: true, valor: 0 });
    // PML con atraso excusado: SALE de la cuenta (no suma ni resta).
    expect(por("r3")).toMatchObject({ estado: "excusado", cuenta: false });
    // Fase 3 de Proyecto con atraso excusado: SÍ cuenta, como a tiempo.
    expect(por(`b1::${LAUNCH}`)).toMatchObject({ estado: "excusado", cuenta: true, valor: 1 });
    expect(por(`b2::${LAUNCH}`)).toMatchObject({ estado: "atraso", cuenta: true, extra: "1 de 1 con atraso" });
    expect(por(`b3::${LAUNCH}`)).toMatchObject({ estado: "ok", cuenta: true });

    const f = (k: string) => d.fuentes.find((x) => x.fuente === k)!;
    expect(f("req")).toMatchObject({ total: 2, buenas: 1, pct: 50 });   // r1 ok, r2 atraso (r3 excluido)
    expect(f("proj")).toMatchObject({ total: 3, buenas: 2, pct: 67 });  // b3 ok, b1 excusada, b2 atraso
    expect(f("ini")).toMatchObject({ total: 2, buenas: 1, pct: 50 });
  });

  it("las demás fases del proyecto (Valuación, Operación…) no entran en la medición del CKU", () => {
    const d = detalleCumplimiento(escenario(), delays);
    const proj = d.unidades.filter((u) => u.fuente === "proj").map((u) => u.id);
    expect(proj.sort()).toEqual([`b1::${LAUNCH}`, `b2::${LAUNCH}`, `b3::${LAUNCH}`]);
    expect(d.unidades.some((u) => u.id.includes("Valuación") || u.id.includes("Operación"))).toBe(false);
  });

  it("el % del detalle y las unidades que cuentan coinciden con el del scoreboard", () => {
    const s = escenario();
    const d = detalleCumplimiento(s, delays);
    const stats = calcEntregaStatsCku(s.req, s.proj, delays, s.ini);
    expect(d.pct).toBe(stats.pct);
    expect(d.fuentes.reduce((n, f) => n + f.total, 0)).toBe(stats.total);
    expect(d.fuentes.reduce((n, f) => n + f.buenas, 0)).toBe(stats.onTime);
  });

  it("los pesos efectivos reparten el de las fuentes sin unidades (sin PML: Iniciativas 12.5% · Proyectos 87.5%)", () => {
    const d = detalleCumplimiento(
      { req: [], proj: [fase("p1", LAUNCH, "on-time")], projBoards: [board], ini: [iniE("i1", true)] }, {});
    const f = (k: string) => d.fuentes.find((x) => x.fuente === k)!;
    expect(f("req")).toMatchObject({ total: 0, pct: null, pesoEfectivo: null });
    expect(f("ini").pesoEfectivo).toBeCloseTo(0.125, 5);
    expect(f("proj").pesoEfectivo).toBeCloseTo(0.875, 5);
    expect(d.fuentes.reduce((s, x) => s + (x.pesoEfectivo ?? 0), 0)).toBeCloseTo(1, 5);
  });

  describe("items de la Fase 3", () => {
    const hito = (entrega: "on-time" | "late" | null) => ({ id: `h${Math.random()}`, entrega }) as never;
    const item = (id: string, nombre: string, entrega: "on-time" | "late" | null, subs: ("on-time" | "late" | null)[] = [], boardId = "b1") =>
      ({ ...fase(id, LAUNCH, entrega ?? "on-time", boardId), name: nombre, status: entrega ? "Done" : "Working on it", entrega, subitems: subs.map(hito) }) as unknown as ProjItem;

    it("cada unidad de Proyecto trae los items de su fase, con los atrasados primero", () => {
      const proj = [
        item("a", "Bravo", "on-time"),
        item("b", "Alfa", "late"),
        item("c", "Charlie", null),                          // sin veredicto todavía
        item("d", "Delta", "on-time", ["on-time", "late"]),  // el item cerró a tiempo pero un hito salió tarde
      ];
      const d = detalleCumplimiento({ req: [], proj, projBoards: boards, ini: [] }, {});
      const u = d.unidades.find((x) => x.id === `b1::${LAUNCH}`)!;
      expect(u.items!.map((i) => [i.nombre, i.estado])).toEqual([
        ["Alfa", "atraso"], ["Delta", "atraso"], ["Charlie", "pendiente"], ["Bravo", "ok"],
      ]);
      expect(u.items!.find((i) => i.nombre === "Delta")).toMatchObject({ hitosEvaluados: 2, hitosAtrasados: 1 });
    });

    it("un item sin cerrar (Stuck, Working on it) no se ve 'a tiempo' aunque sus hitos evaluados no tengan atraso", () => {
      const abierto = { ...item("a", "Segregación", null, ["on-time", "on-time"]), status: "Stuck" } as ProjItem;
      const d = detalleCumplimiento({ req: [], proj: [abierto], projBoards: boards, ini: [] }, {});
      expect(d.unidades.find((x) => x.fuente === "proj")!.items![0]).toMatchObject({ estado: "pendiente", hitosEvaluados: 2, hitosAtrasados: 0 });
    });

    it("la fase sale con atraso exactamente cuando algún item (o hito) lo tiene", () => {
      const conAtraso = detalleCumplimiento({ req: [], proj: [item("a", "A", "on-time"), item("b", "B", "on-time", ["late"])], projBoards: boards, ini: [] }, {});
      const sinAtraso = detalleCumplimiento({ req: [], proj: [item("a", "A", "on-time"), item("b", "B", "on-time", ["on-time"])], projBoards: boards, ini: [] }, {});
      const u = (d: typeof conAtraso) => d.unidades.find((x) => x.fuente === "proj")!;
      expect(u(conAtraso).estado).toBe("atraso");
      expect(u(conAtraso).items!.some((i) => i.estado === "atraso")).toBe(true);
      expect(u(sinAtraso).estado).toBe("ok");
      expect(u(sinAtraso).items!.some((i) => i.estado === "atraso")).toBe(false);
    });

    it("los boards de plantilla vieja no aparecen: ni su unidad ni sus items", () => {
      const vieja = { ...fase("v1", "Launch | Desarrollo", "late", "b2"), name: "Desarrollo por iteraciones (Hitos) / Entrega CKU" } as ProjItem;
      const nueva = item("n1", "POC", "on-time");
      const d = detalleCumplimiento({ req: [], proj: [vieja, nueva], projBoards: boards, ini: [] }, {});
      expect(d.unidades.filter((x) => x.fuente === "proj").map((x) => x.id)).toEqual([`b1::${LAUNCH}`]);
      expect(d.unidades.flatMap((x) => x.items ?? []).map((i) => i.nombre)).toEqual(["POC"]);
    });

    it("cada item trae su responsable de Monday ('Responsible'; 'Resp' si viene vacío; null si ninguno)", () => {
      const proj = [
        { ...item("a", "A", "on-time"), responsible: " Javier Juarez ", resp: "" },
        { ...item("b", "B", "on-time"), responsible: "", resp: "Luis Coronado" },
        { ...item("c", "C", "on-time"), responsible: "", resp: "" },
      ] as unknown as ProjItem[];
      const d = detalleCumplimiento({ req: [], proj, projBoards: boards, ini: [] }, {});
      const items = d.unidades.find((x) => x.fuente === "proj")!.items!;
      expect(Object.fromEntries(items.map((i) => [i.nombre, i.responsable]))).toEqual({ A: "Javier Juarez", B: "Luis Coronado", C: null });
    });

    it("PML e Iniciativas no traen items", () => {
      const d = detalleCumplimiento({ req: [reqE("r1", "on-time")], proj: [], projBoards: [], ini: [iniE("i1", true)] }, {});
      expect(d.unidades.every((x) => x.items === undefined)).toBe(true);
    });
  });

  it("un proyecto sin Fase 3 todavía no aporta unidades: Proyectos queda sin peso", () => {
    const d = detalleCumplimiento(
      { req: [], proj: [fase("p1", "Valuación | Formulación del proyecto", "late")], projBoards: [board], ini: [iniE("i1", true)] }, {});
    expect(d.fuentes.find((x) => x.fuente === "proj")).toMatchObject({ total: 0, pct: null, pesoEfectivo: null });
    expect(d.pct).toBe(100); // solo cuenta la Iniciativa
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
