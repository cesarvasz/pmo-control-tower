import { describe, expect, it } from "vitest";
import { textoCreada, textoElegirIniciativa, textoResultadoAdjuntos } from "./textos";

describe("textos de Nueva iniciativa", () => {
  const ini = { iniId: "IN-120", nombre: "Ahorro en fletes", sinDescripcion: false };
  it("al crearla: nombre con Ini ID, CKU, quién asigna lo demás y si se pueden mandar archivos", () => {
    const t = textoCreada({ ini, cku: "Ana López", enlace: "https://app/gestion-iniciativas", adjuntos: true });
    expect(t).toContain("*IN-120 · Ahorro en fletes*");
    expect(t).toContain("CKU: Ana López. El PMO le asignará PM y Estrategia.");
    expect(t).toContain("mándamelos aquí en el chat");
    expect(t).toContain("<https://app/gestion-iniciativas|Gestión de Iniciativas>");
    const sinNada = textoCreada({ ini: { ...ini, sinDescripcion: true }, cku: null, enlace: "x", adjuntos: false });
    expect(sinNada).toContain("Sin CKU");
    expect(sinNada).toContain("No pude guardar la descripción");
    expect(sinNada).not.toContain("mándamelos");
  });
  it("la pregunta al recibir archivos (y si hay que conectar Drive)", () => {
    expect(textoElegirIniciativa([{ nombre: "plan.pdf" }])).toContain("el archivo «plan.pdf»");
    expect(textoElegirIniciativa([{ nombre: "a.pdf" }, { nombre: "b.xlsx" }])).toContain("2 archivos («a.pdf», «b.xlsx»)");
    expect(textoElegirIniciativa([{ nombre: "a" }])).not.toContain("Conectar mi Drive");
    expect(textoElegirIniciativa([{ nombre: "a" }], { conectarDrive: true })).toContain("«🔗 Conectar mi Drive»");
  });
  it("el resultado: guardados, enlaces de Drive con su motivo, fallidos y cómo conectar Drive", () => {
    const t = textoResultadoAdjuntos("IN-120 · Ahorro", {
      guardados: ["a.pdf"], enlazados: [{ nombre: "Doc", motivo: null }, { nombre: "Form", motivo: "ese tipo de archivo de Google no se puede copiar" }],
      fallidos: [{ nombre: "c.zip", motivo: "pasa de 50 MB" }], driveSinConectar: true,
    }, "https://app/api/google-chat/drive/conectar?c=x");
    expect(t).toContain("✅ Adjunté «a.pdf» a *IN-120 · Ahorro*.");
    expect(t).toContain("enlace de Drive de «Doc», «Form»");
    expect(t).toContain("«Form» no se copió: ese tipo de archivo de Google no se puede copiar.");
    expect(t).not.toContain("«Doc» no se copió");
    expect(t).toContain("⚠️ «c.zip»: pasa de 50 MB.");
    expect(t).toContain("<https://app/api/google-chat/drive/conectar?c=x|conecta tu Drive>");
    const vacio = { guardados: [], enlazados: [], fallidos: [{ nombre: "c", motivo: "m" }], driveSinConectar: false };
    expect(textoResultadoAdjuntos("X", vacio)).toMatch(/^No pude adjuntar nada/);
    expect(textoResultadoAdjuntos("X", { ...vacio, driveSinConectar: true })).toContain("no está configurada");
  });
});
