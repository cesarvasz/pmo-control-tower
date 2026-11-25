import { describe, expect, it } from "vitest";
import type { CampoChat } from "../../nucleo/formulario";
import { ACCION_CASILLA, ACCION_REFRESCAR, PARAM_BORRADOR, tarjetaIniciativa, type VistaIniciativa } from "./tarjeta";
import { CAMPO_ADJUNTARE, MAX_ARCHIVOS_BORRADOR } from "./subida";

const campos: CampoChat[] = [
  { nombre: "nombre", etiqueta: "Nombre de la iniciativa", tipo: "texto", obligatorio: true, seccion: "datos" },
  { nombre: "descripcion", etiqueta: "Descripción", tipo: "parrafo", obligatorio: true, seccion: "datos" },
  { nombre: CAMPO_ADJUNTARE, etiqueta: "Adjuntaré un archivo", tipo: "casilla", obligatorio: false, seccion: "datos", alCambiar: ACCION_CASILLA },
];
const base: VistaIniciativa = {
  campos, cku: "Ana López", url: "https://bot/api/google-chat", flujo: "iniciativa", borrador: "b-1", enlaceSubida: "https://app/archivos-iniciativa/COD",
};
type Seccion = { widgets: Record<string, unknown>[] };
const widgets = (v: VistaIniciativa) => ((tarjetaIniciativa(v).sections as Seccion[])[0]).widgets;
const params = (accion: { parameters: { key: string; value: string }[] }) => Object.fromEntries(accion.parameters.map((p) => [p.key, p.value]));

describe("tarjeta de Nueva iniciativa", () => {
  it("la casilla: CHECK_BOX, manda el formulario al cambiar (con el borrador)", () => {
    const casilla = widgets(base).find((w) => w.selectionInput)!.selectionInput as {
      type: string; items: { text: string; value: string; selected: boolean }[]; onChangeAction: { parameters: { key: string; value: string }[] };
    };
    expect(casilla.type).toBe("CHECK_BOX");
    expect(casilla.items).toEqual([{ text: "Adjuntaré un archivo", value: "si", selected: false }]);
    expect(params(casilla.onChangeAction)).toEqual({ flujo: "iniciativa", accion: ACCION_CASILLA, [PARAM_BORRADOR]: "b-1" });
  });
  it("sin marcar (y sin archivos) no se ven los archivos ni «Subir archivo»", () => {
    expect(JSON.stringify(widgets(base))).not.toContain("Subir archivo");
  });
  it("marcada: archivos subidos, «Subir archivo» abre la página y «Actualizar» vuelve al bot con el borrador", () => {
    const w = widgets({ ...base, leidos: { [CAMPO_ADJUNTARE]: "si" } });
    expect(JSON.stringify(w)).toContain("Ninguno todavía");
    const botones = (w.find((x) => x.buttonList)!.buttonList as { buttons: { text: string; onClick: Record<string, unknown> }[] }).buttons;
    expect(botones[0]).toEqual({ text: "📎 Subir archivo", onClick: { openLink: { url: "https://app/archivos-iniciativa/COD" } } });
    expect(params(botones[1].onClick.action as { parameters: { key: string; value: string }[] }))
      .toEqual({ flujo: "iniciativa", accion: ACCION_REFRESCAR, [PARAM_BORRADOR]: "b-1" });
    // La casilla sigue marcada.
    expect(JSON.stringify(w)).toContain('"selected":true');
  });
  it("con archivos: la lista (escapada, con tamaño) aunque haya desmarcado la casilla", () => {
    const w = widgets({ ...base, archivos: [{ nombre: "Plan <v2>.pdf", tamano: 2048 }, { nombre: "b.xlsx", tamano: null }] });
    const lista = w.find((x) => x.decoratedText)!;
    const txt = JSON.stringify(w);
    expect(txt).toContain("Archivos subidos (2)");
    expect(txt).toContain("📎 Plan &lt;v2&gt;.pdf · 2 KB");
    expect(txt).toContain("📎 b.xlsx");
    expect(txt).toContain("Subir otro archivo");
    expect(lista).toBeTruthy();
  });
  it("lleno: ya no ofrece subir más", () => {
    const archivos = Array.from({ length: MAX_ARCHIVOS_BORRADOR }, (_, i) => ({ nombre: `a${i}`, tamano: 1 }));
    const txt = JSON.stringify(widgets({ ...base, leidos: { [CAMPO_ADJUNTARE]: "si" }, archivos }));
    expect(txt).not.toContain("Subir otro archivo");
    expect(txt).toContain("Ya subiste el máximo");
  });
  it("Crear y Cancelar llevan el borrador", () => {
    const s = tarjetaIniciativa(base).sections as Seccion[];
    const botones = (s.at(-1)!.widgets[0].buttonList as { buttons: { onClick: { action: { parameters: { key: string; value: string }[] } } }[] }).buttons;
    expect(botones.map((b) => params(b.onClick.action))).toEqual([
      { flujo: "iniciativa", accion: "crear", [PARAM_BORRADOR]: "b-1" },
      { flujo: "iniciativa", accion: "cancelar", [PARAM_BORRADOR]: "b-1" },
    ]);
  });
});
