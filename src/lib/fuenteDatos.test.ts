import { describe, expect, it, vi } from "vitest";
import { decidirFuente, HORAS_MAX_SIN_SINCRONIZAR, leerFuenteDatos } from "./fuenteDatos";

describe("FUENTE_DATOS", () => {
  it("sin definir o «monday» → Monday (como siempre)", () => {
    expect(leerFuenteDatos(undefined)).toBe("monday");
    expect(leerFuenteDatos("")).toBe("monday");
    expect(leerFuenteDatos("monday")).toBe("monday");
  });

  it("«tableros» (con mayúsculas o espacios) → los tableros de Supabase", () => {
    expect(leerFuenteDatos("tableros")).toBe("tableros");
    expect(leerFuenteDatos(" Tableros ")).toBe("tableros");
  });

  it("un valor que no se reconoce no cambia la fuente: Monday, con aviso", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(leerFuenteDatos("supabase")).toBe("monday");
    expect(aviso).toHaveBeenCalledOnce();
    aviso.mockRestore();
  });
});

describe("respaldo automático: tableros solo con la sincronización al día", () => {
  const ahora = new Date("2026-11-12T15:00:00Z");
  const haceH = (h: number) => new Date(ahora.getTime() - h * 3600_000).toISOString();

  it("con Monday configurado, Monday", () => {
    expect(decidirFuente("monday", haceH(0), ahora)).toMatchObject({ configurada: "monday", fuente: "monday" });
  });

  it("sincronización reciente (hasta ${HORAS_MAX_SIN_SINCRONIZAR} h) → tableros", () => {
    expect(decidirFuente("tableros", haceH(1), ahora)).toEqual({ configurada: "tableros", fuente: "tableros", actualizadoAl: haceH(1) });
    expect(decidirFuente("tableros", haceH(HORAS_MAX_SIN_SINCRONIZAR), ahora).fuente).toBe("tableros");
  });

  it("sincronización vieja → Monday, con el motivo", () => {
    const f = decidirFuente("tableros", haceH(3.5), ahora);
    expect(f).toMatchObject({ configurada: "tableros", fuente: "monday" });
    expect(f.motivo).toBe("La última sincronización correcta empezó hace 3 h (más de 2 h).");
    expect(decidirFuente("tableros", haceH(72), ahora).motivo).toContain("hace 3 días");
  });

  it("nunca se ha sincronizado → Monday", () => {
    expect(decidirFuente("tableros", null, ahora)).toMatchObject({ fuente: "monday", motivo: "Todavía no hay una sincronización correcta." });
  });
});
