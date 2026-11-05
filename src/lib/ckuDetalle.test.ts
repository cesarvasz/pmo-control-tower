import { describe, it, expect } from "vitest";
import { contarActividades, contarCalidad, detalleCalidad, detalleCumplimiento } from "./ckuDetalle";
import { calcEntregaStatsCku, calcReprocesoStatsPonderado } from "./dashboard";
import { ACTIVIDADES_A_TIEMPO } from "./ckuAjustes";
import { swapPmCku } from "./players";
import type { DelayMap } from "./delay";
import type { ClaseEntry, IniItem, ProjBoard, ProjItem, ReqItem } from "@/types";

// La clase (A/B/C) asignada a mano en Calidad & Cumplimiento → Clasificación, por id de board o de PML.
const cl = (m: Record<string, "A" | "B" | "C">): Record<string, ClaseEntry> =>
  Object.fromEntries(Object.entries(m).map(([id, clase]) => [id, { clase, by: "", at: "" }]));

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
const cumpl = (s: Omit<Parameters<typeof detalleCumplimiento>[0], "cku">, delays: DelayMap, original?: DelayMap, clases?: Record<string, ClaseEntry>) =>
  detalleCumplimiento({ ...s, cku: CKU }, delays, original, clases);

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

    // Las fuentes del peso: Iniciativas y las Clases. Los PML valen Clase C (nadie les asignó otra) y los
    // tres proyectos (PM-001/002/003) son Clase A en la tabla de claseProyecto.ts.
    const f = (k: string) => d.fuentes.find((x) => x.fuente === k)!;
    expect(f("C")).toMatchObject({ total: 2, buenas: 1, pct: 50 });                 // PML: r1 ok, r2 atraso (r3 excluido)
    // Proyectos (Clase A): c1, c2, a1, b1 a tiempo · b2 atraso · a2 excusada y b3 pendiente no cuentan → 4 de 5.
    expect(f("A")).toMatchObject({ total: 5, buenas: 4, pct: 80 });
    expect(f("B")).toMatchObject({ total: 0, pct: null, pesoEfectivo: null });
    expect(f("ini")).toMatchObject({ total: 2, buenas: 1, pct: 50 });
    expect(d.sinClase).toBe(0);
    // Cada unidad sabe de qué fuente cuenta: sus actividades, de la Clase A; sus PML, de la C.
    expect(por("a1").fuenteEvm).toBe("A");
    expect(por("r1").fuenteEvm).toBe("C");
    expect(d.proyectos!.every((p) => p.clase === "A")).toBe(true);
  });

  it("la clase asignada manda: un PML en la Clase B pesa 30, y un proyecto sin clase no pesa pero se avisa", () => {
    const s = {
      req: [reqE("r1", "on-time"), reqE("r2", "late")],
      proj: [item3("p1", "b1", [act("a1", "on-time")]), item3("p2", "b2", [act("b1", "late")])],
      projBoards: boards, ini: [],
    };
    // r1 → Clase B; el proyecto b2 pasa a Clase C; b1 sigue en la A (tabla).
    const d = cumpl(s, {}, undefined, cl({ r1: "B", b2: "C" }));
    const f = (k: string) => d.fuentes.find((x) => x.fuente === k)!;
    expect(f("A")).toMatchObject({ total: 1, pct: 100 });                       // a1
    expect(f("B")).toMatchObject({ total: 1, pct: 100 });                       // r1
    expect(f("C")).toMatchObject({ total: 2, buenas: 0, pct: 0 });              // r2 (por defecto) y la actividad b1 (tarde)
    expect(d.proyectos!.map((p) => [p.proyecto, p.clase])).toEqual([["PM-002 · Demo b2", "C"], ["PM-001 · Demo b1", "A"]]);

    // Un proyecto sin clase (el nombre no está en la tabla) no entra en la nota, pero la unidad se cuenta aparte.
    const sinClase = { req: [], proj: [{ ...item3("p3", "b9", [act("z1", "late")]), boardName: "Sin ID" } as ProjItem], projBoards: [], ini: [iniE("i1", true)] };
    const dn = cumpl(sinClase, {});
    expect(dn.sinClase).toBe(1);
    expect(dn.pct).toBe(100);                                                   // solo pesa la Iniciativa
    expect(dn.unidades.find((u) => u.id === "z1")).toMatchObject({ fuenteEvm: null });
    // Asignándole una clase, el atraso empieza a pesar.
    expect(cumpl(sinClase, {}, undefined, cl({ b9: "A" })).pct).toBe(Math.round((1 * 0.1 + 0 * 0.35) / 0.45 * 100));
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

  it("una actividad con atraso que el PMO dejó «a tiempo» (ckuAjustes) cuenta a tiempo y queda marcada como ajustada", () => {
    const [id] = [...ACTIVIDADES_A_TIEMPO.keys()];
    const s = { req: [], proj: [item3("p1", "b2", [act(id, "late"), act("x", "late")])], projBoards: [board], ini: [] };
    const d = cumpl(s, {});
    expect(d.unidades.find((u) => u.id === id)).toMatchObject({ estado: "ok", cuenta: true, valor: 1 });
    expect(d.unidades.find((u) => u.id === "x")).toMatchObject({ estado: "atraso", valor: 0 });
    const acts = d.proyectos![0].items[0].actividades;
    expect(acts.find((a) => a.id === id)).toMatchObject({ estado: "ok", ajustada: true });
    expect(acts.find((a) => a.id === "x")).toMatchObject({ estado: "atraso", ajustada: false });
    // el % del detalle sigue coincidiendo con el del scoreboard
    expect(d.pct).toBe(calcEntregaStatsCku(CKU, s.req, s.proj, {}, s.ini).pct);
    expect(d.pct).toBe(50);
  });

  it("una actividad ajustada que está pendiente (sin veredicto) sigue sin contar", () => {
    const [id] = [...ACTIVIDADES_A_TIEMPO.keys()];
    const d = cumpl({ req: [], proj: [item3("p1", "b2", [act(id, null)])], projBoards: [board], ini: [] }, {});
    expect(d.unidades.find((u) => u.id === id)).toBeUndefined();
    expect(d.proyectos![0].items[0].actividades[0]).toMatchObject({ estado: "pendiente", ajustada: false });
  });

  it("los pesos efectivos reparten el de las fuentes sin unidades (solo Iniciativas y Clase A: 10/45 y 35/45)", () => {
    const d = cumpl(
      { req: [], proj: [item3("p1", "b1", [act("a1", "on-time")])], projBoards: [board], ini: [iniE("i1", true)] }, {});
    const f = (k: string) => d.fuentes.find((x) => x.fuente === k)!;
    expect(f("C")).toMatchObject({ total: 0, pct: null, pesoEfectivo: null });
    expect(f("B")).toMatchObject({ total: 0, pct: null, pesoEfectivo: null });
    expect(f("ini").pesoEfectivo).toBeCloseTo(0.10 / 0.45, 5);
    expect(f("A").pesoEfectivo).toBeCloseTo(0.35 / 0.45, 5);
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

    it("el responsable elegido para una ACTIVIDAD manda sobre el de su fase, y el detalle cuadra con el scoreboard", () => {
      const faseKey = `b1::${LAUNCH}`;
      const proj = [item3("a", "b1", [act("s1", "late"), act("s2", "late"), act("s3", "on-time")])];
      const s = { req: [], proj, projBoards: boards, ini: [] };
      // La fase la tiene el Sponsor (excusa) pero s1 se fija al CKU ("PM" en el mapa ya cambiado) → s1 penaliza; s2 sigue excusada.
      const fase: DelayMap = { [faseKey]: { responsible: "Sponsor" }, s1: { responsible: "PM" } };
      const d = cumpl(s, fase, { [faseKey]: { responsible: "Sponsor" } });
      const estados = Object.fromEntries(d.proyectos![0].items[0].actividades.map((a) => [a.id, a.estado]));
      expect(estados).toEqual({ s1: "atraso", s2: "excusado", s3: "ok" });
      expect(d.pct).toBe(calcEntregaStatsCku(CKU, s.req, s.proj, fase, s.ini).pct);
      // Al revés: la fase penaliza (sin asignar) pero a s2 se le elige un responsable ≠ CKU → se excusa solo s2.
      const unaSola: DelayMap = { s2: { responsible: "IT" } };
      const d2 = cumpl(s, unaSola);
      expect(Object.fromEntries(d2.proyectos![0].items[0].actividades.map((a) => [a.id, a.estado]))).toEqual({ s1: "atraso", s2: "excusado", s3: "ok" });
      expect(d2.pct).toBe(calcEntregaStatsCku(CKU, s.req, s.proj, unaSola, s.ini).pct);
    });

    it("un PML con atraso excusado por el responsable elegido sale del conteo pero sigue en las unidades (para poder revertirlo)", () => {
      const s = { req: [reqE("r1", "late")], proj: [], projBoards: [board], ini: [] };
      const sinElegir = cumpl(s, {});
      expect(sinElegir.unidades.find((u) => u.id === "r1")).toMatchObject({ estado: "atraso", cuenta: true });
      const elegido: DelayMap = { r1: { responsible: "Sponsor" } };
      const d = cumpl(s, elegido, {});
      expect(d.unidades.find((u) => u.id === "r1")).toMatchObject({ estado: "excusado", cuenta: false });
      expect(d.pct).toBeNull();   // la única unidad salió de la cuenta
      // Elegir al CKU ("PM" en el mapa ya cambiado) la deja penalizando.
      expect(cumpl(s, { r1: { responsible: "PM" } }).unidades.find((u) => u.id === "r1")).toMatchObject({ estado: "atraso", cuenta: true });
    });

    it("cerró tarde pero dentro de su New Limit Date: cumplida («cumple por su nueva fecha»); fuera de ella, incumplida", () => {
      const tarde = (id: string, nueva: string) =>
        act(id, "late", { deadline: new Date("2026-06-10T00:00:00"), actualEnd: new Date("2026-06-20T00:00:00"), newLimitDate: new Date(`${nueva}T00:00:00`) });
      const proj = [item3("i1", "b1", [tarde("dentro", "2026-06-25"), tarde("fuera", "2026-06-15")])];
      const s = { req: [], proj, projBoards: boards, ini: [] };
      const d = cumpl(s, {});
      const por = (id: string) => d.proyectos![0].items[0].actividades.find((a) => a.id === id)!;
      expect(por("dentro")).toMatchObject({ estado: "ok", porNuevaFecha: true, ajustada: false });
      expect(por("fuera")).toMatchObject({ estado: "atraso", porNuevaFecha: false });
      expect(por("dentro").nuevaFecha).toEqual(new Date("2026-06-25T00:00:00"));
      // El detalle cuadra con el scoreboard.
      expect(d.pct).toBe(calcEntregaStatsCku(CKU, s.req, s.proj, {}, s.ini).pct);
      expect(d.pct).toBe(50);
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

    it("el item no es unidad: uno cerrado a tiempo sin actividades no aporta nada ni se lista, y uno atrasado tampoco aporta si sus actividades no cerraron", () => {
      const proj = [
        item3("a", "b1", [], { name: "Sin actividades", status: "Done", entrega: "on-time" }),
        item3("b", "b1", [act("s1", null)], { name: "Atrasado sin cerrar", status: "Stuck", entrega: "late" }),
      ];
      const d = cumpl({ req: [], proj, projBoards: boards, ini: [] }, {});
      expect(d.unidades.filter((u) => u.fuente === "proj")).toEqual([]);
      expect(d.fuentes.find((x) => x.fuente === "A")).toMatchObject({ total: 0, pct: null, pesoEfectivo: null });
      expect(d.proyectos![0].items.map((i) => i.nombre)).toEqual(["Atrasado sin cerrar"]);   // el que no tiene actividades no sale
    });

    it("un entregable es del CKU si su 'Responsible' lo es ('Resp' solo si 'Responsible' viene vacío); sin acentos ni mayúsculas", () => {
      const proj = [
        item3("a", "b1", [act("s1", "on-time")], { name: "A", responsible: " Javier Juarez ", resp: "" }),
        item3("b", "b1", [act("s2", "on-time")], { name: "B", responsible: "", resp: "JAVIER juárez" }),     // cae a "Resp"
        item3("c", "b1", [act("s3", "on-time")], { name: "C", responsible: "Luis Coronado", resp: CKU }),    // "Responsible" manda sobre "Resp"
        item3("d", "b1", [act("s4", "on-time")], { name: "D", responsible: "", resp: "" }),                  // nadie
        item3("e", "b1", [act("s5", "on-time")], { name: "E", responsible: "Javier Juarez Jr." }),           // otro nombre
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

  it("un proyecto sin Fase 3 todavía no aporta unidades: su clase queda sin peso", () => {
    const d = cumpl(
      { req: [], proj: [item3("p1", "b1", [act("a1", "late")], {}, "Valuación | Formulación del proyecto")], projBoards: [board], ini: [iniE("i1", true)] }, {});
    expect(d.fuentes.find((x) => x.fuente === "A")).toMatchObject({ total: 0, pct: null, pesoEfectivo: null });
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

describe("detalleCalidad — PML e Iniciativas por su responsable; actividades de Proyectos por sus fechas", () => {
  const f = (d: string) => new Date(`${d}T00:00:00`);
  const cal = (s: Omit<Parameters<typeof detalleCalidad>[0], "cku">, reproceso: DelayMap, original?: DelayMap) =>
    detalleCalidad({ ...s, cku: CKU }, reproceso, original);
  // Una actividad a cargo del CKU que cerró el mismo día de su Limit Date (calidad 1), salvo que se diga otra cosa.
  const actK = (id: string, extra: Record<string, unknown> = {}) =>
    act(id, null, { status: "Done", deadline: f("2026-06-10"), actualEnd: f("2026-06-10"), newLimitDate: null, ...extra });

  it("PML e Iniciativas son binarios: 100 con un responsable ≠ CKU, 0 sin asignar", () => {
    const rep: DelayMap = { r1: { responsible: "Sponsor" } };
    const s = { req: [reqE("r1", "on-time"), reqE("r2", "on-time")], proj: [], projBoards: [board], ini: [iniE("i1", true)] };
    const d = cal(s, rep);
    const por = (id: string) => d.unidades.find((u) => u.id === id)!;
    expect(por("r1")).toMatchObject({ nota: 100, estado: "ok", responsable: "Sponsor" });
    expect(por("r2")).toMatchObject({ nota: 0, estado: "atraso", responsable: null });
    expect(por("i1")).toMatchObject({ nota: 0, estado: "atraso", fuente: "ini" });
  });

  it("cada actividad a cargo del CKU es una unidad con su nota por fechas: 1 / 0, y las que aún no se miden no cuentan", () => {
    const proj = [item3("i1", "b1", [
      actK("a"),                                                                      // cerró a tiempo → 100
      actK("b", { actualEnd: f("2026-06-20") }),                                      // cerró tarde → 0
      actK("c", { status: "Working on it", actualEnd: null }),                        // en curso → aún no se mide (solo cuenta lo completado)
      actK("d", { newLimitDate: f("2026-12-01") }),                                   // nueva fecha límite → 0
      actK("e", { status: "Future Steps", actualEnd: null }),                         // aún no se mide
      actK("f", { responsible: "Javier Aragon", actualEnd: f("2026-06-30") }),        // de otra persona
    ])];
    const d = cal({ req: [], proj, projBoards: boards, ini: [] }, {});
    const por = (id: string) => d.unidades.find((u) => u.id === id)!;
    expect(por("a")).toMatchObject({ fuente: "proj", nota: 100, estado: "ok", valor: 1, fase: "Item i1", proyecto: "PM-001 · Demo b1" });
    expect(por("b")).toMatchObject({ nota: 0, estado: "atraso", valor: 0 });
    expect(por("d")).toMatchObject({ nota: 0 });
    expect(d.unidades.some((u) => u.id === "c" || u.id === "e" || u.id === "f")).toBe(false);
    expect(d.fuentes.find((x) => x.fuente === "A")).toMatchObject({ total: 3, buenas: 1, pct: 33 });
    expect(d.pct).toBe(33);
  });

  it("una actividad que el PMO dejó «a tiempo» (ckuAjustes) vale 100 aunque cerró tarde o tenga nueva fecha", () => {
    const [id] = [...ACTIVIDADES_A_TIEMPO.keys()];
    const proj = [item3("i1", "b1", [actK(id, { actualEnd: f("2026-06-20"), newLimitDate: f("2026-12-01") }), actK("b", { actualEnd: f("2026-06-20") })])];
    const d = cal({ req: [], proj, projBoards: boards, ini: [] }, {});
    expect(d.unidades.find((u) => u.id === id)).toMatchObject({ nota: 100, estado: "ok", valor: 1 });
    expect(d.unidades.find((u) => u.id === "b")).toMatchObject({ nota: 0 });
    expect(d.proyectosCalidad![0].items[0].actividades.find((a) => a.id === id)).toMatchObject({ nota: 100, motivo: "ajuste" });
    expect(d.fuentes.find((x) => x.fuente === "A")).toMatchObject({ total: 2, buenas: 1, pct: 50 });
  });

  it("en Proyectos un responsable por item no decide: una actividad tarde vale 0 aunque su item se excuse", () => {
    const proj = [item3("i1", "b1", [actK("a", { actualEnd: f("2026-06-20") })])];
    const d = cal({ req: [], proj, projBoards: boards, ini: [] }, { i1: { responsible: "Desarrollo" } });
    expect(d.unidades.find((u) => u.id === "a")).toMatchObject({ nota: 0, estado: "atraso" });
  });

  it("el responsable elegido para la ACTIVIDAD con calidad 0 la excusa (cuenta: false) y el detalle cuadra con el scoreboard", () => {
    const proj = [item3("i1", "b1", [
      actK("a"),                                             // 100
      actK("b", { actualEnd: f("2026-06-20") }),             // 0
      actK("c", { actualEnd: f("2026-06-21") }),             // 0
    ])];
    const s = { req: [], proj, projBoards: boards, ini: [] };
    const rep: DelayMap = { b: { responsible: "Desarrollo" }, c: { responsible: "PM" } };   // b excusada; c "PM" = el CKU tras el cambio → penaliza
    const d = cal(s, rep);
    expect(d.unidades.find((u) => u.id === "b")).toMatchObject({ nota: 0, estado: "excusado", cuenta: false });
    expect(d.unidades.find((u) => u.id === "c")).toMatchObject({ nota: 0, estado: "atraso", cuenta: true });
    expect(d.fuentes.find((x) => x.fuente === "A")).toMatchObject({ total: 2, buenas: 1, pct: 50 });
    expect(d.pct).toBe(calcReprocesoStatsPonderado(CKU, s.req, s.proj, rep, s.ini).pct);
    // En el árbol la actividad excusada sale marcada y no cuenta como mala.
    const acts = d.proyectosCalidad![0].items[0].actividades;
    expect(acts.find((x) => x.id === "b")).toMatchObject({ nota: 0, excusada: true });
    expect(contarCalidad(d.proyectosCalidad![0].items)).toEqual({ buenas: 1, malas: 1, sinMedir: 0, excusadas: 1 });
  });

  it("solo entregables a cargo del CKU: los de otra persona no son unidades ni salen en el árbol", () => {
    const proj = [
      item3("i1", "b1", [actK("a")]),
      item3("i2", "b1", [actK("b", { actualEnd: f("2026-06-20") })], { responsible: "Luis Aguilar", name: "Ajeno" }),
    ];
    const d = cal({ req: [], proj, projBoards: boards, ini: [] }, {});
    expect(d.unidades.filter((u) => u.fuente === "proj").map((u) => u.id)).toEqual(["a"]);
    expect(d.proyectosCalidad!.flatMap((p) => p.items.map((i) => i.nombre))).toEqual(["Item i1"]);
  });

  it("los boards de plantilla vieja no aparecen", () => {
    const vieja = item3("v1", "b2", [actK("v-s1", { actualEnd: f("2026-06-20") })], { name: "Desarrollo por iteraciones (Hitos) / Entrega CKU" }, "Launch | Desarrollo");
    const nueva = item3("n1", "b1", [actK("n-s1")], { name: "POC" });
    const d = cal({ req: [], proj: [vieja, nueva], projBoards: boards, ini: [] }, {});
    expect(d.proyectosCalidad!.map((p) => p.proyecto)).toEqual(["PM-001 · Demo b1"]);
    expect(d.unidades.filter((u) => u.fuente === "proj").map((u) => u.id)).toEqual(["n-s1"]);
  });

  it("el % del detalle y el conteo coinciden con el del scoreboard", () => {
    const rep: DelayMap = { r1: { responsible: "Sponsor" } };
    const s = {
      req: [reqE("r1", "on-time"), reqE("r2", "on-time")],
      proj: [item3("i1", "b1", [actK("a"), actK("b", { actualEnd: f("2026-06-20") }), actK("c", { newLimitDate: f("2026-12-01") })])],
      projBoards: [board], ini: [iniE("i1", true)],
    };
    const d = cal(s, rep);
    const stats = calcReprocesoStatsPonderado(CKU, s.req, s.proj, rep, s.ini);
    expect(d.pct).toBe(stats.pct);
    expect(d.fuentes.reduce((n, x) => n + x.total, 0)).toBe(stats.total);
    expect(d.fuentes.reduce((n, x) => n + x.buenas, 0)).toBe(stats.limpias);
  });

  describe("árbol proyecto → item → actividad", () => {
    it("trae el proyecto con sus items y actividades por fecha límite (sin fecha al final), con nota, motivo y nueva fecha", () => {
      const p = item3("a", "b1", [
        actK("s3", { name: "Salida", status: "Future Steps", actualEnd: null, deadline: f("2026-07-14") }),
        actK("s1", { name: "Requerimiento", deadline: f("2026-05-29"), actualEnd: f("2026-07-31") }),
        actK("s2", { name: "Análisis", deadline: f("2026-06-05"), actualEnd: f("2026-06-05"), newLimitDate: f("2026-12-01") }),
        actK("s4", { name: "Sin fecha", status: "Working on it", actualEnd: null, deadline: null }),
      ], { name: "Clasificación" });
      const d = cal({ req: [], proj: [p], projBoards: boards, ini: [] }, {});
      const it0 = d.proyectosCalidad![0].items[0];
      expect(it0.nombre).toBe("Clasificación");
      expect(it0.actividades.map((a) => [a.nombre, a.nota, a.motivo])).toEqual([
        ["Requerimiento", 0, "tarde"],
        ["Análisis", 0, "nueva-fecha"],
        ["Salida", null, null],
        ["Sin fecha", null, null],   // en curso: todavía no se mide
      ]);
      expect(it0.actividades[1].nuevaFecha).toEqual(f("2026-12-01"));
      expect(it0.actividades[0].cierre).toEqual(f("2026-07-31"));
      expect(contarCalidad(d.proyectosCalidad![0].items)).toEqual({ buenas: 0, malas: 2, sinMedir: 2, excusadas: 0 });
    });

    it("los items con calidad 0 van primero y el proyecto con peor calidad va primero", () => {
      const proj = [
        item3("ok", "b1", [actK("o1")], { name: "Alfa" }),
        item3("mal", "b1", [actK("m1", { actualEnd: f("2026-06-20") })], { name: "Zulu" }),
        item3("otro", "b2", [actK("x1")], { name: "Otro" }),
      ];
      const d = cal({ req: [], proj, projBoards: boards, ini: [] }, {});
      expect(d.proyectosCalidad!.map((p) => p.proyecto)).toEqual(["PM-001 · Demo b1", "PM-002 · Demo b2"]);   // b1: 50 % · b2: 100 %
      expect(d.proyectosCalidad![0].items.map((i) => i.nombre)).toEqual(["Zulu", "Alfa"]);
    });

    it("cada item trae su responsable de Monday y las actividades su Responsible", () => {
      const proj = [item3("a", "b1", [actK("s1", { responsible: " Javier Juarez " })], { name: "A", responsible: "", resp: "javier JUÁREZ" })];
      const d = cal({ req: [], proj, projBoards: boards, ini: [] }, {});
      const it0 = d.proyectosCalidad![0].items[0];
      expect(it0.responsable).toBe("javier JUÁREZ");
      expect(it0.actividades[0].responsable).toBe("Javier Juarez");
    });

    it("PML e Iniciativas no forman proyectos", () => {
      const d = cal({ req: [reqE("r1", "on-time")], proj: [], projBoards: [], ini: [iniE("i1", true)] }, {});
      expect(d.proyectosCalidad).toEqual([]);
    });
  });

  it("un empate exacto en .5 (52.5) redondea igual hacia arriba en el detalle y en el scoreboard", () => {
    // Iniciativas 100 (peso 10) · PML 100 (Clase C, peso 25) · Proyectos 1 de 20 = 5 (Clase A, peso 35) → 52.5 exacto.
    const rep: DelayMap = { i1: { responsible: "Sponsor" }, r1: { responsible: "Sponsor" } };
    const buenas = [actK("ok0")];
    const malas = Array.from({ length: 19 }, (_, i) => actK(`mal${i}`, { actualEnd: f("2026-06-20") }));
    const s = { req: [reqE("r1", "on-time")], proj: [item3("i1", "b1", [...buenas, ...malas])], projBoards: [board], ini: [iniE("i1", true)] };
    const stats = calcReprocesoStatsPonderado(CKU, s.req, s.proj, rep, s.ini);
    expect(stats.pct).toBe(53);
    expect(cal(s, rep).pct).toBe(53);
  });

  it("sin unidades: pct null", () => {
    const d = cal({ req: [], proj: [], projBoards: [], ini: [] }, {});
    expect(d.pct).toBeNull();
  });
});
