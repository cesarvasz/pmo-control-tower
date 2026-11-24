import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlujoChat } from "./flujo";
import { AvisoChat } from "./flujo";
import type { EventoChat } from "./eventos";

// Quién escribe: sin base de datos (el usuario lo resuelve nucleo/usuario.ts).
const usuarioDeEvento = vi.fn();
vi.mock("./usuario", () => ({ usuarioDeEvento: (e: EventoChat) => usuarioDeEvento(e) }));
const { despachar } = await import("./despachar");

const URL_BOT = "https://ejemplo.com/api/google-chat";
const usuario = { email: "pm@c807.com", me: { roleName: "PM" } };

function flujo(clave: string, comandoId: number, permitido = true): FlujoChat {
  return {
    clave, comandoId, comando: `/${clave}`, titulo: clave, descripcion: "",
    puedeUsar: vi.fn(async () => permitido),
    abrir: vi.fn(async () => ({ sections: [{ header: clave }] })),
    enviar: vi.fn(async (_ctx, accion: string) => ({ enviado: `${clave}:${accion}` })),
  };
}

const comando = (id: number, dialogo = true): EventoChat => ({ chat: { appCommandPayload: { isDialogEvent: dialogo, appCommandMetadata: { appCommandId: id } } } });
const boton = (flujoClave: string | null, accion: string): EventoChat => ({
  commonEventObject: { parameters: { ...(flujoClave ? { flujo: flujoClave } : {}), accion } },
  chat: { buttonClickedPayload: { isDialogEvent: true } },
});
const texto = (r: unknown) => JSON.stringify(r);

describe("despachar", () => {
  let a: FlujoChat, b: FlujoChat, c: FlujoChat;
  beforeEach(() => {
    usuarioDeEvento.mockReset().mockResolvedValue(usuario);
    a = flujo("iniciativa", 1); b = flujo("status-card", 2); c = flujo("secreto", 3, false);
  });

  it("el comando abre el diálogo de SU flujo", async () => {
    expect(await despachar(comando(2), URL_BOT, [a, b])).toEqual({ action: { navigations: [{ pushCard: { sections: [{ header: "status-card" }] } }] } });
    expect(b.abrir).toHaveBeenCalledWith(expect.objectContaining({ url: URL_BOT, origen: "https://ejemplo.com", usuario }));
    expect(a.abrir).not.toHaveBeenCalled();
  });

  it("comando sin «Abre un diálogo»: manda un botón que sí lo abre", async () => {
    const r = texto(await despachar(comando(2, false), URL_BOT, [a, b]));
    expect(r).toContain("OPEN_DIALOG");
    expect(r).toContain('"value":"status-card"');
  });

  it("los botones van a enviar() con su acción; cancelar cierra sin tocar al flujo", async () => {
    expect(await despachar(boton("status-card", "ver"), URL_BOT, [a, b])).toEqual({ enviado: "status-card:ver" });
    expect(texto(await despachar(boton("status-card", "cancelar"), URL_BOT, [a, b]))).toContain("CLOSE_DIALOG");
    expect(b.enviar).toHaveBeenCalledTimes(1);
  });

  it("el saludo muestra solo los flujos que el usuario puede usar", async () => {
    const r = texto(await despachar({ chat: { messagePayload: { message: { text: "hola" } } } }, URL_BOT, [a, b, c]));
    expect(r).toContain("/iniciativa");
    expect(r).toContain("/status-card");
    expect(r).not.toContain("/secreto");
  });

  it("al mostrar el menú precalienta los flujos disponibles (y solo esos)", async () => {
    a.precalentar = vi.fn(); c.precalentar = vi.fn();
    await despachar({ chat: { messagePayload: { message: { text: "hola" } } } }, URL_BOT, [a, b, c]);
    expect(a.precalentar).toHaveBeenCalledTimes(1);
    expect(c.precalentar).not.toHaveBeenCalled();
  });

  it("sin permiso, comando desconocido o usuario rechazado → aviso", async () => {
    expect(texto(await despachar(comando(3), URL_BOT, [a, b, c]))).toContain("Tu rol no tiene acceso");
    expect(texto(await despachar(comando(9), URL_BOT, [a, b]))).toContain("No conozco ese comando");
    usuarioDeEvento.mockRejectedValue(new AvisoChat("Este bot solo es para cuentas de la empresa."));
    expect(texto(await despachar(comando(1), URL_BOT, [a, b]))).toContain("cuentas de la empresa");
  });

  it("un error inesperado del flujo no tumba la respuesta", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    (b.enviar as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    expect(texto(await despachar(boton("status-card", "ver"), URL_BOT, [a, b]))).toContain("Algo falló de nuestro lado");
  });
});
