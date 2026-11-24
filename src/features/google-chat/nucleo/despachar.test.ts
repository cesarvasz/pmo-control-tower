import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlujoChat, UsuarioChat } from "./flujo";
import { AvisoChat } from "./flujo";
import type { EventoChat } from "./eventos";

// Quién escribe: sin base de datos (el usuario lo resuelve nucleo/usuario.ts).
const usuarioDeEvento = vi.fn();
vi.mock("./usuario", () => ({ usuarioDeEvento: (e: EventoChat) => usuarioDeEvento(e) }));
const { despachar } = await import("./despachar");

const URL_BOT = "https://ejemplo.com/api/google-chat";
const quien = (o: Partial<UsuarioChat> = {}): UsuarioChat => ({
  email: "ana@c807.com", nombre: "Ana López", persona: { id: "p1", nombre: "Ana López", rol: "PM" },
  me: { roleName: "PM" } as UsuarioChat["me"], avisoCuenta: null, esAdmin: false, ...o,
});
const usuario = quien();

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
const conArchivo: EventoChat = { chat: { messagePayload: { message: {
  name: "spaces/A/messages/B", attachment: [{ contentName: "plan.pdf", attachmentDataRef: { resourceName: "r1" } }],
} } } };

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

  it("el saludo dice nombre y rol, y muestra solo los flujos que el usuario puede usar", async () => {
    const r = texto(await despachar(hola, URL_BOT, [a, b, c]));
    expect(r).toContain("¡Hola Ana López! Rol PM");
    expect(r).toContain("/iniciativa");
    expect(r).toContain("/status-card");
    expect(r).not.toContain("/secreto");
  });

  it("saludo: el Admin de la app gana sobre el rol del Directorio", async () => {
    usuarioDeEvento.mockResolvedValue(quien({ esAdmin: true }));
    expect(texto(await despachar(hola, URL_BOT, [a]))).toContain("¡Hola Ana López! Rol Admin");
  });

  it("saludo sin rol CKU/Sponsor/PM/Admin: solo el mensaje de apoyo, sin preguntar a los flujos", async () => {
    usuarioDeEvento.mockResolvedValue(quien({ persona: { id: "p1", nombre: "Ana López", rol: "DEV" } }));
    const r = texto(await despachar(hola, URL_BOT, [a, b]));
    expect(r).toContain("contacta a tu CKU asignado");
    expect(r).not.toContain("/iniciativa");
    expect(a.puedeUsar).not.toHaveBeenCalled();
  });

  it("saludo de un CKU sin cuenta: ve lo que no pide cuenta; si no hay nada, el aviso de la cuenta", async () => {
    usuarioDeEvento.mockResolvedValue(quien({ persona: { id: "p1", nombre: "Ana López", rol: "CKU" }, me: null, avisoCuenta: "Todavía no tienes cuenta en PMO Control Tower." }));
    const conIni = texto(await despachar(hola, URL_BOT, [a, c]));
    expect(conIni).toContain("¡Hola Ana López! Rol CKU");
    expect(conIni).toContain("/iniciativa");
    expect(conIni).not.toContain("Todavía no tienes cuenta");
    const sinNada = texto(await despachar(hola, URL_BOT, [c]));
    expect(sinNada).toContain("Todavía no tienes cuenta");
    expect(sinNada).not.toContain("OPEN_DIALOG");
  });

  it("al mostrar el menú precalienta los flujos disponibles (y solo esos)", async () => {
    a.precalentar = vi.fn(); c.precalentar = vi.fn();
    await despachar(hola, URL_BOT, [a, b, c]);
    expect(a.precalentar).toHaveBeenCalledTimes(1);
    expect(c.precalentar).not.toHaveBeenCalled();
  });

  it("archivos: los recibe el primer flujo que sabe y que el usuario puede usar", async () => {
    c.recibirArchivos = vi.fn(async () => ({ de: "c" }));
    a.recibirArchivos = vi.fn(async () => ({ de: "a" }));
    expect(await despachar(conArchivo, URL_BOT, [c, b, a])).toEqual({ de: "a" });
    expect(a.recibirArchivos).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ nombre: "plan.pdf", recursoDatos: "r1" })], "spaces/A/messages/B");
    expect(c.recibirArchivos).not.toHaveBeenCalled();
  });

  it("archivos sin flujo que los reciba: lo dice", async () => {
    expect(texto(await despachar(conArchivo, URL_BOT, [a, b]))).toContain("No tengo dónde guardar archivos");
  });

  it("sin permiso: sin rol → con su CKU; con rol pero sin cuenta → la cuenta; si no → su rol", async () => {
    usuarioDeEvento.mockResolvedValue(quien({ persona: null }));
    expect(texto(await despachar(comando(3), URL_BOT, [c]))).toContain("contacta a tu CKU asignado");
    usuarioDeEvento.mockResolvedValue(quien({ me: null, avisoCuenta: "Tu cuenta de PMO Control Tower está en espera" }));
    expect(texto(await despachar(comando(3), URL_BOT, [c]))).toContain("está en espera");
    usuarioDeEvento.mockResolvedValue(usuario);
    expect(texto(await despachar(comando(3), URL_BOT, [c]))).toContain("Pide acceso al PMO");
  });

  it("comando desconocido o usuario rechazado → aviso", async () => {
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
