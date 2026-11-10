import { describe, expect, it } from "vitest";
import { analizar, ErrorFormula, evaluar, idsATitulos, titulosAIds, type ValorF } from "./formulas";
import { calcularTablero, errorFormula, valorDeCelda } from "./calculos";
import { traducirFormula } from "./importar-monday";
import { errorColumna, type Columna, type Elemento } from "./tablero";
import { rolesParaTipo } from "./roles";
import { tableroAProjItems } from "./metricas";
import { normalizarTextoComentario } from "./bitacora";

const HOY = "2026-11-10";
const ev = (expr: string, vals: Record<string, ValorF> = {}) => evaluar(analizar(expr), (r) => vals[r] ?? null, HOY);

describe("motor de fórmulas", () => {
  it("aritmética con precedencia, paréntesis, unarios y vacío como 0", () => {
    expect(ev("1 + 2 * 3")).toBe(7);
    expect(ev("(1 + 2) * 3")).toBe(9);
    expect(ev("-{a} + 10", { a: 4 })).toBe(6);
    expect(ev("{x} * 9")).toBe(0);
    expect(ev("10 / 0")).toBeNull();
    expect(ev('"a" & 1 & "b"')).toBe("a1b");
  });

  it("fechas y rangos: #End/#Fin, DAYS (a − b), FORMAT_DATE, sumar días, HOY", () => {
    const plan = { desde: "2026-01-05", hasta: "2026-02-10" };
    expect(ev("{p#End}", { p: plan })).toBe("2026-02-10");
    expect(ev("{p#Inicio}", { p: plan })).toBe("2026-01-05");
    expect(ev('FORMAT_DATE({p#End}, "ddd, MMM D")', { p: plan })).toBe("2026-02-10");
    expect(ev("FIN({p})", { p: plan })).toBe("2026-02-10");
    expect(ev("DAYS({p#End}, {f})", { p: plan, f: "2026-02-12" })).toBe(-2);
    expect(ev("{f} + 3", { f: "2026-02-27" })).toBe("2026-03-02");
    expect(ev("HOY()")).toBe(HOY);
    expect(ev("DAYS({p#End}, {f})", { p: plan })).toBeNull();
  });

  it("la fórmula Completion Status de Monday tal cual", () => {
    const f = 'IF({s}="Done",IF(DAYS({p#End},{f})<0,"Done Late ☑️",IF(DAYS({p#End},{f})>=0,"Done On Time ✅","")),"")';
    const p = { desde: "2026-01-01", hasta: "2026-01-31" };
    expect(ev(f, { s: "Done", p, f: "2026-02-03" })).toBe("Done Late ☑️");
    expect(ev(f, { s: "Done", p, f: "2026-01-30" })).toBe("Done On Time ✅");
    expect(ev(f, { s: "Working on it", p })).toBe("");
  });

  it("funciones en español, lógicas, redondeo y separador ;", () => {
    expect(ev('SI(Y({a}>1; NO({b})); "sí"; "no")', { a: 2, b: false })).toBe("sí");
    expect(ev("REDONDEAR(2.345, 2)")).toBe(2.35);
    expect(ev("SUMA(1, 2, 3) + MAX(4, 9) - MIN(1, 0)")).toBe(15);
    expect(ev('{s} = "Done"', { s: "Done" })).toBe(true);
    expect(ev("{a} <> 3", { a: 3 })).toBe(false);
  });

  it("errores claros, nunca eval", () => {
    expect(() => analizar("1 +")).toThrow(ErrorFormula);
    expect(() => analizar("FOO(1)")).toThrow(/No conozco la función FOO/);
    expect(() => analizar('"abc')).toThrow(/comillas/);
    expect(() => analizar("{a#Medio}")).toThrow(/#Inicio o #Fin/);
    expect(() => analizar("1 2")).toThrow(/Sobra/);
    expect(() => analizar("alert(1)")).toThrow(/No conozco la función/);
    expect(() => ev("IF(1)")).toThrow(/IF recibe 2–3 argumentos/);
  });

  it("títulos ↔ ids", () => {
    const cols = [{ id: "c1", titulo: "Effort Spent" }, { id: "c2", titulo: "CPM" }];
    expect(titulosAIds("{effort spent} * 9 + DAYS({CPM#Fin}, HOY())", cols)).toBe("{c1} * 9 + DAYS({c2#Fin}, HOY())");
    expect(idsATitulos("{c1} * 9 & {nombre}", cols)).toBe("{Effort Spent} * 9 & {Nombre}");
    expect(() => titulosAIds("{Nada}", cols)).toThrow(/No hay una columna «Nada»/);
  });

  it("traduce fórmulas de Monday a claves importadas y deduce el formato", () => {
    const imp = new Set(["numbers45", "timeline9"]);
    expect(traducirFormula("{numbers45} * 9", "item", imp)).toEqual({ expresion: "{item:numbers45} * 9", formato: "numero" });
    expect(traducirFormula('FORMAT_DATE({timeline9#End}, "ddd")', "sub", imp)).toEqual({ expresion: 'FORMAT_DATE({sub:timeline9#End}, "ddd")', formato: "fecha" });
    expect(traducirFormula('IF({x}="a","b","")', "item", imp).expresion).toBe('IF({?x}="a","b","")');
  });
});

const col = (id: string, tipo: string, config: unknown = {}, extra: Partial<Columna> = {}): Columna =>
  ({ id, nivel: "item", titulo: id, tipo, rol: null, config, orden: 0, ancho: null, oculta: false, ...extra });
const el = (id: string, valores: Record<string, unknown>, parentId: string | null = null): Elemento =>
  ({ id, grupoId: parentId ? null : "g", parentId, nombre: `Elemento ${id}`, orden: 0, valores, responsables: [], mondayItemId: null, actualizadoAt: "" });
const ANA = "11111111-1111-4111-8111-111111111111";
const formula = (expresion: string, formato = "numero") => ({ expresion, formato, decimales: 2, unidad: "", unidadAntes: false });

describe("columnas calculadas", () => {
  const columnas = [
    col("esf", "numero"), col("plan", "timeline"), col("resp", "persona"),
    col("costo", "formula", formula("{esf} * 9"), { rol: "costo" }),
    col("valor", "formula", formula("100 - {costo}")),
    col("limite", "formula", formula("FIN({plan})", "fecha"), { rol: "fecha_limite" }),
    col("tld", "espejo", { columna: "resp", campo: "tld" }),
    col("etiqueta", "formula", formula('{nombre} & " · " & {resp}', "texto")),
    col("docs", "archivo"),
  ];
  const elementos = [el("1", { esf: 2, plan: { desde: "2026-01-01", hasta: "2026-01-31" }, resp: [ANA] }), el("2", {})];
  const personas = new Map([[ANA, { nombre: "Ana López", tld: "JA" }]]);
  const archivos = [{ id: "a1", elementoId: "1", columnaId: "docs", nombre: "bc.pdf" }];

  it("calcula fórmula sobre fórmula, fecha, espejo del directorio, texto y archivos", () => {
    const c = calcularTablero({ columnas, elementos }, { personas, archivos, hoy: HOY });
    expect(c.errores.size).toBe(0);
    expect(c.valores.get("1")).toEqual({ costo: 18, valor: 82, limite: "2026-01-31", tld: "JA", etiqueta: "Elemento 1 · Ana López", docs: ["a1"] });
    expect(c.valores.get("2")).toMatchObject({ costo: 0, valor: 100, limite: null, tld: null, docs: null });
    expect(valorDeCelda(c, elementos[0], columnas[0])).toBe(2);
  });

  it("detecta ciclos y referencias que no existen", () => {
    const ciclo = [col("a", "formula", formula("{b} + 1")), col("b", "formula", formula("{a} + 1"))];
    expect(errorFormula("{b} + 1", "item", ciclo, "a")).toMatch(/se usa a sí misma/);
    expect(errorFormula("{a} + 1", "item", ciclo, "a")).toMatch(/se usa a sí misma/);
    expect(errorFormula("{zz} + 1", "item", ciclo)).toMatch(/no existe/);
    expect(errorFormula("{b} + ", "item", ciclo)).toMatch(/termina/);
    const c = calcularTablero({ columnas: ciclo, elementos: [el("1", {})] }, { personas: new Map() });
    expect(c.errores.get("a") ?? c.errores.get("b")).toMatch(/se usa a sí misma/);
  });

  it("una fórmula tiene rol solo si devuelve lo que el rol necesita", () => {
    expect(rolesParaTipo("formula", { formato: "fecha" }).map((r) => r.clave)).toEqual(["fecha_limite", "nueva_fecha_limite"]);
    expect(errorColumna({ tipo: "formula", rol: "costo", nivel: "item", config: formula("1", "fecha") }, [])).toMatch(/un número/);
    expect(errorColumna({ tipo: "formula", rol: "costo", nivel: "item", config: formula("1") }, [])).toBeNull();
  });

  it("las métricas leen la fórmula con rol (costo y fecha límite calculados)", () => {
    const t = {
      tablero: { id: "t", nombre: "Demo", codigo: null, categoria: "proyecto", descripcion: null, plantillaId: null, mondayBoardId: null, actualizadoAt: "" },
      grupos: [{ id: "g", titulo: "G", color: null, orden: 0, fase: null }],
      columnas: [...columnas, col("st", "status", { etiquetas: [{ id: "1", texto: "Done", color: "#00c875", categoria: "hecho" }] }, { rol: "status" })],
      elementos,
    };
    const [p] = tableroAProjItems(t, personas);
    expect(p.cost).toBe(18);
    expect(p.deadline?.getDate()).toBe(31);
  });

  it("bitácora: normaliza el texto", () => {
    expect(normalizarTextoComentario("  hola\r\n\n\n\nmundo  ")).toBe("hola\n\nmundo");
    expect(normalizarTextoComentario("   ")).toBeNull();
    expect(normalizarTextoComentario(5)).toBeNull();
  });
});
