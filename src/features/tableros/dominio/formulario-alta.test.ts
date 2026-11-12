import { describe, expect, it } from "vitest";
import { altaConFormulario, columnasDelFormulario, grupoInicialId, valoresDeAlta } from "./formulario-alta";
import type { Columna } from "./tablero";

const col = (id: string, tipo: string, extra: Partial<Columna> = {}): Columna =>
  ({ id, nivel: "item", titulo: id, tipo, rol: null, config: {}, orden: 0, ancho: null, oculta: false, ...extra });
const ETIQUETAS = { etiquetas: [{ id: "0", texto: "Meeting 2", color: "#fdab3d", categoria: "en_curso" }, { id: "5", texto: "New", color: "#c4c4c4", categoria: "en_curso" }] };

describe("Tableros · alta de un elemento con formulario", () => {
  it("solo las Iniciativas se crean con formulario (por ahora)", () => {
    expect(altaConFormulario("iniciativas")).toEqual({ sustantivo: "iniciativa", grupoInicial: "Nuevas Iniciativas", statusInicial: "New" });
    expect(altaConFormulario("proyecto")).toBeUndefined();
    expect(altaConFormulario("libre")).toBeUndefined();
  });

  it("el formulario lleva lo que se llena a mano, ocultas incluidas, en el orden de las columnas", () => {
    const columnas = [
      col("pm", "persona", { orden: 2 }), col("status", "status", { orden: 0 }), col("meet1", "fecha", { orden: 3, oculta: true }),
      col("ini", "autonumero", { orden: 1 }), col("log", "creacion", { orden: 4 }), col("mail", "espejo", { orden: 5 }),
      col("f", "formula", { orden: 6 }), col("salud", "app", { orden: 7 }), col("doc", "archivo", { orden: 8 }),
      col("sub", "texto", { nivel: "sub", orden: 9 }),
    ];
    expect(columnasDelFormulario(columnas).map((c) => c.id)).toEqual(["status", "pm", "meet1"]);
  });

  it("cae por defecto en «Nuevas Iniciativas» (sin importar mayúsculas ni acentos) y, si no existe, en el primer grupo", () => {
    const grupos = [{ id: "g1", titulo: "Aprobadas" }, { id: "g2", titulo: "nuevas iniciativas" }, { id: "g3", titulo: "En espera" }];
    expect(grupoInicialId("iniciativas", grupos)).toBe("g2");
    expect(grupoInicialId("iniciativas", [{ id: "g1", titulo: "Aprobadas" }])).toBe("g1");
    expect(grupoInicialId("proyecto", grupos)).toBe("g1");
    expect(grupoInicialId("iniciativas", [])).toBeNull();
  });

  it("nace con status «New» si la columna de status lo tiene", () => {
    const status = col("st", "status", { rol: "status", config: ETIQUETAS });
    expect(valoresDeAlta("iniciativas", [status, col("pm", "persona")])).toEqual({ st: "5" });
    expect(valoresDeAlta("iniciativas", [col("st", "status", { rol: "status", config: { etiquetas: [] } })])).toEqual({});
    expect(valoresDeAlta("iniciativas", [col("pm", "persona")])).toEqual({});
    expect(valoresDeAlta("proyecto", [status])).toEqual({});
  });
});
