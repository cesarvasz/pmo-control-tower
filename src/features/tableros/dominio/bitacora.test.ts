import { describe, expect, it } from "vitest";
import { trozosConEnlaces } from "./bitacora";

describe("trozosConEnlaces", () => {
  it("separa los enlaces del texto", () => {
    expect(trozosConEnlaces("📎 Archivos\n• Propuesta.pdf: https://drive.google.com/open?id=1HM-x_Q")).toEqual([
      { tipo: "texto", valor: "📎 Archivos\n• Propuesta.pdf: " },
      { tipo: "enlace", valor: "https://drive.google.com/open?id=1HM-x_Q" },
    ]);
  });
  it("sin enlaces es un solo trozo de texto; vacío no da trozos", () => {
    expect(trozosConEnlaces("hola mundo")).toEqual([{ tipo: "texto", valor: "hola mundo" }]);
    expect(trozosConEnlaces("")).toEqual([]);
  });
  it("la puntuación final no es parte del enlace; los paréntesis del propio enlace sí", () => {
    expect(trozosConEnlaces("ver http://a.com/x. y (https://b.com/y), listo")).toEqual([
      { tipo: "texto", valor: "ver " },
      { tipo: "enlace", valor: "http://a.com/x" },
      { tipo: "texto", valor: ". y (" },
      { tipo: "enlace", valor: "https://b.com/y" },
      { tipo: "texto", valor: "), listo" },
    ]);
    expect(trozosConEnlaces("https://es.wikipedia.org/wiki/A_(b)")).toEqual([{ tipo: "enlace", valor: "https://es.wikipedia.org/wiki/A_(b)" }]);
  });
  it("no toma otros esquemas", () => {
    expect(trozosConEnlaces("javascript:alert(1) ftp://x")).toEqual([{ tipo: "texto", valor: "javascript:alert(1) ftp://x" }]);
  });
});
