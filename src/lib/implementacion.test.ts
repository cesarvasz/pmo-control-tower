import { gzipSync } from "node:zlib";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  aNumero, decodificarImplementacion, fechaDesdeSegundos, fetchImplementacionRows, totalesImplementacion,
} from "./implementacion";
import type { ImplementacionPayload, ImplementacionRow } from "@/types";

const EPOCA = Date.UTC(2024, 0, 1);

/** Empaqueta como lo hace el Apps Script: componentes locales dentro de un UTC. */
const seg = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) =>
  Math.round((Date.UTC(y, m - 1, d, h, mi, s) - EPOCA) / 1000);

// Orden posicional que arma el script: libres (numéricas), textos, fechas.
const payload = (o: Partial<ImplementacionPayload> = {}): ImplementacionPayload => ({
  epoca: EPOCA,
  libres: ["ingresos_facturados", "egresos_liquidados", "Profit"],
  textos: ["File", "Cliente", "Usuario"],
  fechas: ["Fecha"],
  dicc: { File: ["GT-2025-1", "GT-2025-2"], Cliente: ["CLIENTE A", "CLIENTE B"], Usuario: ["Ana", "Luis"] },
  filas: [[1500.5, 900, 600.5, 0, 0, 0, seg(2026, 1, 5, 14, 30, 45)]],
  ...o,
});

describe("fechaDesdeSegundos", () => {
  it("recupera la hora de pared exacta", () => {
    expect(fechaDesdeSegundos(EPOCA, seg(2026, 1, 5, 14, 30, 45))).toBe("2026-01-05T14:30:45");
  });

  it("una fecha ausente queda vacía, no en la época", () => {
    expect(fechaDesdeSegundos(EPOCA, null)).toBe("");
  });
});

describe("aNumero", () => {
  it("deja pasar los números tal cual", () => {
    expect(aNumero(1500.5)).toBe(1500.5);
    expect(aNumero(0)).toBe(0);
    expect(aNumero(-20)).toBe(-20);
  });

  it("interpreta importes escritos como texto", () => {
    expect(aNumero("Q1,234.50")).toBe(1234.5);
    expect(aNumero("$ 1,234.50")).toBe(1234.5);
    expect(aNumero("1234")).toBe(1234);
    expect(aNumero("500 USD")).toBe(500);
  });

  it("paréntesis y signo menos son negativos", () => {
    expect(aNumero("(500)")).toBe(-500);
    expect(aNumero("$(1,200.75)")).toBe(-1200.75);
    expect(aNumero("-300")).toBe(-300);
    expect(aNumero("Q-300.5")).toBe(-300.5);
  });

  it("vacío o ilegible es null, nunca NaN ni 0", () => {
    expect(aNumero("")).toBeNull();
    expect(aNumero("   ")).toBeNull();
    expect(aNumero("n/d")).toBeNull();
    expect(aNumero(null)).toBeNull();
    expect(aNumero(undefined)).toBeNull();
    expect(aNumero(NaN)).toBeNull();
    expect(aNumero(Infinity)).toBeNull();
  });
});

describe("decodificarImplementacion", () => {
  it("reconstruye la fila con todas sus columnas", () => {
    expect(decodificarImplementacion(payload())).toEqual([{
      File: "GT-2025-1", Fecha: "2026-01-05T14:30:45", Cliente: "CLIENTE A", Usuario: "Ana",
      ingresos_facturados: 1500.5, egresos_liquidados: 900, Profit: 600.5,
    }]);
  });

  it("resuelve cada índice contra el diccionario de SU columna", () => {
    const [r] = decodificarImplementacion(payload({
      filas: [[1, 1, 0, 1, 1, 1, seg(2026, 2, 1)]],
    }));
    expect(r.File).toBe("GT-2025-2");
    expect(r.Cliente).toBe("CLIENTE B");
    expect(r.Usuario).toBe("Luis");
  });

  it("un importe vacío queda null (no 0) y uno en 0 sigue siendo 0", () => {
    const [r] = decodificarImplementacion(payload({ filas: [["", 0, null, 0, 0, 0, null]] }));
    expect(r.ingresos_facturados).toBeNull();
    expect(r.egresos_liquidados).toBe(0);
    expect(r.Profit).toBeNull();
    expect(r.Fecha).toBe("");
  });

  it("un importe que llega como texto se interpreta", () => {
    const [r] = decodificarImplementacion(payload({ filas: [["Q2,000.00", "(350)", "$1,650", 0, 0, 0, null]] }));
    expect(r.ingresos_facturados).toBe(2000);
    expect(r.egresos_liquidados).toBe(-350);
    expect(r.Profit).toBe(1650);
  });

  it("un índice fuera del diccionario da vacío, no undefined", () => {
    const [r] = decodificarImplementacion(payload({ filas: [[1, 1, 0, 99, 99, 99, null]] }));
    expect(r.File).toBe("");
    expect(r.Cliente).toBe("");
  });

  it("una columna nueva de la hoja llega como texto libre", () => {
    const [r] = decodificarImplementacion(payload({
      libres: ["ingresos_facturados", "egresos_liquidados", "Profit", "Nota"],
      filas: [[1, 2, -1, "hola", 0, 0, 0, null]],
    })) as unknown as Record<string, unknown>[];
    expect(r.Nota).toBe("hola");
  });

  it("una hoja vacía devuelve lista vacía", () => {
    expect(decodificarImplementacion(payload({ filas: [] }))).toEqual([]);
  });

  it("es indiferente a la zona horaria de quien decodifica", () => {
    const tz = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Kiritimati"; // UTC+14
      expect(decodificarImplementacion(payload())[0].Fecha).toBe("2026-01-05T14:30:45");
      process.env.TZ = "Pacific/Midway"; // UTC-11
      expect(decodificarImplementacion(payload())[0].Fecha).toBe("2026-01-05T14:30:45");
    } finally {
      process.env.TZ = tz;
    }
  });
});

describe("totalesImplementacion", () => {
  const fila = (i: number | null, e: number | null, p: number | null): ImplementacionRow => ({
    File: "F", Fecha: "", Cliente: "C", Usuario: "U",
    ingresos_facturados: i, egresos_liquidados: e, Profit: p,
  });

  it("suma cada columna por separado", () => {
    expect(totalesImplementacion([fila(100, 40, 60), fila(50.5, 10, 40.5)]))
      .toEqual({ ingresos: 150.5, egresos: 50, profit: 100.5 });
  });

  it("una celda vacía cuenta como 0 y no contamina la suma", () => {
    expect(totalesImplementacion([fila(100, null, null), fila(null, 30, -30)]))
      .toEqual({ ingresos: 100, egresos: 30, profit: -30 });
  });

  it("sin filas, todo en 0", () => {
    expect(totalesImplementacion([])).toEqual({ ingresos: 0, egresos: 0, profit: 0 });
  });
});

describe("fetchImplementacionRows", () => {
  const original = global.fetch;
  afterEach(() => { global.fetch = original; vi.restoreAllMocks(); });

  const respuesta = (body: unknown, status = 200) =>
    ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) }) as Response;
  const html404 = () =>
    ({ ok: false, status: 404, text: async () => "<!DOCTYPE html>" }) as Response;

  it("descomprime el sobre {gz} que manda el Apps Script", async () => {
    const plano = JSON.stringify({ ...payload(), generado: "2026-08-06T14:38:18.469Z" });
    const sobre = JSON.stringify({
      gz: gzipSync(Buffer.from(plano, "utf8")).toString("base64"),
      generado: "2026-08-06T14:38:18.469Z",
    });
    process.env.ROI_IMPLEMENTACION_WEBAPP_URL = "https://ejemplo/exec";
    global.fetch = vi.fn().mockResolvedValue(
      { ok: true, status: 200, text: async () => sobre } as Response) as unknown as typeof fetch;

    const r = await fetchImplementacionRows();
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].Cliente).toBe("CLIENTE A");
    expect(r.rows[0].Profit).toBe(600.5);
    expect(r.generado).toBe("2026-08-06T14:38:18.469Z");
  });

  it("sigue aceptando el payload sin comprimir", async () => {
    process.env.ROI_IMPLEMENTACION_WEBAPP_URL = "https://ejemplo/exec";
    global.fetch = vi.fn().mockResolvedValue(respuesta(payload())) as unknown as typeof fetch;
    expect((await fetchImplementacionRows()).rows).toHaveLength(1);
  });

  it("un gz corrupto avisa qué hacer, no revienta con un error críptico", async () => {
    process.env.ROI_IMPLEMENTACION_WEBAPP_URL = "https://ejemplo/exec";
    global.fetch = vi.fn().mockResolvedValue(respuesta({ gz: "no-es-gzip" })) as unknown as typeof fetch;
    await expect(fetchImplementacionRows()).rejects.toThrow(/descomprimir/);
  });

  it("un payload sin filas apunta al ID de la hoja", async () => {
    process.env.ROI_IMPLEMENTACION_WEBAPP_URL = "https://ejemplo/exec";
    global.fetch = vi.fn().mockResolvedValue(respuesta({ epoca: EPOCA })) as unknown as typeof fetch;
    await expect(fetchImplementacionRows()).rejects.toThrow(/IMPLEMENTACION_SHEET_ID/);
  });

  it("supera un 404 transitorio y devuelve los datos del siguiente intento", async () => {
    process.env.ROI_IMPLEMENTACION_WEBAPP_URL = "https://ejemplo/exec";
    const spy = vi.fn()
      .mockResolvedValueOnce(html404())
      .mockResolvedValueOnce(respuesta({ ...payload(), generado: "2026-08-06T09:00:00.000Z" }));
    global.fetch = spy as unknown as typeof fetch;

    const r = await fetchImplementacionRows();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(r.rows).toHaveLength(1);
    expect(r.generado).toBe("2026-08-06T09:00:00.000Z");
  });

  it("se rinde tras agotar los intentos y explica qué revisar", async () => {
    process.env.ROI_IMPLEMENTACION_WEBAPP_URL = "https://ejemplo/exec";
    global.fetch = vi.fn().mockResolvedValue(html404()) as unknown as typeof fetch;
    await expect(fetchImplementacionRows()).rejects.toThrow(/varios intentos/);
  });

  it("un error definitivo no se reintenta", async () => {
    process.env.ROI_IMPLEMENTACION_WEBAPP_URL = "https://ejemplo/exec";
    const spy = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "" } as Response);
    global.fetch = spy as unknown as typeof fetch;
    await expect(fetchImplementacionRows()).rejects.toThrow(/403/);
    expect(spy).toHaveBeenCalledTimes(1); // 403 es permisos, insistir no ayuda
  });

  it("una página HTML con 200 se reporta como error del script, no como JSON roto", async () => {
    process.env.ROI_IMPLEMENTACION_WEBAPP_URL = "https://ejemplo/exec";
    global.fetch = vi.fn().mockResolvedValue(
      { ok: true, status: 200, text: async () => "<html>Exceeded maximum execution time</html>" } as Response,
    ) as unknown as typeof fetch;
    await expect(fetchImplementacionRows()).rejects.toThrow(/6 minutos/);
  });

  it("sin la variable de entorno avisa antes de intentar nada", async () => {
    delete process.env.ROI_IMPLEMENTACION_WEBAPP_URL;
    await expect(fetchImplementacionRows()).rejects.toThrow(/ROI_IMPLEMENTACION_WEBAPP_URL/);
  });
});
