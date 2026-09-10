// Verificación de invariantes del tablero contra el export real.
//
// Cómo activarlo: deja el export de la pestaña "009" en
//   src/lib/__fixtures__/ocr-009.json
// como un arreglo de objetos con las claves exactas de la hoja:
//   { "id", "c807_file", "Embarque", "Cliente",
//     "Creacion", "Digit_docs", "Digit_carta_licencia" }
// Las fechas en formato "yyyy-MM-dd HH:mm:ss" (o ISO con "T"); los hitos de
// digitalización pueden venir vacíos.
//
// Sin el archivo, la suite queda en skip — no rompe CI. No fija números mágicos
// (dependen del export): comprueba que las funciones puras sean consistentes.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type { OcrRow } from "@/types";
import {
  construirFiles, calcularKpis, serie, porCliente, promedio, FILTROS_VACIOS,
} from "./digitalizacion";

const RUTA = fileURLToPath(new URL("./__fixtures__/ocr-009.json", import.meta.url));
const HAY = existsSync(RUTA);
const d = HAY ? describe : describe.skip;

d("invariantes (export real, sin filtros)", () => {
  const crudo = HAY ? JSON.parse(readFileSync(RUTA, "utf8")) : [];
  const rows: OcrRow[] = Array.isArray(crudo) ? crudo : crudo.rows;
  const files = construirFiles(rows);
  const k = calcularKpis(files);

  it("todos los files tienen c807_file y ningún tiempo negativo", () => {
    files.forEach((f) => {
      expect(f.file).toBeTruthy();
      if (f.t1Seg != null) expect(f.t1Seg).toBeGreaterThanOrEqual(0);
      if (f.t2Seg != null) expect(f.t2Seg).toBeGreaterThanOrEqual(0);
    });
  });

  it("conteos coherentes: completos ≤ conT2 y ≤ conT1 ≤ files", () => {
    expect(k.conT1).toBeLessThanOrEqual(k.files);
    expect(k.conT2).toBeLessThanOrEqual(k.files);
    expect(k.completos).toBeLessThanOrEqual(k.conT1);
    expect(k.completos).toBeLessThanOrEqual(k.conT2);
    expect(k.completos).toBe(files.filter((f) => f.completo).length);
  });

  it("los KPIs de T1/T2 recomputan el promedio sobre los no-null", () => {
    const t1 = files.map((f) => f.t1Seg).filter((s): s is number => s != null);
    const t2 = files.map((f) => f.t2Seg).filter((s): s is number => s != null);
    expect(k.t1.prom).toBe(promedio(t1));
    expect(k.t2.prom).toBe(promedio(t2));
    expect(k.t1.n).toBe(t1.length);
    expect(k.t2.n).toBe(t2.length);
  });

  it("porCliente suma todos los files y conT2 nunca supera files", () => {
    const pc = porCliente(files);
    expect(pc.reduce((s, r) => s + r.files, 0)).toBe(files.length);
    pc.forEach((r) => expect(r.conT2).toBeLessThanOrEqual(r.files));
  });

  it("la serie por mes suma todos los files con Creación", () => {
    const s = serie(files, { ...FILTROS_VACIOS, agrupar: "mes" });
    const conCreacion = files.filter((f) => f.creado != null).length;
    expect(s.reduce((acc, p) => acc + p.files, 0)).toBe(conCreacion);
  });
});
