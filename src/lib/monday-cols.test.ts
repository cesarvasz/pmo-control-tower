import { describe, it, expect } from "vitest";
import { colNumByTitle } from "./monday-cols";
import type { MondayColumnValue } from "@/types";

const cv = (title: string, o: Partial<MondayColumnValue>): MondayColumnValue =>
  ({ id: title, text: null, column: { title }, ...o });

describe("colNumByTitle", () => {
  it("lee un número plano del text", () => {
    expect(colNumByTitle([cv("Benefit $", { text: "4000" })], "Benefit $")).toBe(4000);
  });

  it("tolera espacios de más y capitalización en el título", () => {
    const cols = [cv(" benefit $ ", { text: "150000" })];
    expect(colNumByTitle(cols, "Benefit $")).toBe(150000);
  });

  it("cae a display_value cuando text viene vacío (columnas espejo)", () => {
    const cols = [cv("Benefit $", { text: null, display_value: "150000" })];
    expect(colNumByTitle(cols, "Benefit $")).toBe(150000);
  });

  it("limpia símbolo de moneda y separador de miles", () => {
    expect(colNumByTitle([cv("Benefit $", { display_value: "$1,234,567.50" })], "Benefit $")).toBe(1234567.5);
  });

  it("NaN si la columna no existe o no tiene número", () => {
    expect(colNumByTitle([cv("Otra", { text: "1" })], "Benefit $")).toBeNaN();
    expect(colNumByTitle([cv("Benefit $", { text: "" })], "Benefit $")).toBeNaN();
    expect(colNumByTitle([cv("Benefit $", { text: "N/A" })], "Benefit $")).toBeNaN();
  });

  it("distingue 0 real de vacío", () => {
    expect(colNumByTitle([cv("Cost $", { text: "0" })], "Cost $")).toBe(0);
  });
});
