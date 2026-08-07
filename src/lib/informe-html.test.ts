import { describe, it, expect } from "vitest";
import { construirHtmlInforme } from "./informe-html";
import { construirInforme, PRECIO_LICENCIA_BASE, META_LICENCIAS_ANUAL } from "./informe";
import { construirExpedientes } from "./tramites";
import type { RoiRow } from "@/types";

const fila = (o: Partial<RoiRow>): RoiRow => ({
  c807_file: "F1", Proceso: "Aduana", Cliente: "CLIENTE A",
  Usuario: "ANA", Analista: "BETO", Embarque: "Marítimo",
  Documento: "CONOCIMIENTO DE EMBARQUE", Mesa: "Mesa 1", Docalpha: "No Ducafast",
  Creado: "2026-01-05T08:00:00",
  DPR: "2026-01-05T09:00:00",
  Clasificacion_exacta: "2026-01-05T10:00:00",
  Creacion_Pre_DUCA: "2026-01-05T11:00:00",
  Revision_Analista: "2026-01-05T12:00:00",
  Solicitar_firma_def: "2026-01-05T13:00:00",
  ...o,
} as RoiRow);

const rapido = (o: Partial<RoiRow> = {}): RoiRow => fila({
  Docalpha: "Ducafast",
  DPR: "2026-01-05T08:01:00",
  Clasificacion_exacta: "2026-01-05T08:02:00",
  Creacion_Pre_DUCA: "2026-01-05T08:03:00",
  Revision_Analista: "2026-01-05T08:30:00",
  Solicitar_firma_def: "2026-01-05T09:00:00",
  ...o,
});

const OPC = {
  anio: 2026, tarifa: 6,
  precioLicencia: PRECIO_LICENCIA_BASE, metaLicenciasAnual: META_LICENCIAS_ANUAL,
};

const html = (rows: RoiRow[], o = OPC) =>
  construirHtmlInforme(construirInforme(construirExpedientes(rows), o));

describe("construirHtmlInforme", () => {
  const base = [fila({ c807_file: "M1" }), rapido({ c807_file: "D1", Licencias: "4", Costo: "4.4" })];

  it("produce un documento autocontenido, sin recursos externos", () => {
    const h = html(base);
    expect(h.startsWith("<!doctype html>")).toBe(true);
    // Nada que el navegador tenga que ir a buscar: ni <script>, ni <img>, ni <link>.
    expect(h).not.toMatch(/<script|<img|<link|https?:\/\//i);
    expect(h).toContain("@page");
  });

  it("lleva las cuatro secciones del informe", () => {
    const h = html(base);
    expect(h).toContain("Reducción del tiempo de ciclo");
    expect(h).toContain("Costo operativo por file");
    expect(h).toContain("Productividad y capacidad instalada");
    expect(h).toContain("Scorecard: retorno real contra línea base");
  });

  it("declara el alcance y los parámetros con los que se calculó", () => {
    const h = html(base);
    expect(h).toContain("T1+T2+T3");
    expect(h).toContain("$6.00/h");
    expect(h).toContain("$1.25 por licencia");
    expect(h).toContain("DUCAFAST GT — resultados 2026");
  });

  it("las advertencias viajan con el PDF, no se quedan en la pantalla", () => {
    const h = html(base);
    // El PDF circula solo: si el mes va a medias tiene que decirlo él mismo.
    expect(h).toContain("El último mes va a medias");
    // Y el contrapeso de la revisión posterior también.
    expect(h).toContain("Parte del tiempo ganado se devuelve después");
    expect(h).toContain("este informe mide el tramo automatizado");
  });

  it("un año sin datos genera un PDF válido en vez de reventar", () => {
    const h = html(base, { ...OPC, anio: 2019 });
    expect(h).toContain("No hay expedientes en 2019");
    expect(h.startsWith("<!doctype html>")).toBe(true);
    expect(h).not.toContain("NaN");
    expect(h).not.toContain("undefined");
  });

  it("no deja NaN ni undefined en los números", () => {
    const h = html(base);
    expect(h).not.toContain("NaN");
    expect(h).not.toContain("undefined");
    expect(h).not.toContain("Infinity");
  });

  it("escapa el texto que viene de los datos", () => {
    // Un mes cuya etiqueta se inyecta tal cual sería una vía de escape.
    const h = html([
      ...base,
      fila({ c807_file: "X<script>", Cliente: "<b>ACME</b>" }),
    ]);
    expect(h).not.toContain("<b>ACME</b>");
    expect(h).not.toMatch(/<script/i);
  });

  it("las barras se quedan dentro del 0–100%", () => {
    const h = html(base);
    for (const [, w] of h.matchAll(/width:([\d.]+)%/g)) {
      expect(Number(w)).toBeGreaterThanOrEqual(0);
      expect(Number(w)).toBeLessThanOrEqual(100);
    }
  });
});
