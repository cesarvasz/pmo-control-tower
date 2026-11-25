import { describe, expect, it } from "vitest";
import {
  datoSubida, erroresDeDescripcion, esBorrador, largoDescripcion, leerDatoSubida, MIN_DESCRIPCION, rutaBorrador,
} from "./subida";

const B = "0b9c1a52-6a0e-4c3e-9a35-2f8a1d3e4b5c";

describe("regla de la descripción", () => {
  it("cuenta caracteres sin espacios repetidos ni de los bordes; un emoji cuenta 1", () => {
    expect(largoDescripcion("  hola   mundo \n\n ")).toBe(10);
    expect(largoDescripcion("🚀ok")).toBe(3);
    expect(largoDescripcion("")).toBe(0);
  });
  it("sin la casilla pide el mínimo, y dice cuántos lleva", () => {
    const corta = "a".repeat(MIN_DESCRIPCION - 57);
    const [e] = erroresDeDescripcion({ descripcion: corta, adjuntare: false, archivos: 0 });
    expect(e).toContain(`al menos ${MIN_DESCRIPCION} caracteres (lleva ${MIN_DESCRIPCION - 57})`);
    expect(e).toContain("«Adjuntaré un archivo»");
    expect(erroresDeDescripcion({ descripcion: "a".repeat(MIN_DESCRIPCION), adjuntare: false, archivos: 0 })).toEqual([]);
    // Rellenar con espacios no cuenta.
    expect(erroresDeDescripcion({ descripcion: `a${" ".repeat(300)}b`, adjuntare: false, archivos: 0 })).toHaveLength(1);
  });
  it("vacía la reporta el formulario («Falta Descripción»), no esta regla", () => {
    expect(erroresDeDescripcion({ descripcion: "   ", adjuntare: false, archivos: 0 })).toEqual([]);
  });
  it("con la casilla no hay mínimo, pero el archivo es obligatorio", () => {
    expect(erroresDeDescripcion({ descripcion: "Ver archivo", adjuntare: true, archivos: 1 })).toEqual([]);
    const [e] = erroresDeDescripcion({ descripcion: "Ver archivo", adjuntare: true, archivos: 0 });
    expect(e).toContain("todavía no has subido ninguno");
    expect(e).toContain("«📎 Subir archivo»");
  });
  it("archivos subidos sin la casilla no quitan el mínimo", () => {
    expect(erroresDeDescripcion({ descripcion: "corta", adjuntare: false, archivos: 2 })).toHaveLength(1);
  });
});

describe("enlace de subida y borrador", () => {
  it("el dato firmado lleva el correo (en minúsculas) y el borrador, y se lee de vuelta", () => {
    const d = datoSubida("Ana.Lopez@c807.com", B);
    expect(leerDatoSubida(d)).toEqual({ email: "ana.lopez@c807.com", borrador: B });
  });
  it("rechaza datos de otra cosa o mal formados", () => {
    expect(leerDatoSubida(null)).toBeNull();
    expect(leerDatoSubida(`drive:ana@c807.com`)).toBeNull();
    expect(leerDatoSubida(`subir:ana@c807.com|no-es-uuid`)).toBeNull();
    expect(leerDatoSubida(`subir:sin-arroba|${B}`)).toBeNull();
    expect(leerDatoSubida(`subir:ana@c807.com|${B}|extra`)).toBeNull();
  });
  it("borrador = uuid; la ruta queda en la carpeta de borradores", () => {
    expect(esBorrador(B)).toBe(true);
    expect(esBorrador("x")).toBe(false);
    expect(esBorrador(undefined)).toBe(false);
    expect(rutaBorrador(B, "f1")).toBe(`chat-borradores/${B}/f1`);
  });
});
