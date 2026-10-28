import { describe, it, expect } from "vitest";
import { calcBoardMetrics, estaFueraDeMedicion, itemsMedibles, calcProjEstado, calcProjEntrega, deriveBoardHealth, projProcess, splitBoardName, projEnrichBoards, buildIniLookup, soloBoardsDeProyecto } from "./proj";
import { today } from "./business";
import type { MondayColumnValue, MondayItem, MondaySubitem, ProjItem } from "@/types";

const daysFromToday = (n: number): Date => {
  const d = today();
  d.setDate(d.getDate() + n);
  return d;
};

describe("soloBoardsDeProyecto (descarta los boards ocultos de subitems de la carpeta)", () => {
  it("quita 'Subitems of PM-XXX | …' y deja los proyectos tal cual, en su orden", () => {
    const boards = [
      { id: "1", name: "PM-014 | CFDI-FEL C807 MX 📳" },
      { id: "2", name: "PM-015 | Gacela 100% SV 💯" },
      { id: "3", name: "Subitems of PM-015 | Gacela 100% SV 💯" },
      { id: "4", name: "PM-016 | CEDIS LOURDES SV - P1  💢" },
      { id: "5", name: "  subitems of PM-016 | CEDIS LOURDES SV - P1  💢" },
    ];
    expect(soloBoardsDeProyecto(boards).map((b) => b.id)).toEqual(["1", "2", "4"]);
  });

  it("un proyecto cuyo nombre solo contiene 'subitems' no se descarta", () => {
    expect(soloBoardsDeProyecto([{ name: "PM-020 | Migración de Subitems" }])).toHaveLength(1);
  });
});

describe("splitBoardName", () => {
  it("separa el código del nombre", () => {
    expect(splitBoardName("PM-003 | DUCAfast 2.0 GT")).toEqual({ code: "PM-003", name: "DUCAfast 2.0 GT" });
  });
  it("tolera el espaciado irregular de Monday", () => {
    expect(splitBoardName("PM-001 |  Tablero Junta Directiva")).toEqual({ code: "PM-001", name: "Tablero Junta Directiva" });
  });
  it("conserva emojis y separadores dentro del nombre", () => {
    expect(splitBoardName("PM-011 | ROAD 🚛")).toEqual({ code: "PM-011", name: "ROAD 🚛" });
    expect(splitBoardName("PM-012 | A | B")).toEqual({ code: "PM-012", name: "A | B" });
  });
  it("sin '|' devuelve code vacío y el nombre completo", () => {
    expect(splitBoardName("Board suelto")).toEqual({ code: "", name: "Board suelto" });
  });
});

describe("calcBoardMetrics", () => {
  const pItem = (o: Partial<ProjItem>): ProjItem =>
    ({ subitems: [], estado: "EN TIEMPO", deadline: null, endDate: null, entrega: null,
       grupo: "Fase", benefit: 0, cost: 0, ...o }) as ProjItem;

  it("un item atrasado en 'Working on it' cuenta en PV/AC (no en EV)", () => {
    const r = calcBoardMetrics([pItem({ id: "a", status: "Working on it", estado: "ATRASADO", cost: 100, deadline: daysFromToday(-5) })]);
    expect(r.pv).toBe(100);
    expect(r.ac).toBe(100);
    expect(r.ev).toBe(0);
    expect(r.spi).toBe(0);
  });

  it("'ATRASADO' SIN deadline (calcProjEstado(null)) no cuenta como off track — no venció, solo no tiene Limit Date", () => {
    // Mismo blindaje que enScope en projSummary.ts: un item/hito sin fecha
    // (típico Future Steps sin agendar) no debe tirar PV/scope como si hubiera
    // vencido de verdad.
    const r = calcBoardMetrics([pItem({ id: "a", status: "Working on it", estado: "ATRASADO", cost: 100, deadline: null })]);
    expect(r.pv).toBe(0);
    expect(r.scope).toBe(100);
  });

  it("un subitem 'ATRASADO' sin deadline no tira el scope del board a 0", () => {
    const r = calcBoardMetrics([
      pItem({
        id: "a", status: "Working on it", estado: "EN TIEMPO", cost: 100,
        subitems: [{ id: "s1", status: "Future Steps", estado: "ATRASADO", deadline: null } as ProjItem["subitems"][number]],
      }),
    ]);
    expect(r.scope).toBe(100);
  });

  it("'Stuck' entra en PV aunque su fecha límite no haya vencido (trabado = atrasado)", () => {
    const r = calcBoardMetrics([pItem({ id: "a", status: "Stuck", estado: "EN TIEMPO", cost: 100, deadline: daysFromToday(10) })]);
    expect(r.pv).toBe(100);
    expect(r.ev).toBe(0);
    expect(r.spi).toBe(0);
    expect(r.scope).toBe(0);
  });

  it("un item vencido que sigue en 'Future Steps' también entra en PV", () => {
    const r = calcBoardMetrics([
      pItem({ id: "done", status: "Done", cost: 100 }),
      pItem({ id: "late", status: "Future Steps", estado: "ATRASADO", cost: 100, deadline: daysFromToday(-5) }),
    ]);
    expect(r.ev).toBe(100);
    expect(r.pv).toBe(200);
    expect(r.spi).toBe(0.5);
  });
});

describe("deriveBoardHealth", () => {
  it("normaliza scope 0–100 a fracción y deriva estado", () => {
    const r = deriveBoardHealth({ ev: 10, pv: 10, ac: 10, scope: 100, spi: 1, cpi: 1 });
    expect(r.healthIndex).toBe(1);
    expect(r.healthStatus).toBe("on-track");
  });
  it("índice null cuando falta un componente", () => {
    const r = deriveBoardHealth({ ev: 0, pv: 0, ac: 0, scope: null, spi: null, cpi: null });
    expect(r.healthIndex).toBeNull();
    expect(r.healthStatus).toBeNull();
  });
});

describe("calcProjEstado", () => {
  it("sin deadline → ATRASADO", () => {
    expect(calcProjEstado(null)).toBe("ATRASADO");
  });
  it("pasado / hoy / futuro", () => {
    expect(calcProjEstado(daysFromToday(-3))).toBe("ATRASADO");
    expect(calcProjEstado(today())).toBe("PARA HOY");
    expect(calcProjEstado(daysFromToday(5))).toBe("EN TIEMPO");
  });
});

describe("calcProjEntrega", () => {
  const limit = new Date(2026, 5, 10);
  it("null si no está Done o falta fecha", () => {
    expect(calcProjEntrega("Working on it", new Date(2026, 5, 1), limit)).toBeNull();
    expect(calcProjEntrega("Done", null, limit)).toBeNull();
    expect(calcProjEntrega("Done", new Date(2026, 5, 1), null)).toBeNull();
  });
  it("on-time si cierra ≤ límite; late si lo supera", () => {
    expect(calcProjEntrega("Done", new Date(2026, 5, 10), limit)).toBe("on-time");
    expect(calcProjEntrega("Done", new Date(2026, 5, 1), limit)).toBe("on-time");
    expect(calcProjEntrega("Done", new Date(2026, 5, 11), limit)).toBe("late");
  });
});

// ── projProcess (procesador completo; columnas por TÍTULO) ────────────────
const pcol = (title: string, text: string): MondayColumnValue => ({ id: title, text, column: { title } });
const mkProj = (name: string, cols: MondayColumnValue[], subitems: MondaySubitem[] = []): MondayItem => ({
  id: name, name, group: { title: "Fase 1" }, column_values: cols, subitems,
});

describe("projProcess", () => {
  it("Done a tiempo → entrega on-time; parsea costo/beneficio y metadatos del board", () => {
    const [r] = projProcess("Board X", "b1", [mkProj("Item 1", [
      pcol("Status", "Done"),
      pcol("Limit Date", "2026-06-10"),
      pcol("End Date", "2026-06-05"),
      pcol("Cost $", "1000"),
      pcol("Benefit $", "4000"),
      pcol("PM", "Luis"),
    ])]);
    expect(r.entrega).toBe("on-time");
    expect(r.cost).toBe(1000);
    expect(r.benefit).toBe(4000);
    expect(r.valueNet).toBe(3000);
    expect(r.boardId).toBe("b1");
    expect(r.boardName).toBe("Board X");
    expect(r.pm).toBe("Luis");
  });

  it("excluye por completo los items con Status 'Out Of Scope' (no cuentan en nada, como si no existieran)", () => {
    const rows = projProcess("Board X", "b1", [
      mkProj("Descartado", [pcol("Status", "Out Of Scope"), pcol("Cost $", "500")]),
      mkProj("Vigente", [pcol("Status", "Working on it"), pcol("Cost $", "100")]),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Vigente");
  });

  it("excluye por completo los SUBITEMS con Status 'Out Of Scope' (mismo criterio que el item)", () => {
    const [r] = projProcess("Board X", "b1", [mkProj("I", [pcol("Status", "Done")], [
      { id: "s1", name: "Descartado", column_values: [pcol("Status", "Out Of Scope")] },
      { id: "s2", name: "Vigente", column_values: [pcol("Status", "Done")] },
    ])]);
    expect(r.subitems).toHaveLength(1);
    expect(r.subitems[0].name).toBe("Vigente");
  });

  it("los items y subitems 'No Viable' / 'On Hold' SIGUEN en la lista, con su status (la app los muestra)", () => {
    const rows = projProcess("Board X", "b1", [
      mkProj("No viable", [pcol("Status", "No Viable"), pcol("Cost $", "500")]),
      mkProj("En pausa", [pcol("Status", "On Hold"), pcol("Cost $", "300")]),
      mkProj("Vigente", [pcol("Status", "Working on it"), pcol("Cost $", "100")], [
        { id: "s1", name: "Sub en pausa", column_values: [pcol("Status", "On Hold")] },
      ]),
    ]);
    expect(rows.map((r) => [r.name, r.status])).toEqual([["No viable", "No Viable"], ["En pausa", "On Hold"], ["Vigente", "Working on it"]]);
    expect(rows[2].subitems.map((s) => s.status)).toEqual(["On Hold"]);
  });

  it("lee Benefit $ desde una columna espejo/formateada (display_value con $ y comas)", () => {
    const [r] = projProcess("B", "b1", [mkProj("I", [
      pcol("Status", "Done"),
      { id: "Benefit $", text: null, column: { title: "Benefit $" }, display_value: "$1,250,000" },
      { id: "Cost $", text: null, column: { title: " Cost $ " }, display_value: "50,000" },
    ])]);
    expect(r.benefit).toBe(1250000);
    expect(r.cost).toBe(50000);
  });

  it("Done después del límite → entrega late", () => {
    const [r] = projProcess("B", "b1", [mkProj("I", [
      pcol("Status", "Done"), pcol("Limit Date", "2026-06-10"), pcol("End Date", "2026-06-15"),
    ])]);
    expect(r.entrega).toBe("late");
  });

  it("procesa subitems con su propia entrega (Actual End)", () => {
    const [r] = projProcess("B", "b1", [mkProj("I", [pcol("Status", "Working on it")], [
      { id: "s1", name: "Sub 1", column_values: [
        pcol("Status", "Done"), pcol("Limit Date", "2026-06-10"), pcol("Actual End", "2026-06-01"),
      ] },
    ])]);
    expect(r.entrega).toBeNull(); // el item no está Done
    expect(r.subitems).toHaveLength(1);
    expect(r.subitems[0].name).toBe("Sub 1");
    expect(r.subitems[0].entrega).toBe("on-time");
  });

  it("lee \"Responsible\" del item y de cada subitem por separado (pueden ser personas distintas)", () => {
    const [r] = projProcess("B", "b1", [mkProj("I", [pcol("Responsible", "Karyna Pineda")], [
      { id: "s1", name: "Sub 1", column_values: [pcol("Responsible", "Gabriela Pineda")] },
    ])]);
    expect(r.responsible).toBe("Karyna Pineda");
    expect(r.subitems[0].responsible).toBe("Gabriela Pineda");
  });

  it("lee \"Start Date\" del item directo; el subitem sin esa columna (plantilla vieja) queda null", () => {
    const [r] = projProcess("B", "b1", [mkProj("I", [pcol("Start Date", "2026-01-05")], [
      { id: "s1", name: "Sub 1", column_values: [pcol("Actual End", "2026-01-10")] },
    ])]);
    expect(r.startDate).toEqual(new Date(2026, 0, 5));
    expect(r.subitems[0].startDate).toBeNull();
  });

  it("sin \"Start Date\" directo, cae al INICIO del rango Timeline/CPM (plantilla nueva)", () => {
    const [r] = projProcess("B", "b1", [mkProj("I", [pcol("CPM", "2026-03-01 - 2026-03-15")], [
      { id: "s1", name: "Sub 1", column_values: [pcol("Timeline", "2026-04-02 - 2026-04-20")] },
    ])]);
    expect(r.startDate).toEqual(new Date(2026, 2, 1));
    expect(r.subitems[0].startDate).toEqual(new Date(2026, 3, 2));
  });

  it("\"cpmStart\" siempre viene del INICIO de \"CPM\", incluso si \"Start Date\" trae otro valor (son campos independientes)", () => {
    const [r] = projProcess("B", "b1", [mkProj("I", [
      pcol("Start Date", "2026-08-28"), pcol("CPM", "2026-05-28 - 2026-07-14"),
    ], [])]);
    expect(r.startDate).toEqual(new Date(2026, 7, 28));   // "Start Date" directo, sin tocar
    expect(r.cpmStart).toEqual(new Date(2026, 4, 28));    // INICIO de "CPM", ignora "Start Date"
  });

  it("\"cpmStart\" null si el item no tiene columna \"CPM\"", () => {
    const [r] = projProcess("B", "b1", [mkProj("I", [pcol("Start Date", "2026-01-05")], [])]);
    expect(r.cpmStart).toBeNull();
  });
});

describe("projEnrichBoards", () => {
  const iniPM003 = { estrategia: "Digitalización", sponsor: "Ana Ana", cku: "CKU-1", benefitType: "HardSaving" };
  const byNameOnly = { byId: new Map(), byName: new Map([["ducafast 2.0 gt", iniPM003]]) };

  it("PM-013 no tiene Iniciativa propia: toma Estrategia/Sponsor/CKU de PM-003, pero NO su Benefit Type", () => {
    const boards = [
      { id: "b003", name: "PM-003 | DUCAfast 2.0 GT" },
      { id: "b013", name: "PM-013 | Proyecto Sin Iniciativa" },
    ];
    const [pm003, pm013] = projEnrichBoards(boards, [], byNameOnly);

    expect(pm003).toMatchObject({ estrategia: "Digitalización", sponsor: "Ana Ana", cku: "CKU-1", benefitType: "HardSaving" });
    expect(pm013.estrategia).toBe("Digitalización");
    expect(pm013.sponsor).toBe("Ana Ana");
    expect(pm013.cku).toBe("CKU-1");
    // Benefit Type NO entra en la excepción: PM-013 no matchea ninguna Iniciativa por su cuenta.
    expect(pm013.benefitType).toBe("");
  });

  it("si el board de PM-003 no está presente, PM-013 no rompe: campos vacíos como cualquier board sin Iniciativa", () => {
    const boards = [{ id: "b013", name: "PM-013 | Proyecto Sin Iniciativa" }];
    const [pm013] = projEnrichBoards(boards, [], byNameOnly);
    expect(pm013.estrategia).toBe("");
    expect(pm013.sponsor).toBe("");
    expect(pm013.cku).toBe("");
  });

  it("la excepción de Sponsor de DUCAfast SV sigue funcionando", () => {
    const boards = [{ id: "bsv", name: "PM-099 | DUCAfast SV" }];
    const [r] = projEnrichBoards(boards, [], { byId: new Map(), byName: new Map() });
    expect(r.sponsor).toBe("Javier Claros");
  });

  it("usa el Project ID (byId) aunque el nombre del board no matchee ninguna Iniciativa por nombre", () => {
    const iniPorId = { estrategia: "Evolución HN", sponsor: "Karla", cku: "CKU-2", benefitType: "SoftSaving" };
    const boards = [{ id: "b010", name: "PM-010 | Nombre Que No Existe En Iniciativas" }];
    const lookup = { byId: new Map([["PM-010", iniPorId]]), byName: new Map() };
    const [r] = projEnrichBoards(boards, [], lookup);
    expect(r).toMatchObject(iniPorId);
  });

  it("el Project ID (byId) gana sobre el match por nombre/alias cuando ambos existen", () => {
    const iniPorId = { estrategia: "Por ID", sponsor: "Sponsor ID", cku: "CKU ID", benefitType: "" };
    const iniPorNombre = { estrategia: "Por Nombre", sponsor: "Sponsor Nombre", cku: "CKU Nombre", benefitType: "" };
    const boards = [{ id: "b010", name: "PM-010 | Air & Sea" }];
    const lookup = { byId: new Map([["PM-010", iniPorId]]), byName: new Map([["air & sea", iniPorNombre]]) };
    const [r] = projEnrichBoards(boards, [], lookup);
    expect(r).toMatchObject(iniPorId);
  });

  it("sin Project ID cargado en ninguna Iniciativa, cae al match por nombre de siempre", () => {
    const boards = [{ id: "b003", name: "PM-003 | DUCAfast 2.0 GT" }];
    const [r] = projEnrichBoards(boards, [], byNameOnly);
    expect(r).toMatchObject(iniPM003);
  });

  describe("PM del proyecto: 3ª plantilla (VALOR Lite) = PM de la Iniciativa enlazada por Project ID", () => {
    const item = (boardId: string, grupo: string, resp: string) => ({ boardId, grupo, resp, pm: "", responsible: "" }) as unknown as ProjItem;
    const ini = (pm: string | undefined) => ({ estrategia: "", sponsor: "", cku: "", benefitType: "", pm });
    const lookup = (pm: string | undefined) => ({ byId: new Map([["PM-016", ini(pm)]]), byName: new Map() });
    const board = { id: "b16", name: "PM-016 | CEDIS LOURDES SV - P1" };

    it("el board con grupos 'L | Launch' toma el PM de la Iniciativa, no el del primer item", () => {
      const items = [item("b16", "V | Valuación", "JC Rodas"), item("b16", "L | Launch", "Marvin Morales")];
      const [r] = projEnrichBoards([board], items, lookup("Daniela Alvarez"));
      expect(r.pm).toBe("Daniela Alvarez");
    });

    it("un board de las otras plantillas conserva el PM de su primer item aunque la Iniciativa tenga otro", () => {
      const items = [item("b16", "Valuación | Formulación del proyecto", "David Guzmán")];
      const [r] = projEnrichBoards([board], items, lookup("Daniela Alvarez"));
      expect(r.pm).toBe("David Guzmán");
    });

    it("si la Iniciativa no trae PM (o no hay Iniciativa), cae al del primer item", () => {
      const items = [item("b16", "L | Launch", "JC Rodas")];
      expect(projEnrichBoards([board], items, lookup(undefined))[0].pm).toBe("JC Rodas");
      expect(projEnrichBoards([board], items, lookup(""))[0].pm).toBe("JC Rodas");
      expect(projEnrichBoards([board], items, { byId: new Map(), byName: new Map() })[0].pm).toBe("JC Rodas");
    });

    it("cada board decide por sí mismo: uno Lite y otro no, en la misma carga", () => {
      const lookupDos = { byId: new Map([["PM-016", ini("Daniela Alvarez")], ["PM-012", ini("Luis Aguilar")]]), byName: new Map() };
      const boards = [board, { id: "b12", name: "PM-012 | DUCAfast Reg" }];
      const items = [item("b16", "L | Launch", "JC Rodas"), item("b12", "Launch | Lanzamiento", "David Guzmán")];
      expect(projEnrichBoards(boards, items, lookupDos).map((b) => b.pm)).toEqual(["Daniela Alvarez", "David Guzmán"]);
    });
  });

  describe("buildIniLookup: PM de la Iniciativa", () => {
    const ini = (name: string, projectId: string, pm: string): MondayItem => ({
      id: name, name, group: { title: "Aprobadas" },
      column_values: [{ id: "text_mm3ajvj5", text: projectId }, { id: "multiple_person_mm3akwgd", text: pm }],
    });

    it("lee la columna PM y la enlaza por el Project ID (sin importar mayúsculas)", () => {
      const lk = buildIniLookup([ini("CEDIs LOURDES - SV", "pm-016", "Daniela Alvarez")]);
      expect(lk.byId.get("PM-016")?.pm).toBe("Daniela Alvarez");
    });

    it("con varias personas en la columna, el PM es la primera; vacía → ''", () => {
      expect(buildIniLookup([ini("A", "PM-020", " Luis Aguilar , Daniela Alvarez ")]).byId.get("PM-020")?.pm).toBe("Luis Aguilar");
      expect(buildIniLookup([ini("B", "PM-021", "")]).byId.get("PM-021")?.pm).toBe("");
    });
  });
});

describe("estaFueraDeMedicion / itemsMedibles (No Viable y On Hold se muestran pero no cuentan)", () => {
  const item = (id: string, status: string, subs: string[] = []) =>
    ({ id, status, subitems: subs.map((s, i) => ({ id: `${id}.${i}`, status: s })) }) as unknown as ProjItem;

  it.each(["No Viable", "no viable", "No viable ", "On Hold", "on hold", "On-Hold", "ON  HOLD"])("'%s' queda fuera de la medición", (status) => {
    expect(estaFueraDeMedicion(status)).toBe(true);
  });

  it("Stuck, Working on it, Future Steps, Done, Out Of Scope y vacío NO son de este grupo", () => {
    for (const s of ["Stuck", "Working on it", "Future Steps", "Done", "Out Of Scope", ""]) expect(estaFueraDeMedicion(s)).toBe(false);
    expect(estaFueraDeMedicion(null)).toBe(false);
    expect(estaFueraDeMedicion(undefined)).toBe(false);
  });

  it("itemsMedibles quita los items fuera (con sus subitems) y los subitems fuera de los items que sí cuentan", () => {
    const lista = [
      item("a", "Working on it", ["Done", "On Hold", "Stuck"]),
      item("b", "On Hold", ["Done"]),
      item("c", "No Viable"),
      item("d", "Done", ["Done"]),
    ];
    const r = itemsMedibles(lista);
    expect(r.map((x) => x.id)).toEqual(["a", "d"]);
    expect(r[0].subitems.map((s) => s.status)).toEqual(["Done", "Stuck"]);
  });

  it("itemsMedibles no toca el original y reutiliza los items que no cambian", () => {
    const lista = [item("a", "Working on it", ["On Hold"]), item("d", "Done", ["Done"])];
    const r = itemsMedibles(lista);
    expect(lista[0].subitems).toHaveLength(1); // el original sigue igual
    expect(r[1]).toBe(lista[1]);
  });
});
