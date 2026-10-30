import { describe, it, expect } from "vitest";
import { swapPmCku } from "@/lib/players";
import { lateExcused, type DelayMap } from "@/lib/delay";

const m = (responsible: string | null): DelayMap =>
  ({ x: { responsible } } as unknown as DelayMap);

describe("swapPmCku — para un CKU penaliza 'CKU' en vez de 'PM'", () => {
  it("CKU penaliza, PM excusa", () => {
    expect(lateExcused("x", swapPmCku(m("CKU")))).toBe(false);
    expect(lateExcused("x", swapPmCku(m("PM")))).toBe(true);
  });
  it("sin asignar sigue penalizando y los demás responsables excusan", () => {
    expect(lateExcused("x", swapPmCku({}))).toBe(false);
    expect(lateExcused("x", swapPmCku(m("Sponsor")))).toBe(true);
    expect(lateExcused("x", swapPmCku(m("Sin reproceso")))).toBe(true);
  });
  it("no muta el mapa original", () => {
    const orig = m("CKU");
    swapPmCku(orig);
    expect(orig.x.responsible).toBe("CKU");
  });
});

import { buildCkuScope, ckuDeEmail, ckuNameForEmail, cuentaEnPlayers, PLAYER_CKUS } from "@/lib/players";
import { esRolCku } from "@/lib/permissions";
import { calcNpsFromRecords } from "@/lib/nps";
import type { MondayItem, NpsRecord } from "@/types";

const hr = (name: string, email: string, role: string) =>
  ({ id: name, name, group: { title: "x" }, column_values: [
    { id: "email_mkz5qg4v", text: email }, { id: "dropdown_mkz53tjj", text: role },
  ] } as unknown as MondayItem);

describe("ckuNameForEmail", () => {
  const items = [hr("Javier Juarez", "JJ@x.com", "CKU"), hr("Ana PM", "ana@x.com", "PM"), hr("Multi", "m@x.com", "DEV, CKU")];
  it("devuelve el nombre solo si el Role incluye CKU (sin importar mayúsculas)", () => {
    expect(ckuNameForEmail(items, "jj@x.com")).toBe("Javier Juarez");
    expect(ckuNameForEmail(items, "m@x.com")).toBe("Multi");
    expect(ckuNameForEmail(items, "ana@x.com")).toBeNull();
    expect(ckuNameForEmail(items, "otro@x.com")).toBeNull();
    expect(ckuNameForEmail(items, "")).toBeNull();
  });
});

const rec = (over: Partial<NpsRecord>): NpsRecord => ({
  answers: { nps: 10 }, pm: "", invalidated: false, respondentEmail: "", submittedAt: "", reqCode: "", reqId: "", ...over,
});

describe("NPS de encuestas enviadas por CKU", () => {
  it("no entran al NPS global ni al de un PM", () => {
    const records = [rec({ pm: "PM1", reqId: "r1" }), rec({ pm: "PM1", reqId: "r1", cku: "Javier Juarez" })];
    expect(calcNpsFromRecords(records).total).toBe(1);
    expect(calcNpsFromRecords(records, "PM1").total).toBe(1);
  });
  it("solo cuentan para el player de ese CKU, no las de los PM sobre sus PML", () => {
    const base = { ini: [], proj: [], projBoards: [] } as never as Parameters<typeof buildCkuScope>[1];
    const data = {
      ...base,
      req: [{ id: "r1", cku: "Javier Juarez" }] as never,
      npsRecords: [
        rec({ pm: "PM1", reqId: "r1" }),                                  // enviada por el PM → no cuenta
        rec({ pm: "PM1", reqId: "r1", cku: "Javier Juarez" }),           // enviada por el CKU → cuenta
        rec({ pm: "PM1", reqId: "r1", cku: "Victoria Escobar" }),        // de otro CKU → no cuenta
      ],
    } as Parameters<typeof buildCkuScope>[1];
    const s = buildCkuScope("Javier Juarez", data);
    expect(s.npsRecords).toHaveLength(1);
    expect(calcNpsFromRecords(s.npsRecords, "Javier Juarez").total).toBe(1);
  });
  it("sin encuestas propias el NPS del CKU queda sin dato", () => {
    const data = { ini: [], proj: [], projBoards: [], req: [{ id: "r1", cku: "Javier Juarez" }] as never,
      npsRecords: [rec({ pm: "PM1", reqId: "r1" })] } as Parameters<typeof buildCkuScope>[1];
    const s = buildCkuScope("Javier Juarez", data);
    expect(calcNpsFromRecords(s.npsRecords, "Javier Juarez").nps).toBeNull();
  });
});

describe("Iniciativas en 'Sin Valor Def' (EN_ESPERA) no se toman en cuenta en Players", () => {
  const ini = (id: string, estado: string, cku = "Javier Juarez") => ({ id, estado, cku, pm: "Luis" });
  const data = (inis: ReturnType<typeof ini>[]) =>
    ({ ini: inis, req: [], proj: [], projBoards: [], npsRecords: [] }) as never as Parameters<typeof buildCkuScope>[1];

  it("cuentaEnPlayers deja fuera solo EN_ESPERA", () => {
    expect(cuentaEnPlayers(ini("a", "EN_ESPERA") as never)).toBe(false);
    for (const e of ["APROBADA", "EN TIEMPO", "ATRASADO", "POR_DEFINIR", "PLAN_FUTURO", "CAMBIO_ESTRATEGIA"])
      expect(cuentaEnPlayers(ini("a", e) as never)).toBe(true);
  });

  it("el scope del CKU no incluye sus Iniciativas en espera (las de otro CKU tampoco se mezclan)", () => {
    const s = buildCkuScope("Javier Juarez", data([
      ini("i1", "APROBADA"), ini("i2", "EN_ESPERA"), ini("i3", "EN TIEMPO"), ini("i4", "EN_ESPERA", "Victoria Escobar"),
    ]));
    expect(s.ini.map((i) => i.id)).toEqual(["i1", "i3"]);
  });
});

describe("ckuDeEmail / esRolCku — un rol CKU ve solo lo suyo", () => {
  const directorio = [
    { name: "Javier Juarez", email: "Implementacion@c807.com" },
    { name: "Víctoria Escobar", email: "aduana85@c807.com" },   // con acento: el match de nombre lo ignora
    { name: "Daniela Alvarez", email: "pm3@c807.com" },          // está en el Directorio pero no es un player CKU
  ];

  it("liga el correo con su CKU sin importar mayúsculas ni espacios", () => {
    expect(ckuDeEmail(directorio, "  implementacion@C807.COM ")).toBe("Javier Juarez");
    expect(ckuDeEmail(directorio, "aduana85@c807.com")).toBe("Victoria Escobar");
  });

  it("devuelve el nombre canónico de PLAYER_CKUS (el que usan las listas y el scope)", () => {
    expect(PLAYER_CKUS).toContain(ckuDeEmail(directorio, "aduana85@c807.com"));
  });

  it("null si el correo es de alguien que no es un player, no está en el Directorio, o viene vacío", () => {
    expect(ckuDeEmail(directorio, "pm3@c807.com")).toBeNull();
    expect(ckuDeEmail(directorio, "desconocido@c807.com")).toBeNull();
    expect(ckuDeEmail(directorio, "")).toBeNull();
    expect(ckuDeEmail([], "aduana85@c807.com")).toBeNull();
  });

  it("esRolCku reconoce el rol por nombre (sin importar mayúsculas ni espacios)", () => {
    for (const r of ["CKU", "cku", " Cku "]) expect(esRolCku(r)).toBe(true);
    for (const r of ["PM", "Administrador", "CKU Senior", "", undefined]) expect(esRolCku(r)).toBe(false);
  });
});

// ── Filtro por mes ───────────────────────────────────────────────────────
import { claveMesDe, etiquetaMesLargo, mesesConActividades, proyectosDelMes } from "@/lib/players";
import { buildBoardHealthMap, calcEntregaStatsCku, calcPmMetrics, calcReprocesoStatsPonderado, entregablesDelCku } from "@/lib/dashboard";
import type { ProjBoard, ProjItem, ProjSubitem } from "@/types";

describe("filtro por mes de los Players (por el Limit Date de cada actividad)", () => {
  const f = (d: string) => new Date(`${d}T00:00:00`);
  const CKU = "Javier Juarez";
  /** Actividad a cargo del CKU: por defecto cerró a tiempo (entrega on-time; calidad 1). */
  const act = (id: string, deadline: string | null, extra: Partial<ProjSubitem> = {}) =>
    ({ id, name: id, status: "Done", responsible: CKU, deadline: deadline ? f(deadline) : null,
      actualEnd: deadline ? f(deadline) : null, newLimitDate: null, entrega: "on-time", ...extra }) as unknown as ProjSubitem;
  const item = (id: string, subs: ProjSubitem[]) =>
    ({ id, boardId: "b1", boardName: "PM-001 | Demo", grupo: "Launch | Lanzamiento", name: `Item ${id}`, status: "Working on it",
      responsible: CKU, resp: "", pm: CKU, entrega: null, deadline: null, subitems: subs }) as unknown as ProjItem;

  // Septiembre: 2 a tiempo · Octubre: 1 a tiempo y 1 tarde (cerró tarde y sin nueva fecha → calidad 0)
  const sep1 = act("s1", "2026-09-10"), sep2 = act("s2", "2026-09-20");
  const oct1 = act("o1", "2026-10-05");
  const oct2 = act("o2", "2026-10-15", { actualEnd: f("2026-10-25"), entrega: "late" });
  const proj = [item("i1", [sep1, sep2, oct1, oct2])];

  it("claveMesDe y etiquetaMesLargo", () => {
    expect(claveMesDe(f("2026-10-31"))).toBe("2026-10");
    expect(claveMesDe(f("2026-01-01"))).toBe("2026-01");
    expect(etiquetaMesLargo("2026-10")).toBe("Octubre 2026");
    expect(etiquetaMesLargo("2026-12")).toBe("Diciembre 2026");
    expect(etiquetaMesLargo("raro")).toBe("raro");
  });

  describe("mesesConActividades", () => {
    it("solo los meses con algo que medir, en orden cronológico", () => {
      const pendiente = act("f1", "2026-12-01", { status: "Future Steps", actualEnd: null, entrega: null });   // aún no se mide
      const enCurso = act("w1", "2026-11-10", { status: "Working on it", actualEnd: null, entrega: null });    // en curso: solo cuenta lo completado → no se mide
      expect(mesesConActividades([oct1, pendiente, sep1, enCurso])).toEqual(["2026-09", "2026-10"]);
    });

    it("una actividad sin Limit Date no pertenece a ningún mes", () => {
      expect(mesesConActividades([act("x", null, { entrega: "on-time" })])).toEqual([]);
    });

    it("una actividad con New Limit Date se mide (calidad 0) en el mes de su Limit Date original", () => {
      const movida = act("m1", "2026-08-12", { status: "Future Steps", actualEnd: null, entrega: null, newLimitDate: f("2026-12-01") });
      expect(mesesConActividades([movida])).toEqual(["2026-08"]);
    });
  });

  describe("proyectosDelMes", () => {
    it("sin mes devuelve el mismo arreglo", () => {
      expect(proyectosDelMes(proj, null)).toBe(proj);
    });

    it("deja en cada item solo las actividades cuyo Limit Date cae en el mes, sin tocar el original", () => {
      const oct = proyectosDelMes(proj, "2026-10");
      expect(oct[0].subitems.map((s) => s.id)).toEqual(["o1", "o2"]);
      expect(proj[0].subitems).toHaveLength(4);
    });

    it("conserva los items aunque se queden sin actividades (la plantilla del board se decide con ellos) y descarta las actividades sin Limit Date", () => {
      const conSinFecha = [item("i1", [sep1, act("sf", null)]), item("i2", [])];
      const oct = proyectosDelMes(conSinFecha, "2026-10");
      expect(oct.map((p) => p.id)).toEqual(["i1", "i2"]);
      expect(oct[0].subitems).toEqual([]);
      expect(proyectosDelMes(conSinFecha, "2026-09")[0].subitems.map((s) => s.id)).toEqual(["s1"]);
    });

    it("no cambia la plantilla del board: un item 'Desarrollo por iteraciones' sin actividades en el mes sigue haciéndolo de plantilla vieja", () => {
      const vieja = { ...item("v", [act("v1", "2026-09-10")]), name: "Desarrollo por iteraciones (Hitos) / Entrega CKU" } as ProjItem;
      expect(entregablesDelCku(proyectosDelMes([vieja, item("n", [act("n1", "2026-10-05")])], "2026-10"), CKU)).toEqual([]);
    });
  });

  describe("recalcula Cumplimiento, Calidad y el Player con las actividades del mes", () => {
    it("Cumplimiento y Calidad de Proyectos salen del mes elegido", () => {
      const cumpl = (mes: string | null) => calcEntregaStatsCku(CKU, [], proyectosDelMes(proj, mes), {});
      const calid = (mes: string | null) => calcReprocesoStatsPonderado(CKU, [], proyectosDelMes(proj, mes), {});
      expect(cumpl(null).pct).toBe(75);          // 3 de 4 a tiempo
      expect(cumpl("2026-09").pct).toBe(100);    // 2 de 2
      expect(cumpl("2026-10").pct).toBe(50);     // 1 de 2
      expect(calid(null).pct).toBe(75);
      expect(calid("2026-09").pct).toBe(100);
      expect(calid("2026-10").pct).toBe(50);
      expect(cumpl("2026-11").pct).toBeNull();   // sin actividades ese mes: Proyectos no pesa
    });

    it("el Player cambia con el mes, y lo que no depende de las actividades (EVM, NPS, Beneficio) se queda igual", () => {
      const boards = [{ id: "b1", name: "PM-001 | Demo", pm: CKU }] as ProjBoard[];
      const bhm = buildBoardHealthMap(proj, boards, {});
      const row = (mes: string | null) =>
        calcPmMetrics(CKU, [], [], proyectosDelMes(proj, mes), boards, bhm, new Map(), [], {}, {}, undefined, {}, {}, true);
      const sep = row("2026-09"), oct = row("2026-10");
      expect(sep.entPct).toBe(100);
      expect(oct.entPct).toBe(50);
      expect(sep.reprocesoPct).toBe(100);
      expect(oct.reprocesoPct).toBe(50);
      expect(sep.kpi.score).toBeGreaterThan(oct.kpi.score);
      expect(sep.evmPct).toBe(oct.evmPct);
      expect(sep.nps).toEqual(oct.nps);
      expect(sep.benefit).toBe(oct.benefit);
    });
  });
});
