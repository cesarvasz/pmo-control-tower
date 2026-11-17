import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/reuniones", () => ({
  leerRefreshToken: vi.fn(), marcarConexion: vi.fn(), getConexion: vi.fn(), reunionesVigentesDe: vi.fn(), crearReunion: vi.fn(),
  getReunion: vi.fn(), actualizarReunion: vi.fn(), cancelarReunion: vi.fn(),
}));

import { actualizarEvento, cuerpoCambios, leerEventoActual, olvidarAccessToken } from "@/lib/googleCalendar";
import { cancelarReunionAgendada, reprogramarReunion } from "@/lib/reunionesServicio";
import * as reuniones from "@/lib/reuniones";
import type { Reunion } from "@/lib/reunionesRows";

const resp = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status });

describe("cuerpoCambios", () => {
  it("solo manda lo que cambia", () => {
    expect(cuerpoCambios({ inicio: "2026-11-20T16:00:00.000Z" })).toEqual({ start: { dateTime: "2026-11-20T16:00:00.000Z", timeZone: "America/Guatemala" } });
    expect(cuerpoCambios({})).toEqual({});
    expect(cuerpoCambios({ descripcion: null })).toEqual({ description: "" });
    expect(cuerpoCambios({ invitados: [{ personaId: null, email: "a@c807.com", nombre: "" }] })).toEqual({ attendees: [{ email: "a@c807.com" }] });
  });
});

describe("actualizarEvento / leerEventoActual", () => {
  it("manda If-Match con el etag y avisa a los invitados", async () => {
    const f = vi.fn().mockImplementation(async () => resp({ id: "e1", etag: "nuevo" }));
    const e = await actualizarEvento("T", "e1", '"viejo"', { inicio: "2026-11-20T16:00:00.000Z" }, f as never);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toContain("sendUpdates=all");
    expect(init.method).toBe("PATCH");
    expect(init.headers["If-Match"]).toBe('"viejo"');
    expect(e.etag).toBe("nuevo");
  });
  it("412 = cambiado en Google; 404 = ya no existe", async () => {
    await expect(actualizarEvento("T", "e1", "x", {}, vi.fn().mockImplementation(async () => resp({}, 412)) as never)).rejects.toThrow("google-evento-cambiado");
    await expect(actualizarEvento("T", "e1", "x", {}, vi.fn().mockImplementation(async () => resp({}, 404)) as never)).rejects.toThrow("google-evento-no-existe");
  });
  it("lee el evento actual; null si ya no existe", async () => {
    const actual = { id: "e1", etag: "t", start: { dateTime: "2026-11-20T10:00:00-06:00" }, end: { dateTime: "2026-11-20T11:00:00-06:00" }, status: "confirmed" };
    const e = await leerEventoActual("T", "e1", vi.fn().mockImplementation(async () => resp(actual)) as never);
    expect(e).toMatchObject({ inicio: "2026-11-20T10:00:00-06:00", cancelado: false });
    expect(await leerEventoActual("T", "e1", vi.fn().mockImplementation(async () => resp({}, 410)) as never)).toBeNull();
  });
});

const reunion = {
  id: "r1", codigo: "IN-120", tipo: "M1", titulo: "IN-120 M1 · Mi iniciativa", descripcion: null, inicio: "2026-11-20T16:00:00.000Z", fin: "2026-11-20T17:00:00.000Z",
  zona: "America/Guatemala", invitados: [], estado: "agendada", origen: "app", organizadorId: "u1", organizadorEmail: "yo@c807.com",
  googleEventId: "ev1", googleEtag: '"v1"', meetUrl: "m", enlaceGoogle: "h", elementoId: null, googleCalendarId: "primary", canceladaAt: null,
} as Reunion;
const org = { uid: "u1", email: "yo@c807.com" };

describe("reprogramar y cancelar", () => {
  beforeEach(() => {
    vi.resetAllMocks(); olvidarAccessToken("u1");
    process.env.GOOGLE_CLIENT_ID = "cid"; process.env.GOOGLE_CLIENT_SECRET = "sec"; process.env.GOOGLE_STATE_SECRET = "s".repeat(40);
    vi.mocked(reuniones.leerRefreshToken).mockResolvedValue("R");
    vi.mocked(reuniones.getReunion).mockResolvedValue(reunion);
    vi.mocked(reuniones.actualizarReunion).mockResolvedValue(reunion);
    vi.mocked(reuniones.cancelarReunion).mockResolvedValue({ ...reunion, estado: "cancelada" });
  });

  /** Google falso: token y el comportamiento del evento (PATCH / GET / DELETE) que se le diga. */
  function google(evento: { patch?: number; del?: number }) {
    const llamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? "GET";
      llamadas.push(`${m} ${String(url).includes("oauth2") ? "token" : "evento"}`);
      if (String(url).includes("oauth2")) return resp({ access_token: "A", expires_in: 3600 });
      if (m === "PATCH") return evento.patch ? resp({}, evento.patch) : resp({ id: "ev1", etag: '"v2"' });
      if (m === "DELETE") return new Response(null, { status: evento.del ?? 204 });
      return resp({ id: "ev1", etag: '"v3"', start: { dateTime: "2026-11-21T10:00:00-06:00" }, end: { dateTime: "2026-11-21T11:00:00-06:00" } });
    }));
    return llamadas;
  }

  it("reprogramar: edita el MISMO evento y guarda el etag nuevo", async () => {
    const l = google({});
    await reprogramarReunion("r1", { inicio: "2026-11-23T10:00:00-06:00", fin: "2026-11-23T11:00:00-06:00" }, org);
    expect(l.filter((x) => x === "PATCH evento")).toHaveLength(1);
    expect(reuniones.actualizarReunion).toHaveBeenCalledWith("r1", expect.objectContaining({ googleEtag: '"v2"', inicio: "2026-11-23T16:00:00.000Z" }));
  });
  it("reprogramar: solo el organizador", async () => {
    const l = google({});
    await expect(reprogramarReunion("r1", {}, { uid: "otro", email: "o@c807.com" })).rejects.toThrow("reunion-no-es-tuya");
    expect(l).toHaveLength(0);
  });
  it("reprogramar: no existe, cancelada o no creada en la app → no encontrada", async () => {
    google({});
    vi.mocked(reuniones.getReunion).mockResolvedValueOnce(null);
    await expect(reprogramarReunion("r1", {}, org)).rejects.toThrow("reunion-no-encontrada");
    vi.mocked(reuniones.getReunion).mockResolvedValueOnce({ ...reunion, estado: "cancelada" });
    await expect(reprogramarReunion("r1", {}, org)).rejects.toThrow("reunion-no-encontrada");
    vi.mocked(reuniones.getReunion).mockResolvedValueOnce({ ...reunion, origen: "apps-script" });
    await expect(reprogramarReunion("r1", {}, org)).rejects.toThrow("reunion-no-encontrada");
  });
  it("reprogramar con el evento cambiado en Google: se pone al día y avisa, sin pisar", async () => {
    google({ patch: 412 });
    await expect(reprogramarReunion("r1", { descripcion: "x" }, org)).rejects.toThrow("google-evento-cambiado");
    expect(reuniones.actualizarReunion).toHaveBeenCalledWith("r1", expect.objectContaining({ googleEtag: '"v3"', inicio: "2026-11-21T16:00:00.000Z" }));
  });
  it("reprogramar con el evento borrado en Google: queda cancelada aquí", async () => {
    google({ patch: 404 });
    await expect(reprogramarReunion("r1", { descripcion: "x" }, org)).rejects.toThrow("google-evento-no-existe");
    expect(reuniones.cancelarReunion).toHaveBeenCalledWith("r1");
  });
  it("cancelar: borra el evento y la deja cancelada; si ya no estaba en Google, igual; solo el organizador", async () => {
    const l = google({});
    expect((await cancelarReunionAgendada("r1", org)).estado).toBe("cancelada");
    expect(l).toContain("DELETE evento");
    google({ del: 404 });
    await expect(cancelarReunionAgendada("r1", org)).resolves.toMatchObject({ estado: "cancelada" });
    await expect(cancelarReunionAgendada("r1", { uid: "otro", email: "o@c807.com" })).rejects.toThrow("reunion-no-es-tuya");
  });
});
