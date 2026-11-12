import { describe, expect, it } from "vitest";
import {
  columnasPorDefecto, elementosVisibles, errorColumna, normalizarColumnaNueva, textoCelda, validarValor, valoresIniciales, vecino,
  type Columna, type Elemento,
} from "./tablero";
import type { ReglaPermiso, UsuarioTableros } from "./permisos";

const col = (id: string, tipo: string, rol: string | null = null, nivel: "item" | "sub" = "item", config: unknown = {}): Columna =>
  ({ id, nivel, titulo: id, tipo, rol, config, orden: 0, ancho: null, oculta: false });

const el = (id: string, parentId: string | null, responsables: string[] = []): Elemento =>
  ({ id, grupoId: parentId ? null : "g", parentId, nombre: id, orden: 0, valores: {}, responsables, mondayItemId: null, actualizadoAt: "" });

describe("columnas", () => {
  it("un tablero de Proyecto nace con las columnas que su categoría pide para medirse", () => {
    const cols = columnasPorDefecto("proyecto");
    expect(cols.map((c) => [c.rol, c.tipo])).toEqual([
      ["status", "status"], ["responsable", "persona"], ["plan", "timeline"], ["fecha_limite", "fecha"], ["fin_real", "fecha"], ["costo", "numero"],
    ]);
    expect(columnasPorDefecto("libre").map((c) => c.rol)).toEqual(["responsable", "status", "fecha_limite"]);
  });

  it("valida rol contra tipo y que el rol no se repita en el mismo nivel", () => {
    const existentes = [col("a", "fecha", "fecha_limite")];
    expect(errorColumna({ tipo: "texto", rol: "fecha_limite", nivel: "item" }, [])).toMatch(/no se puede poner/);
    expect(errorColumna({ tipo: "fecha", rol: "fecha_limite", nivel: "item" }, existentes)).toMatch(/Ya hay una columna/);
    expect(errorColumna({ tipo: "fecha", rol: "fecha_limite", nivel: "sub" }, existentes)).toBeNull();
    expect(errorColumna({ id: "a", tipo: "fecha", rol: "fecha_limite", nivel: "item" }, existentes)).toBeNull();
    expect(errorColumna({ tipo: "nada", rol: null, nivel: "item" }, [])).toMatch(/desconocido/);
  });

  it("normaliza una columna nueva con la config por defecto de su tipo", () => {
    expect(normalizarColumnaNueva({ titulo: "  Costo ", tipo: "numero", rol: "costo" }))
      .toEqual({ nivel: "item", titulo: "Costo", tipo: "numero", rol: "costo", config: { decimales: 2, unidad: "", unidadAntes: false } });
    expect(normalizarColumnaNueva({ titulo: "", tipo: "numero" })).toBeNull();
  });

  it("vecino para mover arriba/abajo", () => {
    const l = [{ id: "a", orden: 0 }, { id: "b", orden: 1 }, { id: "c", orden: 2 }];
    expect(vecino(l, "b", -1)?.id).toBe("a");
    expect(vecino(l, "c", 1)).toBeNull();
  });
});

describe("valores", () => {
  const status = col("s", "status", "status", "item", { etiquetas: [{ id: "1", texto: "Listo", color: "#00c875", categoria: "hecho" }] });
  it("valida con el registro de tipos y muestra el texto", () => {
    expect(validarValor(status, "1")).toBe("1");
    expect(validarValor(status, "9")).toBeNull();
    expect(validarValor(col("x", "nada"), "1")).toBeUndefined();
    expect(textoCelda(status, "1")).toBe("Listo");
    expect(textoCelda(col("f", "fecha"), "2026-11-10")).toBe("10/11/2026");
    expect(textoCelda(col("f", "fecha"), undefined)).toBe("");
  });
});

describe("solo lo mío con familia", () => {
  const ana = "11111111-1111-4111-8111-111111111111";
  const t = { id: "t", categoria: "proyecto" };
  const reglas: ReglaPermiso[] = [{ rolId: "dev", tableroId: null, categoria: "proyecto", nivel: "editar_valores", columnasEditables: [], soloLoMio: true }];
  const dev: UsuarioTableros = { rolId: "dev", esAdmin: false, personaId: ana };
  const elementos = [el("i1", null, [ana]), el("s1", "i1"), el("i2", null), el("s2", "i2", [ana]), el("i3", null), el("s3", "i3")];

  it("ve lo suyo, el padre de sus subelementos y los subelementos de sus elementos", () => {
    expect(elementosVisibles(dev, t, reglas, elementos).map((e) => e.id)).toEqual(["i1", "s1", "i2", "s2"]);
  });
  it("sin regla no ve nada; Admin ve todo", () => {
    expect(elementosVisibles({ ...dev, rolId: "otro" }, t, reglas, elementos)).toEqual([]);
    expect(elementosVisibles({ rolId: null, esAdmin: true, personaId: null }, t, [], elementos)).toHaveLength(6);
  });
  it("al crear, queda de responsable si hay columna Responsable en ese nivel", () => {
    const cols = [col("r", "persona", "responsable"), col("rs", "persona", "responsable", "sub")];
    expect(valoresIniciales(cols, "item", ana)).toEqual({ r: [ana] });
    expect(valoresIniciales(cols, "sub", ana)).toEqual({ rs: [ana] });
    expect(valoresIniciales(cols, "item", null)).toEqual({});
  });
});
