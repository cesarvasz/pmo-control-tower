import { describe, expect, it } from "vitest";
import { comoBajar, RUTA_CALLBACK, SCOPE_DRIVE, urlAutorizacionDrive } from "./drive-formato";
import { paginaResultado } from "./pagina";

describe("Drive del bot", () => {
  it("los archivos normales se descargan; los de Google se exportan con su extensión; los demás no se copian", () => {
    expect(comoBajar("application/pdf", "plan.pdf")).toEqual({ modo: "descargar" });
    expect(comoBajar("application/vnd.google-apps.document", "Acta")).toEqual({ modo: "exportar", mime: "application/pdf", nombre: "Acta.pdf" });
    expect(comoBajar("application/vnd.google-apps.spreadsheet", "Costos.xlsx")).toMatchObject({ modo: "exportar", nombre: "Costos.xlsx" });
    expect(comoBajar("application/vnd.google-apps.presentation", "Pitch")).toMatchObject({ modo: "exportar", nombre: "Pitch.pptx" });
    expect(comoBajar("application/vnd.google-apps.form", "Encuesta")).toEqual({ modo: "no-se-puede" });
  });
  it("la URL de Google pide drive.readonly, vuelve al callback del bot y sugiere el correo", () => {
    const u = new URL(urlAutorizacionDrive({ clientId: "cid", origen: "https://app.com", state: "st", email: "ana@c807.com" }));
    expect(u.searchParams.get("scope")).toContain(SCOPE_DRIVE);
    expect(u.searchParams.get("redirect_uri")).toBe(`https://app.com${RUTA_CALLBACK}`);
    expect(u.searchParams.get("login_hint")).toBe("ana@c807.com");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("state")).toBe("st");
  });
  it("la página de resultado escapa el texto", () => {
    const html = paginaResultado({ ok: false, texto: "Entraste con <otro>" });
    expect(html).toContain("No se pudo conectar");
    expect(html).toContain("Entraste con &lt;otro&gt;");
  });
});
