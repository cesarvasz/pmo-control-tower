import { describe, expect, it } from "vitest";
import { esDeDialogo, intencionDe, leerInputs, type EventoChat } from "./eventos";
import { erroresDe, leerFormulario, leerNumero, tarjetaFormulario, valoresDeTablero, type CampoChat } from "./formulario";
import { abrirDialogo, actualizarDialogo, botonBot, cerrarDialogo, mensaje, mensajeConTarjeta, respuestaDeAviso } from "./respuestas";
import { flujoDeBoton, MENSAJE_APOYO, rolDeSaludo, saludoDe } from "./menu";

const URL_BOT = "https://ejemplo.com/api/google-chat";

const campos: CampoChat[] = [
  { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", obligatorio: true, seccion: "datos" },
  { nombre: "col-cku", etiqueta: "CKU", tipo: "lista", obligatorio: true, seccion: "datos", opciones: [{ valor: "p1", texto: "Ana" }, { valor: "p2", texto: "Luis" }] },
  { nombre: "col-benefit", etiqueta: "Beneficio $", tipo: "numero", obligatorio: false, seccion: "despues" },
  { nombre: "col-kpi", etiqueta: "KPI", tipo: "texto", obligatorio: false, seccion: "despues" },
];

const envio = (inputs: Record<string, string>, parametros: Record<string, string> = { flujo: "x", accion: "crear" }): EventoChat => ({
  commonEventObject: {
    parameters: parametros,
    formInputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, { stringInputs: { value: [v] } }])),
  },
  chat: { user: { email: "pm@c807.com" }, buttonClickedPayload: { isDialogEvent: true, dialogEventType: "SUBMIT_DIALOG" } },
});

describe("eventos", () => {
  it("comando → su ID (número o texto; también desde message.slashCommand)", () => {
    expect(intencionDe({ chat: { appCommandPayload: { appCommandMetadata: { appCommandId: 2 } } } })).toEqual({ tipo: "comando", comandoId: 2 });
    expect(intencionDe({ chat: { appCommandPayload: { appCommandMetadata: { appCommandId: "1" } } } })).toEqual({ tipo: "comando", comandoId: 1 });
    expect(intencionDe({ chat: { appCommandPayload: { message: { slashCommand: { commandId: 3 } } } } })).toEqual({ tipo: "comando", comandoId: 3 });
  });
  it("botón → flujo y acción (sin acción = abrir; sin flujo = null)", () => {
    expect(intencionDe(envio({}, { flujo: "status-card", accion: "ver" }))).toEqual({ tipo: "boton", flujo: "status-card", accion: "ver" });
    expect(intencionDe(envio({}, {}))).toEqual({ tipo: "boton", flujo: null, accion: "abrir" });
  });
  it("mensaje o agregado = saludo; quitado = ignorar", () => {
    expect(intencionDe({ chat: { messagePayload: { message: { text: "hola" } } } }).tipo).toBe("saludo");
    expect(intencionDe({ chat: { addedToSpacePayload: {} } }).tipo).toBe("saludo");
    expect(intencionDe({ chat: { removedFromSpacePayload: {} } }).tipo).toBe("ignorar");
  });
  it("esDeDialogo y leerInputs", () => {
    expect(esDeDialogo(envio({}))).toBe(true);
    expect(esDeDialogo({ chat: { messagePayload: {} } })).toBe(false);
    expect(leerInputs(envio({ a: "  hola " }), ["a", "b"])).toEqual({ a: "hola", b: "" });
  });
});

describe("formulario", () => {
  it("leerNumero", () => {
    expect(leerNumero("15000")).toBe(15000);
    expect(leerNumero("15,000.50")).toBe(15000.5);
    expect(leerNumero("$ 15,000")).toBe(15000);
    expect(leerNumero("Q15000")).toBe(15000);
    expect(leerNumero("quince mil")).toBeNull();
    expect(leerNumero("-5")).toBeNull();
  });
  it("errores: obligatorios, números y opciones que no existen", () => {
    expect(erroresDe(campos, leerFormulario(envio({}), campos))).toEqual(["Falta Nombre", "Falta CKU"]);
    expect(erroresDe(campos, { nombre: "X", "col-cku": "zz", "col-benefit": "mucho", "col-kpi": "" }))
      .toEqual(["CKU: la opción elegida ya no existe", "Beneficio $ tiene que ser un número (p. ej. 15000)"]);
    expect(erroresDe(campos, { nombre: "X", "col-cku": "p2", "col-benefit": "", "col-kpi": "" })).toEqual([]);
  });
  it("valores de tablero: listas → [id], número → number, vacío fuera", () => {
    expect(valoresDeTablero(campos.slice(1), { "col-cku": "p2", "col-benefit": "$1,500", "col-kpi": "Tiempo" }))
      .toEqual({ "col-cku": ["p2"], "col-benefit": 1500, "col-kpi": "Tiempo" });
  });
  it("tarjeta: datos arriba, opcional plegable, botones al flujo; listas con opción vacía elegida", () => {
    const t = tarjetaFormulario({ titulo: "Nueva", campos, url: URL_BOT, flujo: "iniciativa", enviar: { texto: "Crear", accion: "crear" } });
    const s = t.sections as { header?: string; collapsible?: boolean; widgets: Record<string, unknown>[] }[];
    expect(s.map((x) => x.widgets.length)).toEqual([2, 2, 1]);
    expect(s[1].collapsible).toBe(true);
    const botones = (s[2].widgets[0].buttonList as { buttons: { onClick: { action: { function: string; parameters: { key: string; value: string }[] } } }[] }).buttons;
    expect(botones.map((b) => b.onClick.action.parameters)).toEqual([
      [{ key: "flujo", value: "iniciativa" }, { key: "accion", value: "crear" }],
      [{ key: "flujo", value: "iniciativa" }, { key: "accion", value: "cancelar" }],
    ]);
    const items = (s[0].widgets[1].selectionInput as { items: { value: string; selected: boolean }[] }).items;
    expect(items[0]).toMatchObject({ value: "", selected: true });
    expect(items.filter((i) => i.selected)).toHaveLength(1);
  });
  it("tarjeta con errores conserva lo llenado y escapa", () => {
    const t = tarjetaFormulario({
      titulo: "Nueva", campos, url: URL_BOT, flujo: "iniciativa", enviar: { texto: "Crear", accion: "crear" },
      leidos: { nombre: "Ruta <A>", "col-cku": "p2" }, errores: ["Falta <algo>"], aviso: { etiqueta: "PM", texto: "Ana" },
    });
    const w = (t.sections as { widgets: Record<string, unknown>[] }[])[0].widgets;
    expect(JSON.stringify(w[0])).toContain("Falta &lt;algo&gt;");
    expect(JSON.stringify(w[1])).toContain("Ana");
    expect((w[2].textInput as { value: string }).value).toBe("Ruta <A>");
    expect((w[3].selectionInput as { items: { value: string; selected: boolean }[] }).items.find((i) => i.selected)?.value).toBe("p2");
  });
  it("nota: va al final de los datos, escapada; sin nota no hay párrafo", () => {
    const solo = campos.filter((c) => c.seccion === "datos");
    const base = { titulo: "Nueva", campos: solo, url: URL_BOT, flujo: "iniciativa", enviar: { texto: "Crear", accion: "crear" } };
    const w = (tarjetaFormulario({ ...base, nota: "📎 Archivos <aquí>" }).sections as { widgets: Record<string, unknown>[] }[])[0].widgets;
    expect(w.at(-1)).toEqual({ textParagraph: { text: "📎 Archivos &lt;aquí&gt;" } });
    const sin = (tarjetaFormulario(base).sections as { widgets: Record<string, unknown>[] }[])[0].widgets;
    expect(sin.some((x) => "textParagraph" in x)).toBe(false);
  });
});

describe("respuestas", () => {
  it("formas del add-on", () => {
    const t = { sections: [] };
    expect(abrirDialogo(t)).toEqual({ action: { navigations: [{ pushCard: t }] } });
    expect(actualizarDialogo(t)).toEqual({ action: { navigations: [{ updateCard: t }] } });
    expect(cerrarDialogo("Listo")).toEqual({ action: { navigations: [{ endNavigation: { action: "CLOSE_DIALOG" } }], notification: { text: "Listo" } } });
    expect(mensaje("Hola")).toEqual({ hostAppDataAction: { chatDataAction: { createMessageAction: { message: { text: "Hola" } } } } });
    expect(mensajeConTarjeta("Hola", "c1", t)).toEqual({ hostAppDataAction: { chatDataAction: { createMessageAction: { message: { text: "Hola", cardsV2: [{ cardId: "c1", card: t }] } } } } });
  });
  it("botón del bot que abre diálogo", () => {
    expect(botonBot({ url: URL_BOT, flujo: "f", accion: "abrir", texto: "Abrir", dialogo: true })).toEqual({
      text: "Abrir",
      onClick: { action: { function: URL_BOT, interaction: "OPEN_DIALOG", parameters: [{ key: "flujo", value: "f" }, { key: "accion", value: "abrir" }] } },
    });
  });
  it("aviso: cierra el diálogo o manda mensaje según de dónde vino", () => {
    expect(respuestaDeAviso(envio({}), "No")).toHaveProperty("action");
    expect(respuestaDeAviso({ chat: { messagePayload: {} } }, "No")).toHaveProperty("hostAppDataAction");
  });
});

describe("saludo", () => {
  const flujos = [
    { clave: "iniciativa", comando: "/iniciativa", titulo: "Nueva iniciativa", descripcion: "alta" },
    { clave: "status-card", comando: "/status-card", titulo: "Status Card", descripcion: "ver" },
  ];
  type Msg = { text: string; accessoryWidgets?: { buttonList: { buttons: { text: string }[] } }[] };
  const msg = (r: unknown) => (r as { hostAppDataAction: { chatDataAction: { createMessageAction: { message: Msg } } } }).hostAppDataAction.chatDataAction.createMessageAction.message;

  it("rol: Admin de la app gana; si no, CKU / Sponsor / PM del Directorio; lo demás no cuenta", () => {
    expect(rolDeSaludo(true, "PM")).toBe("Admin");
    expect(rolDeSaludo(true, null)).toBe("Admin");
    expect(rolDeSaludo(false, "PM")).toBe("PM");
    expect(rolDeSaludo(false, "SPONSOR")).toBe("Sponsor");
    expect(rolDeSaludo(false, " cku ")).toBe("CKU");
    for (const r of ["DEV", "BI", "PKU", "S/Dev", "", null, undefined]) expect(rolDeSaludo(false, r)).toBeNull();
  });
  it("con rol: «¡Hola (nombre)! Rol (rol)» y un botón por flujo disponible", () => {
    const m = msg(saludoDe({ nombre: "Ana López", rol: "PM", flujos }, URL_BOT));
    expect(m.text.startsWith("¡Hola Ana López! Rol PM\n")).toBe(true);
    expect(m.text).toContain("/status-card");
    expect(m.accessoryWidgets?.[0].buttonList.buttons.map((b) => b.text)).toEqual(["Nueva iniciativa", "Status Card"]);
  });
  it("sin rol reconocido: solo el mensaje de apoyo, sin botones", () => {
    const m = msg(saludoDe({ nombre: "Ana López", rol: null, flujos }, URL_BOT));
    expect(m.text).toBe(`¡Hola Ana López! ${MENSAJE_APOYO}`);
    expect(m.accessoryWidgets).toBeUndefined();
    expect(msg(saludoDe({ nombre: null, rol: null, flujos: [] }, URL_BOT)).text).toBe(`¡Hola! ${MENSAJE_APOYO}`);
  });
  it("con rol pero sin cuenta que sirva, o sin flujos: lo dice, sin botones", () => {
    const sinCuenta = msg(saludoDe({ nombre: "Ana", rol: "CKU", flujos: [], aviso: "Todavía no tienes cuenta" }, URL_BOT));
    expect(sinCuenta.text).toBe("¡Hola Ana! Rol CKU\n\nTodavía no tienes cuenta");
    const sinFlujos = msg(saludoDe({ nombre: "Ana", rol: "Sponsor", flujos: [] }, URL_BOT));
    expect(sinFlujos.text).toContain("no tiene nada disponible");
    expect(sinFlujos.accessoryWidgets).toBeUndefined();
  });
  it("botones de antes (sin «flujo») van a Iniciativas", () => {
    expect(flujoDeBoton(flujos, null)?.clave).toBe("iniciativa");
    expect(flujoDeBoton(flujos, "status-card")?.clave).toBe("status-card");
    expect(flujoDeBoton(flujos, "otro")).toBeUndefined();
  });
});

describe("archivos y párrafos", () => {
  it("un mensaje con archivos es «archivos» (subidos y de Drive); sin cómo bajarlos, es saludo", () => {
    const e: EventoChat = { chat: { messagePayload: { message: { name: "spaces/A/messages/B", text: "hola", attachment: [
      { name: "spaces/A/messages/B/attachments/1", contentName: "plan.pdf", contentType: "application/pdf", source: "UPLOADED_CONTENT", attachmentDataRef: { resourceName: "r1" } },
      { contentName: "Doc", source: "DRIVE_FILE", driveDataRef: { driveFileId: "d1" } },
      { contentName: "raro" },
    ] } } } };
    expect(intencionDe(e)).toEqual({ tipo: "archivos", mensaje: "spaces/A/messages/B", adjuntos: [
      { nombreRecurso: "spaces/A/messages/B/attachments/1", nombre: "plan.pdf", tipoMime: "application/pdf", origen: "subido", recursoDatos: "r1", driveId: null },
      { nombreRecurso: "", nombre: "Doc", tipoMime: null, origen: "drive", recursoDatos: null, driveId: "d1" },
    ] });
    expect(intencionDe({ chat: { messagePayload: { message: { name: "m", attachment: [{ contentName: "raro" }] } } } })).toEqual({ tipo: "saludo" });
  });
  it("un campo «parrafo» es un texto de varias líneas", () => {
    const t = JSON.stringify(tarjetaFormulario({ titulo: "T", url: "u", flujo: "f", enviar: { texto: "Ok", accion: "ok" },
      campos: [{ nombre: "descripcion", etiqueta: "Descripción", tipo: "parrafo", obligatorio: true, seccion: "datos" }] }));
    expect(t).toContain('"type":"MULTIPLE_LINE"');
    expect(t).toContain('"label":"Descripción *"');
  });
  it("los botones llevan los parámetros extra", () => {
    expect(JSON.stringify(botonBot({ url: "u", flujo: "iniciativa", accion: "adjuntar", texto: "IN-1", parametros: { elemento: "e1" } })))
      .toContain('{"key":"elemento","value":"e1"}');
  });
});
