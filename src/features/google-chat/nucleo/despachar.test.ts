import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlujoChat } from "./flujo";
import { AvisoChat } from "./flujo";
import type { EventoChat } from "./eventos";

// Quién escribe: sin base de datos (el usuario lo resuelve nucleo/usuario.ts).
const usuarioDeEvento = vi.fn();
const quienSaluda = vi.fn();
vi.mock("./usuario", () => ({
  usuarioDeEvento: (e: EventoChat) => usuarioDeEvento(e),
  quienSaluda: (e: EventoChat) => quienSaluda(e),
}));
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
const hola: EventoChat = { chat: { messagePayload: { message: { text: "hola" } } } };

describe("despachar", () => {
  let a: FlujoChat, b: FlujoChat, c: FlujoChat;
  beforeEach(() => {
    usuarioDeEvento.mockReset().mockResolvedValue(usuario);
    quienSaluda.mockReset().mockResolvedValue({ nombre: "Ana López", rol: "PM", usuario, aviso: null });
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

  it("el saludo dice nombre y rol, y muestra solo los flujos que el usuario puede usar", async () => {
    const r = texto(await despachar(hola, URL_BOT, [a, b, c]));
    expect(r).toContain("¡Hola Ana López! Rol PM");
    expect(r).toContain("/iniciativa");
    expect(r).toContain("/status-card");
    expect(r).not.toContain("/secreto");
    expect(usuarioDeEvento).not.toHaveBeenCalled();
  });

  it("saludo sin rol CKU/Sponsor/PM/Admin: solo el mensaje de apoyo, sin preguntar a los flujos", async () => {
    quienSaluda.mockResolvedValue({ nombre: "Ana López", rol: null, usuario, aviso: null });
    const r = texto(await despachar(hola, URL_BOT, [a, b]));
    expect(r).toContain("contacta a tu CKU asignado");
    expect(r).not.toContain("/iniciativa");
    expect(a.puedeUsar).not.toHaveBeenCalled();
  });

  it("saludo con rol pero sin cuenta en la app: nombre, rol y el aviso", async () => {
    quienSaluda.mockResolvedValue({ nombre: "Ana López", rol: "CKU", usuario: null, aviso: "Todavía no tienes cuenta en PMO Control Tower." });
    const r = texto(await despachar(hola, URL_BOT, [a, b]));
    expect(r).toContain("¡Hola Ana López! Rol CKU");
    expect(r).toContain("Todavía no tienes cuenta");
    expect(r).not.toContain("OPEN_DIALOG");
  });

  it("al mostrar el menú precalienta los flujos disponibles (y solo esos)", async () => {
    a.precalentar = vi.fn(); c.precalentar = vi.fn();
    await despachar(hola, URL_BOT, [a, b, c]);
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
