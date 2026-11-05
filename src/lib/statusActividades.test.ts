import { describe, it, expect } from "vitest";
import { actividadesComoFases, estadoActividad } from "./statusActividades";
import type { ProjItem, ProjSubitem } from "@/types";

const d = (s: string) => new Date(`${s}T00:00:00`);
const NOW = d("2026-11-05").getTime();
const sub = (o: Partial<ProjSubitem>) => ({ id: "s", name: "Act", status: "Working on it", deadline: null, startDate: null, ...o }) as ProjSubitem;

describe("estadoActividad", () => {
  it("Done → Completada; Stuck o vencida sin cerrar → Atrasada; Working on it → En curso; el resto → A futuro", () => {
    expect(estadoActividad(sub({ status: "Done", deadline: d("2026-01-01") }), NOW).state).toBe("Completada");
    expect(estadoActividad(sub({ status: "Stuck" }), NOW).state).toBe("Atrasada");
    expect(estadoActividad(sub({ status: "Working on it", deadline: d("2026-10-01") }), NOW).state).toBe("Atrasada");
    expect(estadoActividad(sub({ status: "Working on it", deadline: d("2026-12-01") }), NOW)).toEqual({ status: "current", state: "En curso" });
    expect(estadoActividad(sub({ status: "Future Steps", deadline: d("2026-12-01") }), NOW).state).toBe("A futuro");
  });
});

describe("actividadesComoFases", () => {
  it("barra con inicio y límite, rombo con solo límite, sin fechas solo nombre y estado", () => {
    const item = { subitems: [
      sub({ id: "a", startDate: d("2026-11-01"), deadline: d("2026-12-01") }),
      sub({ id: "b", deadline: d("2026-12-01") }),
      sub({ id: "c" }),
    ] } as unknown as ProjItem;
    const [a, b, c] = actividadesComoFases(item, NOW);
    expect(a).toMatchObject({ indent: 2, start: "2026-11-01", due: "2026-12-01" });
    expect(b).toMatchObject({ milestone: "2026-12-01" });
    expect(c.start).toBeUndefined(); expect(c.milestone).toBeUndefined();
    expect(actividadesComoFases(undefined, NOW)).toEqual([]);
  });
});
