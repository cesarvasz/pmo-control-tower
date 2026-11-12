import { describe, expect, it } from "vitest";
import { decidirTick, describirPaso, HORAS_MAX_CORRIDA, pasoCritico, pasosDeCopia, pasosDeTableros } from "./sincronizar-pasos";

describe("Tableros · sincronización por pasos", () => {
  it("parte la copia de Monday en grupos y la cierra con los boards de Proyectos", () => {
    const objetivos = [
      { id: "1", tipo: "ini" as const }, { id: "2", tipo: "req" as const }, { id: "3", tipo: "rh" as const },
      { id: "4", tipo: "est" as const }, { id: "10", tipo: "proj" as const }, { id: "11", tipo: "proj" as const }, { id: "12", tipo: "proj" as const },
    ];
    const pasos = pasosDeCopia(objetivos, 3);
    expect(pasos.map((p) => p.tipo)).toEqual(["copiar", "copiar", "copiar", "cerrar_copia"]);
    expect(pasos[0]).toMatchObject({ boards: [{ id: "1" }, { id: "2" }, { id: "3" }], de: [3, 7] });
    expect(pasos[2]).toMatchObject({ boards: [{ id: "12", tipo: "proj" }], de: [7, 7] });
    expect(pasos[3]).toEqual({ tipo: "cerrar_copia", projIds: ["10", "11", "12"] });
    expect(describirPaso(pasos[1])).toBe("Copia de Monday (6 de 7)");
  });

  it("sin boards: solo el cierre (que no apaga nada porque no hay carpeta)", () => {
    expect(pasosDeCopia([])).toEqual([{ tipo: "cerrar_copia", projIds: [] }]);
  });

  it("el directorio primero y luego cada board en orden: traerlo, bitácora y comparación", () => {
    const pasos = pasosDeTableros([{ id: "1", nombre: "Iniciativas", tipo: "ini" }, { id: "10", nombre: "PM-001", tipo: "proj" }]);
    expect(pasos.map((p) => ("boardId" in p ? `${p.tipo}:${p.boardId}` : p.tipo))).toEqual([
      "directorio", "tablero:1", "bitacora:1", "comparar:1", "tablero:10", "bitacora:10", "comparar:10",
    ]);
    expect(describirPaso(pasos[5])).toBe("PM-001 · bitácora y archivos");
  });

  it("solo la copia y el directorio tumban la corrida; un board falla solo", () => {
    expect(pasoCritico({ tipo: "descubrir" })).toBe(true);
    expect(pasoCritico({ tipo: "cerrar_copia", projIds: [] })).toBe(true);
    expect(pasoCritico({ tipo: "directorio" })).toBe(true);
    expect(pasoCritico({ tipo: "copiar", boards: [], de: [0, 0] })).toBe(false);
    expect(pasoCritico({ tipo: "tablero", boardId: "1", nombre: "x", tipoBoard: "proj" })).toBe(false);
  });

  describe("cada llamada programada", () => {
    const ahora = new Date("2026-11-12T15:00:00Z");
    const haceMin = (m: number) => new Date(ahora.getTime() - m * 60_000).toISOString();

    it("sigue la corrida abierta", () => {
      expect(decidirTick({ enCurso: { inicio: haceMin(3) }, ultimaInicio: haceMin(3), ahora, cadaMin: 60 })).toEqual({ decision: "avanzar" });
    });
    it("da por cortada una corrida abierta hace demasiado", () => {
      const vieja = haceMin(HORAS_MAX_CORRIDA * 60 + 1);
      expect(decidirTick({ enCurso: { inicio: vieja }, ultimaInicio: vieja, ahora, cadaMin: 60 })).toEqual({ decision: "cerrar_cortada" });
    });
    it("abre una nueva cuando la última empezó hace una hora o más (o nunca hubo)", () => {
      expect(decidirTick({ enCurso: null, ultimaInicio: haceMin(60), ahora, cadaMin: 60 })).toEqual({ decision: "abrir" });
      expect(decidirTick({ enCurso: null, ultimaInicio: null, ahora, cadaMin: 60 })).toEqual({ decision: "abrir" });
    });
    it("si no, espera (y dice cuánto falta)", () => {
      expect(decidirTick({ enCurso: null, ultimaInicio: haceMin(45), ahora, cadaMin: 60 })).toEqual({ decision: "esperar", faltanMin: 15 });
    });
    it("con cadaMin 0 (script local) siempre abre", () => {
      expect(decidirTick({ enCurso: null, ultimaInicio: haceMin(0), ahora, cadaMin: 0 })).toEqual({ decision: "abrir" });
    });
  });
});
