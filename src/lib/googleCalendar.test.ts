import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/reuniones", () => ({
  leerRefreshToken: vi.fn(), marcarConexion: vi.fn(), getConexion: vi.fn(), reunionesVigentesDe: vi.fn(), crearReunion: vi.fn(), getReunion: vi.fn(), actualizarReunion: vi.fn(), cancelarReunion: vi.fn(),
}));

import { accessTokenDe, borrarEvento, crearEvento, cuerpoEvento, leerEvento, olvidarAccessToken, type DatosEvento } from "@/lib/googleCalendar";
import { agendarReunion, tituloReunion, validarPedido, type PedidoReunion } from "@/lib/reunionesServicio";
import * as reuniones from "@/lib/reuniones";

const datos: DatosEvento = {
  codigo: "IN-120", tipo: "M1", titulo: "IN-120 M1 · Mi iniciativa", inicio: "2026-11-20T16:00:00.000Z", fin: "2026-11-20T17:00:00.000Z",
  zona: "America/Guatemala", invitados: [{ personaId: "p1", email: "a@c807.com", nombre: "Ana" }],
};
const respuesta = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status });

describe("cuerpo y lectura del evento", () => {
  it("pide Meet, invitados con nombre y la marca privada de la iniciativa", () => {
    const c = cuerpoEvento(datos, "req-1") as { summary: string; attendees: unknown; conferenceData: { createRequest: unknown }; extendedProperties: { private: unknown }; start: unknown };
    expect(c.summary).toBe("IN-120 M1 · Mi iniciativa");
    expect(c.attendees).toEqual([{ email: "a@c807.com", displayName: "Ana" }]);
    expect(c.conferenceData.createRequest).toEqual({ requestId: "req-1", conferenceSolutionKey: { type: "hangoutsMeet" } });
    expect(c.extendedProperties.private).toEqual({ pmoCodigo: "IN-120", pmoTipo: "M1" });
    expect(c.start).toEqual({ dateTime: datos.inicio, timeZone: "America/Guatemala" });
    expect("description" in c).toBe(false);
  });
  it("lee id, etag, enlace y Meet (también del entryPoint)", () => {
    expect(leerEvento({ id: "e1", etag: '"x"', htmlLink: "h", hangoutLink: "m" })).toEqual({ id: "e1", etag: '"x"', enlace: "h", meetUrl: "m" });
    expect(leerEvento({ id: "e1", conferenceData: { entryPoints: [{ entryPointType: "video", uri: "v" }] } })?.meetUrl).toBe("v");
    expect(leerEvento({})).toBeNull();
    expect(leerEvento(null)).toBeNull();
  });
});

describe("crear y borrar evento", () => {
  it("manda sendUpdates=all, conferenceDataVersion=1 y el token", async () => {
    const f = vi.fn().mockResolvedValue(respuesta({ id: "e1", etag: "t", hangoutLink: "https://meet.google.com/x" }));
    const e = await crearEvento("TOK", datos, "r", f as never);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toContain("calendars/primary/events?conferenceDataVersion=1&sendUpdates=all");
    expect(init.headers.Authorization).toBe("Bearer TOK");
    expect(e.meetUrl).toBe("https://meet.google.com/x");
  });
  it("traduce los fallos de Google a códigos de la app", async () => {
    for (const [st, cod] of [[401, "google-reconnect-required"], [403, "google-calendar-prohibido"], [429, "google-calendar-saturado"], [500, "google-calendar-error"]] as const) {
      const f = vi.fn().mockResolvedValue(respuesta({ error: "x" }, st));
      await expect(crearEvento("T", datos, "r", f as never)).rejects.toThrow(cod);
    }
  });
  it("borrar: ya no existir es éxito; otro fallo no", async () => {
    await expect(borrarEvento("T", "e", vi.fn().mockResolvedValue(new Response(null, { status: 404 })) as never)).resolves.toBeUndefined();
    await expect(borrarEvento("T", "e", vi.fn().mockResolvedValue(new Response(null, { status: 500 })) as never)).rejects.toThrow("google-calendar-error");
  });
});

describe("access token", () => {
  beforeEach(() => {
    vi.resetAllMocks(); olvidarAccessToken("u1");
    process.env.GOOGLE_CLIENT_ID = "cid"; process.env.GOOGLE_CLIENT_SECRET = "sec"; process.env.GOOGLE_STATE_SECRET = "s".repeat(40);
  });
  it("renueva con el refresh token y lo guarda en memoria", async () => {
    vi.mocked(reuniones.leerRefreshToken).mockResolvedValue("REFRESH");
    const f = vi.fn().mockImplementation(async () => respuesta({ access_token: "A1", expires_in: 3600 }));
    expect(await accessTokenDe("u1", f as never, 0)).toBe("A1");
    expect(await accessTokenDe("u1", f as never, 1000)).toBe("A1");
    expect(f).toHaveBeenCalledTimes(1);
    expect(await accessTokenDe("u1", f as never, 3_600_000)).toBe("A1"); // venció: pide otro
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("invalid_grant deja la conexión en «reconectar»", async () => {
    vi.mocked(reuniones.leerRefreshToken).mockResolvedValue("R");
    const f = vi.fn().mockResolvedValue(respuesta({ error: "invalid_grant" }, 400));
    await expect(accessTokenDe("u1", f as never)).rejects.toThrow("google-reconnect-required");
    expect(reuniones.marcarConexion).toHaveBeenCalledWith("u1", "reconectar", expect.any(String));
  });
  it("sin conexión: google-no-conectado", async () => {
    vi.mocked(reuniones.leerRefreshToken).mockResolvedValue(null);
    await expect(accessTokenDe("u1", vi.fn() as never)).rejects.toThrow("google-no-conectado");
  });
});

const pedido: PedidoReunion = {
  codigo: "IN-120", tipo: "M1", nombreIniciativa: " Mi iniciativa ", inicio: "2026-11-20T10:00:00-06:00", fin: "2026-11-20T11:00:00-06:00",
  invitados: [
    { personaId: "p1", email: " ANA@c807.com ", nombre: "Ana" }, { personaId: "p1", email: "ana@c807.com", nombre: "Ana" },
    { personaId: null, email: "yo@c807.com", nombre: "Yo" }, { personaId: null, email: "ext@cliente.com", nombre: "" },
  ],
};

describe("validarPedido", () => {
  it("normaliza: título, UTC, sin duplicados ni el organizador", () => {
    const { datos: d, invitados } = validarPedido(pedido, "yo@c807.com");
    expect(d.titulo).toBe(tituloReunion("IN-120", "M1", "Mi iniciativa"));
    expect(d.inicio).toBe("2026-11-20T16:00:00.000Z");
    expect(d.zona).toBe("America/Guatemala");
    expect(invitados.map((i) => i.email)).toEqual(["ana@c807.com", "ext@cliente.com"]);
  });
  it("rechaza lo inválido", () => {
    const mal = (p: Partial<PedidoReunion>) => expect(() => validarPedido({ ...pedido, ...p }, "yo@c807.com")).toThrow("reunion-datos-invalidos");
    mal({ codigo: "158" }); mal({ tipo: "M3" as never }); mal({ nombreIniciativa: "  " }); mal({ inicio: "no" });
    mal({ fin: pedido.inicio }); mal({ zona: "Marte/Olimpo" }); mal({ invitados: [{ personaId: null, email: "sin-arroba", nombre: "" }] });
  });
});

describe("agendarReunion", () => {
  const org = { uid: "u1", email: "yo@c807.com" };
  const conexion = { usuarioId: "u1", googleEmail: "yo@c807.com", estado: "activa", scopes: [], ultimoError: null, conectadoAt: "" } as never;
  beforeEach(() => {
    vi.resetAllMocks(); olvidarAccessToken("u1");
    process.env.GOOGLE_CLIENT_ID = "cid"; process.env.GOOGLE_CLIENT_SECRET = "sec"; process.env.GOOGLE_STATE_SECRET = "s".repeat(40);
    vi.mocked(reuniones.reunionesVigentesDe).mockResolvedValue([]);
    vi.mocked(reuniones.getConexion).mockResolvedValue(conexion);
    vi.mocked(reuniones.leerRefreshToken).mockResolvedValue("R");
  });

  /** Google falso: token, crear evento y borrar evento; devuelve las llamadas hechas. */
  function googleFalso() {
    const llamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push(`${init?.method ?? "GET"} ${String(url).replace(/\?.*/, "")}`);
      if (String(url).includes("oauth2")) return respuesta({ access_token: "A", expires_in: 3600 });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return respuesta({ id: "ev1", etag: "t", htmlLink: "h", hangoutLink: "m" });
    }));
    return llamadas;
  }

  it("crea el evento y guarda la reunión con el organizador autenticado", async () => {
    googleFalso();
    vi.mocked(reuniones.crearReunion).mockResolvedValue({ id: "r1" } as never);
    await agendarReunion(pedido, org);
    expect(reuniones.crearReunion).toHaveBeenCalledWith(expect.objectContaining({
      organizadorId: "u1", organizadorEmail: "yo@c807.com", googleEventId: "ev1", meetUrl: "m", origen: "app",
    }));
  });
  it("si no se puede guardar, borra el evento de Google y repite el error", async () => {
    const llamadas = googleFalso();
    vi.mocked(reuniones.crearReunion).mockRejectedValue(new Error("reunion-ya-agendada"));
    await expect(agendarReunion(pedido, org)).rejects.toThrow("reunion-ya-agendada");
    expect(llamadas.some((l) => l.startsWith("DELETE") && l.endsWith("/events/ev1"))).toBe(true);
  });
  it("ya agendada: ni siquiera llama a Google", async () => {
    const llamadas = googleFalso();
    vi.mocked(reuniones.reunionesVigentesDe).mockResolvedValue([{ origen: "app" } as never]);
    await expect(agendarReunion(pedido, org)).rejects.toThrow("reunion-ya-agendada");
    expect(llamadas).toHaveLength(0);
  });
  it("sin conexión o en «reconectar»: no llama a Google", async () => {
    const llamadas = googleFalso();
    vi.mocked(reuniones.getConexion).mockResolvedValueOnce(null);
    await expect(agendarReunion(pedido, org)).rejects.toThrow("google-no-conectado");
    vi.mocked(reuniones.getConexion).mockResolvedValueOnce({ ...(conexion as object), estado: "reconectar" } as never);
    await expect(agendarReunion(pedido, org)).rejects.toThrow("google-reconnect-required");
    expect(llamadas).toHaveLength(0);
  });
});
