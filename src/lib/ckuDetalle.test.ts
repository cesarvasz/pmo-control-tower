import { describe, it, expect } from "vitest";
import { agruparPorProyecto, contarActividades, detalleCalidad, detalleCumplimiento } from "./ckuDetalle";
import { calcEntregaStatsCku, calcReprocesoStatsPonderado } from "./dashboard";
import { swapPmCku } from "./players";
import type { DelayMap } from "./delay";
import type { IniItem, ProjBoard, ProjItem, ReqItem } from "@/types";

const reqE = (id: string, verdict: "on-time" | "late", extra: Partial<ReqItem> = {}): ReqItem =>
  ({ id, name: `PML ${id}`, grupo: "Desarrollo", pm: "Javier", estado: "CERRADO", onTime: { verdict, phases: [] }, ...extra }) as unknown as ReqItem;

const board = { id: "b1", name: "PM-001 | Demo", pm: "Javier" } as ProjBoard;
const boards = ["b1", "b2", "b3"].map((id) => ({ id, name: `PM-00${id.slice(1)} | Demo ${id}`, pm: "Javier" }) as ProjBoard);
const LAUNCH = "Launch | Lanzamiento";

const creacion = new Date(2026, 0, 5);
const iniE = (id: string, aTiempo: boolean): IniItem =>
  ({ id, name: `Ini ${id}`, grupo: "Aprobadas", status: "PM Aprobado", estado: "APROBADA", pm: "Javier",
    creacion, meet1: aTiempo ? "2026-01-12" : "2026-01-13", meet2: "2026-01-26" }) as IniItem;

// El CKU medido en estos tests. Solo cuentan los entregables y actividades cuyo Responsible es él.
const CKU = "Javier Juarez";
const cumpl = (s: Omit<Parameters<typeof detalleCumplimiento>[0], "cku">, delays: DelayMap, original?: DelayMap) =>
  detalleCumplimiento({ ...s, cku: CKU }, delays, original);

// Una actividad (subitem) de un item de Fase 3, a cargo del CKU salvo que se diga otra cosa.
// entrega = su veredicto (solo Done con fechas); null = pendiente.
const act = (id: string, entrega: "on-time" | "late" | null, extra: Record<string, unknown> = {}) =>
  ({ id, name: `Act ${id}`, status: entrega ? "Done" : "Working on it", entrega, responsible: CKU, deadline: null, actualEnd: null, ...extra });

// Un item (entregable) de la Fase 3 (Launch) de un board, a cargo del CKU salvo que se diga otra cosa, con sus
// actividades. El item mismo NO es unidad.
const item3 = (id: string, boardId: string, subs: ReturnType<typeof act>[], extra: Record<string, unknown> = {}, grupo = LAUNCH): ProjItem =>
  ({ id, boardId, boardName: `PM-00${boardId.slice(1)} | Demo ${boardId}`, pm: "Javier", grupo, name: `Item ${id}`, status: "Working on it",
    entrega: null, deadline: null, responsible: CKU, resp: "", subitems: subs, ...extra }) as unknown as ProjItem;

describe("detalleCumplimiento — qué se mide y cómo pesa cada fuente (Proyectos: actividades de la Fase 3 a cargo del CKU)", () => {
  // Tres proyectos con su Fase 3 (a tiempo / atraso excusado / atraso que penaliza) y, además,
  // actividades atrasadas de otras fases que para un CKU NO se miden.
  const delays: DelayMap = { r3: { responsible: "Sponsor" }, [`b1::${LAUNCH}`]: { responsible: "Sponsor" } };
  const escenario = () => ({
    req: [reqE("r1", "on-time"), reqE("r2", "late"), reqE("r3", "late")],
    proj: [
      // c3: actividad de OTRA persona dentro de un entregable del CKU → no se mide ni se muestra
      item3("pC", "b3", [act("c1", "on-time"), act("c2", "on-time"), act("c3", "late", { responsible: "Javier Aragon" })]),
      item3("pA", "b1", [act("a1", "on-time"), act("a2", "late")]),                              // a2: atraso EXCUSADO (fase de b1)
      item3("pB", "b2", [act("b1", "on-time"), act("b2", "late"), act("b3", null)]),             // b2: atraso que penaliza · b3: pendiente
      item3("pZ", "b3", [act("z1", "late"), act("z2", "late")], { responsible: "Luis Aguilar" }), // entregable de OTRA persona: NO se mide
      item3("pX", "b1", [act("x1", "late")], {}, "Valuación | Formulación del proyecto"),       // otra fase: NO se mide
      item3("pY", "b2", [act("y1", "late")], {}, "Operación | Implementación"),                 // otra fase: NO se mide
    ],
    projBoards: boards, ini: [iniE("i1", true), iniE("i2", false)],
  });

  it("cada ACTIVIDAD cerrada es una unidad: a tiempo / atraso que penaliza / atraso excusado; las pendientes no", () => {
    const d = cumpl(escenario(), delays);
    const por = (id: string) => d.unidades.find((u) => u.id === id)!;

    expect(por("r1")).toMatchObject({ estado: "ok", cuenta: true });
    expect(por("r2")).toMatchObject({ estado: "atraso", cuenta: true, valor: 0 });
    expect(por("r3")).toMatchObject({ estado: "excusado", cuenta: false });        // PML con atraso excusado: sale de la cuenta
    expect(por("a1")).toMatchObject({ estado: "ok", cuenta: true, valor: 1, fuente: "proj", fase: "Item pA", proyecto: "PM-001 · Demo b1" });
    // Actividad con atraso en una fase con responsable ≠ CKU: igual que un PML, SALE de la cuenta.
    expect(por("a2")).toMatchObject({ estado: "excusado", cuenta: false, valor: 0, responsable: "Sponsor" });
    expect(por("b2")).toMatchObject({ estado: "atraso", cuenta: true, valor: 0, responsable: null });
    expect(d.unidades.find((u) => u.id === "b3")).toBeUndefined();                  // pendiente: no es unidad

    const f = (k: string) => d.fuentes.find((x) => x.fuente === k)!;
    expect(f("req")).toMatchObject({ total: 2, buenas: 1, pct: 50 });               // r1 ok, r2 atraso (r3 excluido)
    // Proyectos: c1, c2, a1, b1 a tiempo · b2 atraso · a2 excusada y b3 pendiente no cuentan → 4 de 5.
    expect(f("proj")).toMatchObject({ total: 5, buenas: 4, pct: 80 });
    expect(f("ini")).toMatchObject({ total: 2, buenas: 1, pct: 50 });
  });

  it("las demás fases del proyecto (Valuación, Operación…) no entran en la medición del CKU", () => {
    const d = cumpl(escenario(), delays);
    const ids = d.unidades.filter((u) => u.fuente === "proj").map((u) => u.id).sort();
    expect(ids).toEqual(["a1", "a2", "b1", "b2", "c1", "c2"]);
    expect(d.unidades.some((u) => u.id === "x1" || u.id === "y1")).toBe(false);
  });

  it("solo entregables a cargo del CKU y, dentro de ellos, solo actividades a cargo del CKU", () => {
    const d = cumpl(escenario(), delays);
    const ids = d.unidades.map((u) => u.id);
    expect(ids).not.toContain("c3");   // actividad de otra persona, dentro de un entregable del CKU
    expect(ids).not.toContain("z1");   // entregable de otra persona…
    expect(ids).not.toContain("z2");   // …y todas sus actividades, aunque estén atrasadas
    const nombres = d.proyectos!.flatMap((p) => p.items.map((i) => i.nombre));
    expect(nombres).not.toContain("Item pZ");
    expect(d.proyectos!.flatMap((p) => p.items.flatMap((i) => i.actividades.map((a) => a.id)))).not.toContain("c3");
  });

  it("el % del detalle y las unidades que cuentan coinciden con el del scoreboard", () => {
    const s = escenario();
    const d = cumpl(s, delays);
    const stats = calcEntregaStatsCku(CKU, s.req, s.proj, delays, s.ini);
    expect(d.pct).toBe(stats.pct);
    expect(d.fuentes.reduce((n, f) => n + f.total, 0)).toBe(stats.total);
    expect(d.fuentes.reduce((n, f) => n + f.buenas, 0)).toBe(stats.onTime);
  });

  it("los pesos efectivos reparten el de las fuentes sin unidades (sin PML: Iniciativas 12.5% · Proyectos 87.5%)", () => {
    const d = cumpl(
      { req: [], proj: [item3("p1", "b1", [act("a1", "on-time")])], projBoards: [board], ini: [iniE("i1", true)] }, {});
    const f = (k: string) => d.fuentes.find((x) => x.fuente === k)!;
    expect(f("req")).toMatchObject({ total: 0, pct: null, pesoEfectivo: null });
    expect(f("ini").pesoEfectivo).toBeCloseTo(0.125, 5);
    expect(f("proj").pesoEfectivo).toBeCloseTo(0.875, 5);
    expect(d.fuentes.reduce((s, x) => s + (x.pesoEfectivo ?? 0), 0)).toBeCloseTo(1, 5);
  });

  describe("árbol proyecto → item → actividad", () => {
    it("arma los proyectos con sus items y actividades por fecha límite (sin fecha al final), con el estado de cada una", () => {
      const f = (d: string) => new Date(`${d}T00:00:00`);
      const p = item3("a", "b1", [
        act("s3", null, { name: "Salida en vivo", deadline: f("2026-07-14") }),
        act("s1", "late", { name: "Requerimiento", deadline: f("2026-05-29"), actualEnd: f("2026-07-31"), responsible: " Javier Juarez " }),
        act("s2", "on-time", { name: "Análisis", deadline: f("2026-06-05"), responsible: "JAVIER juárez" }),   // acentos y mayúsculas no importan
        act("s4", null, { name: "Sin fecha" }),
      ], { name: "Clasificación" });
      const d = cumpl({ req: [], proj: [p], projBoards: boards, ini: [] }, {});
      expect(d.proyectos).toHaveLength(1);
      expect(d.proyectos![0].proyecto).toBe("PM-001 · Demo b1");
      const it0 = d.proyectos![0].items[0];
      expect(it0.nombre).toBe("Clasificación");
      expect(it0.actividades.map((a) => [a.nombre, a.estado, a.responsable])).toEqual([
        ["Requerimiento", "atraso", "Javier Juarez"],
        ["Análisis", "ok", "JAVIER juárez"],
        ["Salida en vivo", "pendiente", CKU],
        ["Sin fecha", "pendiente", CKU],
      ]);
      expect(it0.actividades[0].cierre).toEqual(f("2026-07-31"));
    });

    it("los items con atraso que penaliza van primero, luego los de atraso excusado, luego el resto", () => {
      const proj = [
        item3("ok", "b1", [act("o1", "on-time")], { name: "Alfa" }),
        item3("late", "b1", [act("l1", "late")], { name: "Zulu" }),
        item3("pend", "b1", [act("p1", null)], { name: "Bravo" }),
      ];
      const d = cumpl({ req: [], proj, projBoards: boards, ini: [] }, {});
      expect(d.proyectos![0].items.map((i) => i.nombre)).toEqual(["Zulu", "Alfa", "Bravo"]);
    });

    it("el atraso excusado sale marcado 'excusado' y trae el responsable de la fase con su etiqueta original", () => {
      const original: DelayMap = { [`b1::${LAUNCH}`]: { responsible: "Desarrollo" } };
      const proj = [item3("a", "b1", [act("s1", "late"), act("s2", "on-time")])];
      const d = cumpl({ req: [], proj, projBoards: boards, ini: [] }, original);   // "Desarrollo" ≠ PM → excusa
      const p = d.proyectos![0];
      expect(p.responsableFase).toBe("Desarrollo");
      expect(p.items[0].actividades.map((a) => a.estado).sort()).toEqual(["excusado", "ok"]);
      expect(contarActividades(p.items)).toEqual({ ok: 1, atraso: 0, excusado: 1, pendiente: 0 });
    });

    it("si el responsable de la fase es el CKU (mapa intercambiado: aparece como 'PM') o no hay, el atraso penaliza", () => {
      const original: DelayMap = { [`b1::${LAUNCH}`]: { responsible: "CKU" } };
      const proj = [item3("a", "b1", [act("s1", "late")])];
      const conCku = cumpl({ req: [], proj, projBoards: boards, ini: [] }, swapPmCku(original), original);
      const sinAsignar = cumpl({ req: [], proj, projBoards: boards, ini: [] }, {});
      expect(conCku.proyectos![0].items[0].actividades[0].estado).toBe("atraso");
      expect(conCku.proyectos![0].responsableFase).toBe("CKU");
      expect(sinAsignar.proyectos![0].items[0].actividades[0].estado).toBe("atraso");
      expect(sinAsignar.proyectos![0].responsableFase).toBeNull();
    });

    it("el item no es unidad: uno cerrado a tiempo sin actividades no aporta nada, y uno atrasado tampoco si sus actividades no cerraron", () => {
      const proj = [
        item3("a", "b1", [], { name: "Sin actividades", status: "Done", entrega: "on-time" }),
        item3("b", "b1", [act("s1", null)], { name: "Atrasado sin cerrar", status: "Stuck", entrega: "late" }),
      ];
      const d = cumpl({ req: [], proj, projBoards: boards, ini: [] }, {});
      expect(d.unidades.filter((u) => u.fuente === "proj")).toEqual([]);
      expect(d.fuentes.find((x) => x.fuente === "proj")).toMatchObject({ total: 0, pct: null, pesoEfectivo: null });
      expect(d.proyectos![0].items.map((i) => i.nombre).sort()).toEqual(["Atrasado sin cerrar", "Sin actividades"]);
    });

    it("un entregable es del CKU si su 'Responsible' lo es ('Resp' solo si 'Responsible' viene vacío); sin acentos ni mayúsculas", () => {
      const proj = [
        item3("a", "b1", [], { name: "A", responsible: " Javier Juarez ", resp: "" }),
        item3("b", "b1", [], { name: "B", responsible: "", resp: "JAVIER juárez" }),     // cae a "Resp"
        item3("c", "b1", [], { name: "C", responsible: "Luis Coronado", resp: CKU }),    // "Responsible" manda sobre "Resp"
        item3("d", "b1", [], { name: "D", responsible: "", resp: "" }),                  // nadie
        item3("e", "b1", [], { name: "E", responsible: "Javier Juarez Jr." }),           // otro nombre
      ];
      const d = cumpl({ req: [], proj, projBoards: boards, ini: [] }, {});
      expect(d.proyectos![0].items.map((i) => [i.nombre, i.responsable])).toEqual([["A", "Javier Juarez"], ["B", "JAVIER juárez"]]);
    });

    it("las pendientes que se cuentan son solo las del CKU", () => {
      const proj = [item3("a", "b1", [act("s1", "on-time"), act("s2", null), act("s3", null, { responsible: "Javier Aragon" })])];
      const d = cumpl({ req: [], proj, projBoards: boards, ini: [] }, {});
      expect(contarActividades(d.proyectos![0].items)).toEqual({ ok: 1, atraso: 0, excusado: 0, pendiente: 1 });
    });

    it("un proyecto sin ningún entregable a cargo del CKU no aparece", () => {
      const proj = [item3("a", "b1", [act("s1", "late")], { responsible: "Luis Aguilar" }), item3("b", "b2", [act("s2", "on-time")])];
      const d = cumpl({ req: [], proj, projBoards: boards, ini: [] }, {});
      expect(d.proyectos!.map((p) => p.proyecto)).toEqual(["PM-002 · Demo b2"]);
    });

    it("los boards de plantilla vieja no aparecen: ni sus actividades ni su proyecto", () => {
      const vieja = item3("v1", "b2", [act("v-s1", "late")], { name: "Desarrollo por iteraciones (Hitos) / Entrega CKU" }, "Launch | Desarrollo");
      const nueva = item3("n1", "b1", [act("n-s1", "on-time")], { name: "POC" });
      const d = cumpl({ req: [], proj: [vieja, nueva], projBoards: boards, ini: [] }, {});
      expect(d.proyectos!.map((p) => p.proyecto)).toEqual(["PM-001 · Demo b1"]);
      expect(d.unidades.filter((u) => u.fuente === "proj").map((u) => u.id)).toEqual(["n-s1"]);
    });

    it("el proyecto con atraso que penaliza va primero", () => {
      const proj = [
        item3("a", "b1", [act("a1", "on-time")]),
        item3("b", "b2", [act("b1", "late")]),
      ];
      const d = cumpl({ req: [], proj, projBoards: boards, ini: [] }, {});
      expect(d.proyectos!.map((p) => p.proyecto)).toEqual(["PM-002 · Demo b2", "PM-001 · Demo b1"]);
    });

    it("PML e Iniciativas no forman proyectos", () => {
      const d = cumpl({ req: [reqE("r1", "on-time")], proj: [], projBoards: [], ini: [iniE("i1", true)] }, {});
      expect(d.proyectos).toEqual([]);
    });
  });

  it("un proyecto sin Fase 3 todavía no aporta unidades: Proyectos queda sin peso", () => {
    const d = cumpl(
      { req: [], proj: [item3("p1", "b1", [act("a1", "late")], {}, "Valuación | Formulación del proyecto")], projBoards: [board], ini: [iniE("i1", true)] }, {});
    expect(d.fuentes.find((x) => x.fuente === "proj")).toMatchObject({ total: 0, pct: null, pesoEfectivo: null });
    expect(d.pct).toBe(100); // solo cuenta la Iniciativa
  });

  it("para un CKU penaliza 'CKU' (no 'PM'): el mapa intercambiado decide, la etiqueta es la original", () => {
    const original: DelayMap = { r1: { responsible: "CKU" }, r2: { responsible: "PM" } };
    const s = { req: [reqE("r1", "late"), reqE("r2", "late")], proj: [], projBoards: [], ini: [] };
    const d = cumpl(s, swapPmCku(original), original);
    const por = (id: string) => d.unidades.find((u) => u.id === id)!;
    expect(por("r1")).toMatchObject({ estado: "atraso", responsable: "CKU" });     // atribuido al CKU → penaliza
    expect(por("r2")).toMatchObject({ estado: "excusado", responsable: "PM" });    // atribuido al PM → excusa
  });

  it("sin unidades: pct null y todas las fuentes vacías", () => {
    const d = cumpl({ req: [], proj: [], projBoards: [], ini: [] }, {});
    expect(d.pct).toBeNull();
    expect(d.fuentes.every((f) => f.total === 0 && f.pct === null)).toBe(true);
  });
});

describe("detalleCalidad — nota 0 / 100 por unidad según su responsable", () => {
  const CPM_INI = new Date(2026, 0, 1), CPM_FIN = new Date(2026, 0, 31);
  // Fase 3 ("Launch"), Done, con ventana CPM propia (recuperado). Para un CKU eso no cuenta: solo el responsable.
  const stepF3 = (id: string): ProjItem =>
    ({ id, name: `Entregable ${id}`, boardId: "b1", boardName: "PM-001 | Demo", pm: "Javier", grupo: "Launch",
      status: "Done", startDate: CPM_INI, deadline: CPM_FIN, subitems: [] }) as unknown as ProjItem;

  it("PML, Iniciativas y Proyectos son binarios: 100 con un responsable ≠ CKU, 0 sin asignar (aunque el item se haya recuperado)", () => {
    const rep: DelayMap = { r1: { responsible: "Sponsor" } };
    const s = { req: [reqE("r1", "on-time"), reqE("r2", "on-time")], proj: [stepF3("p1")], projBoards: [board], ini: [iniE("i1", true)] };
    const d = detalleCalidad(s, rep);
    const por = (id: string) => d.unidades.find((u) => u.id === id)!;
    expect(por("r1")).toMatchObject({ nota: 100, estado: "ok", responsable: "Sponsor" });
    expect(por("r2")).toMatchObject({ nota: 0, estado: "atraso", responsable: null });
    expect(por("p1")).toMatchObject({ nota: 0, estado: "atraso", fuente: "proj", responsable: null });
    expect(por("i1")).toMatchObject({ nota: 0, estado: "atraso", fuente: "ini" });
  });

  it("un entregable de Proyecto con un responsable ≠ CKU vale 100; con el CKU como responsable, 0", () => {
    // Mapa ya intercambiado (swapPmCku): el CKU aparece como "PM" y penaliza.
    const original: DelayMap = { p1: { responsible: "CKU" }, p2: { responsible: "Desarrollo" } };
    const s = { req: [], proj: [stepF3("p1"), stepF3("p2")], projBoards: [board], ini: [] };
    const d = detalleCalidad(s, swapPmCku(original), original);
    const por = (id: string) => d.unidades.find((u) => u.id === id)!;
    expect(por("p1")).toMatchObject({ nota: 0, estado: "atraso", responsable: "CKU" });
    expect(por("p2")).toMatchObject({ nota: 100, estado: "ok", responsable: "Desarrollo" });
    expect(d.pct).toBe(50);
  });

  it("los proyectos de plantilla vieja no entran: ni sus unidades ni su peso", () => {
    const vieja = { ...stepF3("v1"), boardId: "b2", boardName: "PM-002 | Viejo", grupo: "Launch | Desarrollo", name: "Desarrollo por iteraciones (Hitos) / Entrega CKU" } as ProjItem;
    const rep: DelayMap = { p1: { responsible: "Desarrollo" }, v1: { responsible: "Desarrollo" } };
    const d = detalleCalidad({ req: [], proj: [stepF3("p1"), vieja], projBoards: [board], ini: [] }, rep);
    expect(d.unidades.map((u) => u.id)).toEqual(["p1"]);
    expect(agruparPorProyecto(d.unidades).map((g) => g.proyecto)).toEqual(["PM-001 · Demo"]);
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

  describe("agruparPorProyecto", () => {
    const step = (id: string, boardId: string, boardName: string): ProjItem => ({ ...stepF3(id), boardId, boardName }) as ProjItem;

    it("agrupa los entregables por proyecto: nota promedio, la peor primero, con el nombre del item", () => {
      const rep: DelayMap = { a1: { responsible: "Sponsor" }, a2: { responsible: "Sponsor" } };   // a1, a2 → 100 · b1 → 0
      const s = { req: [reqE("r1", "on-time")], proj: [step("a1", "bA", "PM-001 | Alfa"), step("a2", "bA", "PM-001 | Alfa"), step("b1", "bB", "PM-002 | Beta")], projBoards: [board], ini: [iniE("i1", true)] };
      const grupos = agruparPorProyecto(detalleCalidad(s, rep).unidades);
      expect(grupos.map((g) => [g.proyecto, g.nota, g.buenas, g.unidades.length])).toEqual([
        ["PM-002 · Beta", 0, 0, 1],
        ["PM-001 · Alfa", 100, 2, 2],
      ]);
      expect(grupos[1].unidades.map((u) => u.nombre)).toEqual(["Entregable a1", "Entregable a2"]);
    });

    it("dentro del proyecto, el entregable de peor nota va primero", () => {
      const rep: DelayMap = { a2: { responsible: "Sponsor" } };   // a1 → 0 · a2 → 100
      const s = { req: [], proj: [step("a2", "bA", "PM-001 | Alfa"), step("a1", "bA", "PM-001 | Alfa")], projBoards: [board], ini: [] };
      const [g] = agruparPorProyecto(detalleCalidad(s, rep).unidades);
      expect(g.unidades.map((u) => [u.id, u.nota])).toEqual([["a1", 0], ["a2", 100]]);
      expect(g.nota).toBe(50);
    });

    it("PML e Iniciativas no forman proyecto", () => {
      const d = detalleCalidad({ req: [reqE("r1", "on-time")], proj: [], projBoards: [], ini: [iniE("i1", true)] }, {});
      expect(d.unidades.every((u) => u.proyecto === undefined)).toBe(true);
      expect(agruparPorProyecto(d.unidades)).toEqual([]);
    });
  });
});
