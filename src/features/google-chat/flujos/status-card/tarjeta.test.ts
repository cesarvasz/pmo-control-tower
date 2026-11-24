import { describe, expect, it } from "vitest";
import type { StatusReportData } from "@/lib/statusReportData";
import { MAX_ATRASOS, fechaCorta, nombreProyecto, tarjetaConImagen, tarjetaElegirProyecto, tarjetaStatusCard } from "./tarjeta";

const URL_BOT = "https://ejemplo.com/api/google-chat";

function datos(cambios: Partial<StatusReportData> = {}): StatusReportData {
  return {
    project: { id: "PM-013", name: "TDP ADU", pm: "Luis", sponsor: "Patricia", cku: "Javier", estrategia: "Ser el mejor", alcance: "Automatizar <todo>" },
    today: "2026-11-23", plan_date: "2027-01-25", timeline_start: "2026-01-01", timeline_end: "2027-07-01", timeline_hint: "",
    current_band: "L", late_bands: ["L"], spi: 0.9285, avance_real: "65%", avance_plan: "70%",
    salud_pct: "61%", salud_estado: "Off Track", salud_tone: "crit", atraso_valor: "102 d hábiles", atraso_tone: "crit",
    fecha_cierre_plan: "25 ene 2027", cierre_estimado: "16 jun 2027", cierre_estimado_sub: "+102 días vs plan", cierre_estimado_tone: "warn",
    valor_generado: "$36,271", roi: "973%", roi_sub: "", payback: "1.1 meses",
    phases: [
      { name: "Valuación", state: "Completada", status: "done", indent: 0, bold: true, band: "V", start: "2026-05-22", due: "2026-08-03", progress: 1 },
      { name: "Launch", state: "Atrasada", status: "late", indent: 0, bold: true, band: "L", start: "2026-01-22", due: "2027-01-14", progress: 0.683 },
      { name: "Clasificación SAC", state: "Atrasada", status: "late", indent: 1, bold: false, start: "2026-05-29", due: "2026-09-17", progress: 0.375 },
      { name: "Revisión", state: "A futuro", status: "future", indent: 0, bold: true, band: "R", start: "2027-01-19", due: "2027-03-23", progress: 0 },
    ],
    atrasos: [{
      id: "1", hito: "Clasificación SAC", fase: "Launch", fecha: "30 jun 2026", acargo: "Javier", dias: "102 d", diasNum: 102,
      reparto: [], resp: "Desarrollo", resp_tone: "#ec4899", motivo: "Fecha estimada 1/12", actividades: "5 actividades",
    }],
    resp_dist: [{ label: "Desarrollo", value: 77, color: "#ec4899" }, { label: "CKU", value: 23, color: "blue" }],
    cku_dist: [], footer_left: "", footer_right: "",
    ...cambios,
  };
}

const secciones = (t: Record<string, unknown>) => t.sections as { header?: string; collapsible?: boolean; widgets: Record<string, unknown>[] }[];

describe("Status Card en Google Chat", () => {
  it("fechaCorta y nombreProyecto", () => {
    expect(fechaCorta("2026-05-02")).toBe("2 may 2026");
    expect(fechaCorta(undefined)).toBe("");
    expect(nombreProyecto("PM-013 | TDP ADU 💡")).toBe("PM-013 · TDP ADU 💡");
    expect(nombreProyecto("Sin código")).toBe("Sin código");
  });

  it("el diálogo lista los proyectos y manda «ver» al flujo status-card", () => {
    const t = tarjetaElegirProyecto([{ id: "b1", name: "PM-001 | Uno" }, { id: "b2", name: "PM-002 | Dos" }], URL_BOT);
    const s = JSON.stringify(t);
    expect(s).toContain('"text":"PM-001 · Uno","value":"b1"');
    expect(s).toContain('{"key":"flujo","value":"status-card"},{"key":"accion","value":"ver"}');
  });

  it("encabezado, indicadores con su color, fases y entregables aparte", () => {
    const t = tarjetaStatusCard(datos(), { url: URL_BOT, enlace: "https://app/resumen-ejecutivo?board=b1" });
    expect(t.header).toEqual({ title: "PM-013 · TDP ADU", subtitle: "Status Ejecutivo PMO · al 23 nov 2026" });
    const amp = tarjetaStatusCard(datos({ project: { ...datos().project, name: "AIR & SEA" } }), { url: URL_BOT, enlace: "x" });
    expect((amp.header as { title: string }).title).toBe("PM-013 · AIR & SEA"); // texto plano: sin escapar
    const s = secciones(t);
    const indicadores = JSON.stringify(s[0]);
    expect(indicadores).toContain("● Off Track");
    expect(indicadores).toContain("#d03b3b"); // crit
    expect(indicadores).toContain("SPI 0.93");
    expect(indicadores).toContain("+102 días vs plan");
    expect(s[1].header).toBe("Fases VALOR");
    const fases = JSON.stringify(s[1]);
    expect(fases).toContain("✅ <b>Valuación</b> — Completada");
    expect(fases).toContain("🔴 <b>Launch</b> — Atrasada · 68 %");
    expect(fases).not.toContain("Clasificación SAC"); // los entregables van en su sección
    expect(s[2]).toMatchObject({ header: "Entregables de Launch (1)", collapsible: true });
  });

  it("causas de atraso con motivo y reparto; el alcance se escapa", () => {
    const s = secciones(tarjetaStatusCard(datos(), { url: URL_BOT, enlace: "x" }));
    const causas = JSON.stringify(s[3]);
    expect(s[3].header).toBe("Causas de atraso (1)");
    expect(causas).toContain("Fecha estimada 1/12");
    expect(causas).toContain("Desarrollo 77 % · CKU 23 %");
    expect(JSON.stringify(s[4])).toContain("Automatizar &lt;todo&gt;");
  });

  it("sin atrasos lo dice; con muchos, corta y avisa", () => {
    expect(JSON.stringify(secciones(tarjetaStatusCard(datos({ atrasos: [], resp_dist: [] }), { url: URL_BOT, enlace: "x" }))[3])).toContain("Sin entregables atrasados");
    const muchos = Array.from({ length: MAX_ATRASOS + 3 }, (_, i) => ({ ...datos().atrasos[0], id: String(i), hito: `H${i}` }));
    const causas = secciones(tarjetaStatusCard(datos({ atrasos: muchos }), { url: URL_BOT, enlace: "x" }))[3];
    expect(JSON.stringify(causas)).toContain("…y 3 más en la app.");
  });

  it("con imagen: 3 datos, la imagen (se abre en grande al tocarla), su vigencia y los botones", () => {
    const t = tarjetaConImagen(datos(), { url: URL_BOT, enlace: "https://app/re?board=b1", imagen: "https://storage/img.png?token=x", vence: "2026-11-30" });
    expect(t.header).toEqual({ title: "PM-013 · TDP ADU", subtitle: "Status Ejecutivo PMO · al 23 nov 2026" });
    const s = secciones(t);
    expect(s[0].widgets.map((w) => (w.decoratedText as { topLabel: string }).topLabel)).toEqual(["Salud", "Atraso", "Cierre estimado"]);
    expect(s[1].widgets[0]).toEqual({ image: { imageUrl: "https://storage/img.png?token=x", altText: "Status Card de PM-013 · TDP ADU", onClick: { openLink: { url: "https://storage/img.png?token=x" } } } });
    expect(JSON.stringify(s[1].widgets[1])).toContain("hasta el 30 nov 2026");
    const botones = JSON.stringify(s[2]);
    expect(botones).toContain('"text":"Ver en grande"');
    expect(botones).toContain('"openLink":{"url":"https://app/re?board=b1"}');
    expect(botones).toContain('"interaction":"OPEN_DIALOG"');
  });

  it("botones: abrir en la app y ver otro proyecto", () => {
    const s = secciones(tarjetaStatusCard(datos(), { url: URL_BOT, enlace: "https://app/resumen-ejecutivo?board=b1" }));
    const botones = JSON.stringify(s[s.length - 1]);
    expect(botones).toContain('"openLink":{"url":"https://app/resumen-ejecutivo?board=b1"}');
    expect(botones).toContain('"interaction":"OPEN_DIALOG"');
  });
});

describe("diálogo mientras carga", () => {
  it("explica y ofrece Reintentar (acción recargar) y Cancelar", async () => {
    const { tarjetaCargando } = await import("./tarjeta");
    const s = JSON.stringify(tarjetaCargando(URL_BOT));
    expect(s).toContain("cargando los proyectos");
    expect(s).toContain('{"key":"flujo","value":"status-card"},{"key":"accion","value":"recargar"}');
    expect(s).toContain('{"key":"accion","value":"cancelar"}');
  });
});
