import { describe, expect, it } from "vitest";
import { faseDeGrupo, mondayADefinicion, tipoMonday } from "./importar-monday";
import { tableroADefinicion, validarDefinicion } from "./definicion";
import { tableroAMondayItems, tableroAProjItems, textoStatusParaMetricas, tituloParaMetricas } from "./metricas";
import { diferenciasProjItems } from "./paridad";
import type { Columna, Elemento, TableroCompleto } from "./tablero";

const ANA = "11111111-1111-4111-8111-111111111111";
const STATUS = JSON.stringify({ labels: { 0: "Working on it", 1: "Done", 2: "Stuck" } });

describe("importar de Monday", () => {
  it("deduce el tipo por el id y la fase por el título del grupo", () => {
    expect(["status", "date1", "date_mkwcn5xj", "numbers45", "numeric_x", "timeline9", "timerange_x", "board_relation_x", "multiple_person_x", "formula5", "lookup_x", "name"].map(tipoMonday))
      .toEqual(["status", "fecha", "fecha", "numero", "numero", "timeline", "timeline", "relacion", "personas", "formula", "espejo", "nombre"]);
    expect(["L | Launch", "Launch | Desarrollo", "1 | Valuación", "Revisión", "Cuenta X"].map(faseDeGrupo)).toEqual(["L", "L", "V", "R", null]);
  });

  it("importa tal cual, asigna roles por título y omite lo que aún no tiene tipo", () => {
    const r = mondayADefinicion({
      columnas: {
        status: { title: "Status", settings_str: STATUS },
        timeline9: { title: "CPM" },
        board_relation_a: { title: "Responsible", settings_str: '{"boardIds":[77]}' },
        multiple_person_b: { title: "Resp" },
        formula_c: { title: "Cost $" },
        numbers45: { title: "Effort Spent", settings_str: '{"unit":{"symbol":"custom","custom_unit":" hours","direction":"right"}}' },
      },
      columnasSub: { status: { title: "Status", settings_str: STATUS }, date_x: { title: "Actual End" } },
      filas: [
        { id: "1", parent_id: null, orden: 0, nombre: "Entregable", grupo: "L | Launch", column_values: [
          { id: "status", text: "Done" }, { id: "timeline9", text: "2026-01-05 - 2026-02-10" },
          { id: "board_relation_a", text: null, display_value: "Ana López" }, { id: "multiple_person_b", text: "Ana Lopez, Nadie" },
          { id: "numbers45", text: "12" },
        ] },
        { id: "2", parent_id: "1", orden: 0, nombre: "Actividad", grupo: null, column_values: [{ id: "status", text: "Working on it" }, { id: "date_x", text: "2026-02-01" }] },
      ],
      rhBoardId: "77",
      personaPorNombre: (n) => (n.toLowerCase().replace("ó", "o") === "ana lopez" ? ANA : undefined),
    });
    const d = r.definicion;
    expect(d.grupos).toEqual([{ clave: "g1", titulo: "L | Launch", color: expect.any(String), fase: "L", mondayGrupo: "L | Launch" }]);
    expect(d.columnas.map((c) => [c.nivel, c.titulo, c.tipo, c.rol])).toEqual([
      ["item", "Status", "status", "status"], ["item", "Responsible", "persona", "responsable"], ["item", "CPM", "timeline", "plan"],
      ["item", "Effort Spent", "numero", "esfuerzo_real"], ["item", "Resp", "persona", null],
      ["sub", "Status", "status", "status"], ["sub", "Actual End", "fecha", "fin_real"],
    ]);
    expect(d.columnas.find((c) => c.titulo === "Effort Spent")!.config).toMatchObject({ unidad: "hours", unidadAntes: false });
    expect(r.omitidas).toEqual([{ nivel: "item", titulo: "Cost $", tipo: "formula" }]);
    expect(r.personasNoEncontradas).toEqual(["Nadie"]);
    const item = d.elementos[0];
    expect(item.valores["item:board_relation_a"]).toEqual([ANA]);
    expect(item.valores["item:timeline9"]).toEqual({ desde: "2026-01-05", hasta: "2026-02-10" });
    expect(d.elementos[1]).toMatchObject({ padre: "1", grupo: null, mondayItemId: "2" });
  });
});

// Un tablero chico, con columnas propias de la app (títulos y etiquetas en español).
const col = (id: string, nivel: "item" | "sub", titulo: string, tipo: string, rol: string | null, config: unknown = {}): Columna =>
  ({ id, nivel, titulo, tipo, rol, config, orden: 0, ancho: null, oculta: false });
const el = (id: string, grupoId: string | null, parentId: string | null, valores: Record<string, unknown>, mondayItemId: string | null = null): Elemento =>
  ({ id, grupoId, parentId, nombre: id, orden: 0, valores, responsables: [], mondayItemId, actualizadoAt: "" });
const estado = { etiquetas: [{ id: "1", texto: "Listo", color: "#00c875", categoria: "hecho" }, { id: "2", texto: "Bloqueado", color: "#e2445c", categoria: "atascado" }] };
const tablero: TableroCompleto = {
  tablero: { id: "t", nombre: "Demo", codigo: "PM-099", categoria: "proyecto", descripcion: null, plantillaId: null, mondayBoardId: null, actualizadoAt: "" },
  grupos: [{ id: "g", titulo: "L | Launch", color: null, orden: 0, fase: "L" }],
  columnas: [
    col("s", "item", "Avance", "status", "status", estado), col("p", "item", "Fechas", "timeline", "plan"),
    col("r", "item", "Dueño", "persona", "responsable"), col("c", "item", "Presupuesto", "numero", "costo"),
    col("x", "item", "Start Date", "fecha", null), col("ss", "sub", "Avance", "status", "status", estado), col("rs", "sub", "Dueño", "persona", "responsable"),
    // El TLD es un Espejo del directorio sobre el Responsable (como el lookup de Monday).
    col("tld", "sub", "TLD", "espejo", null, { columna: "rs", campo: "tld" }),
  ],
  elementos: [
    el("i1", "g", null, { s: "1", p: { desde: "2026-01-01", hasta: "2026-01-31" }, r: [ANA], c: 100, x: "2026-01-02" }, "900"),
    el("s1", null, "i1", { ss: "2", rs: [ANA] }),
  ],
};
const personas = new Map([[ANA, { nombre: "Ana López", tld: "JA" }]]);

describe("adaptador de métricas", () => {
  it("emite cada rol con el título que espera projProcess y traduce etiquetas propias", () => {
    expect(tituloParaMetricas({ rol: "plan", nivel: "sub", titulo: "x" })).toBe("Timeline");
    expect(textoStatusParaMetricas("Listo", "hecho")).toBe("Done");
    expect(textoStatusParaMetricas("Stuck Interno", "atascado")).toBe("Stuck Interno");
    const [item] = tableroAMondayItems(tablero, personas);
    const por = (t: string) => item.column_values.find((c) => c.column?.title === t);
    expect(item.id).toBe("900"); // conserva el id de Monday
    expect(por("Status")?.text).toBe("Done");
    expect(por("CPM")?.text).toBe("2026-01-01 - 2026-01-31");
    expect(por("Responsible")?.display_value).toBe("Ana López");
    expect(por("Cost $")?.text).toBe("100");
    expect(por("Start Date")?.text).toBe("2026-01-02");
    expect(item.subitems?.[0].column_values.find((c) => c.column?.title === "TLD")?.display_value).toBe("JA");
  });

  it("projProcess lo mide: fecha límite del fin del plan, costo, status", () => {
    const [p] = tableroAProjItems(tablero, personas);
    expect(p.boardName).toBe("PM-099 | Demo");
    expect(p.status).toBe("Done");
    expect(p.deadline?.getDate()).toBe(31);
    expect(p.cost).toBe(100);
    expect(p.responsible).toBe("Ana López");
    expect(p.subitems[0].status).toBe("Stuck");
    expect(p.subitems[0].tld).toBe("JA");
  });

  it("la comparación detecta cualquier diferencia", () => {
    const a = tableroAProjItems(tablero, personas);
    expect(diferenciasProjItems(a, tableroAProjItems(tablero, personas))).toEqual([]);
    const otro = { ...tablero, elementos: [el("i1", "g", null, { ...tablero.elementos[0].valores, c: 150 }, "900"), tablero.elementos[1]] };
    expect(diferenciasProjItems(a, tableroAProjItems(otro, personas))).toEqual(expect.arrayContaining([expect.stringMatching(/cost: Monday 100 ≠ app 150/)]));
    expect(diferenciasProjItems(a, [])).toEqual(expect.arrayContaining(["1 elementos en Monday vs 0 en la app"]));
  });
});

describe("plantillas", () => {
  it("tablero → plantilla: estructura y, si se pide, nombres sin personas, fechas ni avances", () => {
    const sin = tableroADefinicion(tablero, false);
    expect(sin.elementos).toEqual([]);
    expect(sin.columnas).toHaveLength(8);
    const con = tableroADefinicion(tablero, true);
    expect(con.elementos.map((e) => [e.nombre, e.valores])).toEqual([["i1", { c: 100 }], ["s1", {}]]);
  });

  it("validarDefinicion descarta lo inválido en vez de fallar", () => {
    const d = validarDefinicion({
      grupos: [{ clave: "a", titulo: "A", fase: "Z" }],
      columnas: [{ clave: "c1", tipo: "nada" }, { clave: "c2", tipo: "fecha", rol: "fin_real" }, { clave: "c3", tipo: "fecha", rol: "fin_real" }],
      elementos: [{ clave: "e2", padre: "e1", nombre: "huérfano" }, { clave: "e1", grupo: "a", nombre: "uno" }, { clave: "e3", grupo: "zz" }],
    });
    expect(d.grupos).toEqual([{ clave: "a", titulo: "A", color: null, fase: null }]);
    expect(d.columnas.map((c) => [c.clave, c.rol])).toEqual([["c2", "fin_real"], ["c3", null]]);
    expect(d.elementos.map((e) => e.clave)).toEqual(["e1"]);
    expect(validarDefinicion(null).grupos).toHaveLength(1);
  });
});
