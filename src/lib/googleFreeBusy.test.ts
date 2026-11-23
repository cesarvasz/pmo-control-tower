import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/reuniones", () => ({ leerRefreshToken: vi.fn(), marcarConexion: vi.fn() }));

import { consultarOcupacion, leerFreeBusy, leerRespuestas } from "@/lib/googleCalendar";

const resp = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status });
const busy = (s: string, e: string) => ({ start: s, end: e });

describe("leerFreeBusy", () => {
  it("junta lo ocupado y separa los calendarios sin datos (errors o ausentes)", () => {
    const r = leerFreeBusy({ calendars: {
      "a@c807.com": { busy: [busy("2026-11-16T15:00:00Z", "2026-11-16T16:00:00Z")] },
      "b@c807.com": { busy: [] },
      "x@otro.com": { busy: [], errors: [{ reason: "notFound" }] },
    } }, ["a@c807.com", "b@c807.com", "x@otro.com", "z@c807.com"]);
    expect(r.ocupados).toEqual([{ inicio: "2026-11-16T15:00:00Z", fin: "2026-11-16T16:00:00Z" }]);
    expect(r.sinDatos).toEqual(["x@otro.com", "z@c807.com"]);
    // Por persona: solo las que tienen datos; quien no tiene nada ocupado sale con lista vacía (≠ sin datos)
    expect(r.porCalendario).toEqual({ "a@c807.com": [{ inicio: "2026-11-16T15:00:00Z", fin: "2026-11-16T16:00:00Z" }], "b@c807.com": [] });
  });
});

describe("consultarOcupacion", () => {
  it("consulta el calendario propio más los invitados, sin repetir", async () => {
    const f = vi.fn().mockImplementation(async () => resp({ calendars: { primary: { busy: [busy("2026-11-16T15:00:00Z", "2026-11-16T16:00:00Z")] }, "a@c807.com": { busy: [] } } }));
    const o = await consultarOcupacion("T", "2026-11-16T00:00:00-06:00", "2026-11-16T23:59:59-06:00", ["A@c807.com", "a@c807.com"], f as never);
    const cuerpo = JSON.parse(f.mock.calls[0][1].body);
    expect(cuerpo.items).toEqual([{ id: "primary" }, { id: "a@c807.com" }]);
    expect(o.ocupados).toHaveLength(1);
    expect(o.sinDatos).toEqual([]);
    expect(Object.keys(o.porCalendario).sort()).toEqual(["a@c807.com", "primary"]);
  });
  it("si el calendario propio no responde, falla en vez de sugerir «todo libre»", async () => {
    const f = vi.fn().mockImplementation(async () => resp({ calendars: { primary: { errors: [{}] } } }));
    await expect(consultarOcupacion("T", "a", "b", [], f as never)).rejects.toThrow("google-calendar-error");
  });
  it("traduce el HTTP de Google", async () => {
    await expect(consultarOcupacion("T", "a", "b", [], vi.fn().mockResolvedValue(resp({}, 401)) as never)).rejects.toThrow("google-reconnect-required");
  });
});

describe("leerRespuestas", () => {
  it("traduce responseStatus por correo (minúsculas) y deja fuera al organizador", () => {
    expect(leerRespuestas([
      { email: "Yo@c807.com", responseStatus: "accepted", organizer: true },
      { email: "A@c807.com", responseStatus: "accepted" },
      { email: "b@c807.com", responseStatus: "declined" },
      { email: "c@c807.com", responseStatus: "tentative" },
      { email: "d@c807.com", responseStatus: "needsAction" },
      { responseStatus: "accepted" },
    ])).toEqual({ "a@c807.com": "aceptada", "b@c807.com": "rechazada", "c@c807.com": "tal-vez", "d@c807.com": "sin-responder" });
    expect(leerRespuestas(undefined)).toEqual({});
  });
});
