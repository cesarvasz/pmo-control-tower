import { gzipSync } from "node:zlib";
import { describe, it, expect } from "vitest";
import { decodificarRoi008, fechaDesdeSegundos, parsearRoi008 } from "./roi008";
import type { Roi008Payload } from "@/types";

const EPOCA = Date.UTC(2024, 0, 1);

/** Empaqueta como lo hace el Apps Script: componentes locales dentro de un UTC. */
const seg = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) =>
  Math.round((Date.UTC(y, m - 1, d, h, mi, s) - EPOCA) / 1000);

const payload = (o: Partial<Roi008Payload> = {}): Roi008Payload => ({
  epoca: EPOCA,
  libres: ["File_id", "File"],
  textos: ["Cliente", "Usuario"],
  fechas: ["Fecha_file", "Creado", "DPR", "Clasificacion_exacta", "Solicitud_prepoliza"],
  dicc: { Cliente: ["CLIENTE A"], Usuario: ["Ana"] },
  filas: [[11462854, "SV-2026-187", 0, 0,
    seg(2026, 1, 1, 23, 59, 16), seg(2026, 1, 1, 23, 59, 16), seg(2026, 1, 2, 0, 8, 12), null, null]],
  ...o,
});

describe("roi008", () => {
  it("fechaDesdeSegundos recupera la hora de pared exacta", () => {
    expect(fechaDesdeSegundos(EPOCA, seg(2026, 11, 26, 15, 2, 31))).toBe("2026-11-26T15:02:31");
    expect(fechaDesdeSegundos(EPOCA, null)).toBe("");
  });

  it("reconstruye la fila con los nombres de columna de la hoja", () => {
    expect(decodificarRoi008(payload())).toEqual([{
      File_id: 11462854, File: "SV-2026-187", Cliente: "CLIENTE A", Usuario: "Ana",
      Fecha_file: "2026-01-01T23:59:16", Creado: "2026-01-01T23:59:16", DPR: "2026-01-02T00:08:12",
      Clasificacion_exacta: "", Solicitud_prepoliza: "",
    }]);
  });

  it("acepta el payload comprimido y devuelve los encabezados", () => {
    const sobre = JSON.stringify({ gz: gzipSync(JSON.stringify(payload())).toString("base64"), generado: "x" });
    const r = parsearRoi008(sobre);
    expect(r.rows).toHaveLength(1);
    expect(r.columnas).toEqual(["File_id", "File", "Cliente", "Usuario", "Fecha_file", "Creado", "DPR",
      "Clasificacion_exacta", "Solicitud_prepoliza"]);
  });

  it("sin pestaña, el motivo del script llega como error", () => {
    const vacio = payload({ filas: [], aviso: 'no existe la pestaña "008"' });
    expect(() => parsearRoi008(JSON.stringify(vacio))).toThrow(/no existe la pestaña "008"/);
  });
});
