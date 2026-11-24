// Flujo «Status Card»: cómo se ve en Google Chat. Lógica PURA sobre el MISMO StatusReportData de la pantalla
// (lib/statusReportData.ts); aquí solo se acomoda a los widgets de una tarjeta de Chat (sin Gantt: fases con su estado).

import { NEUTRAL, TONE, type Tone } from "@/lib/reportTheme";
import { splitBoardName } from "@/lib/proj";
import type { StatusPhase, StatusPhaseStatus, StatusReportData } from "@/lib/statusReportData";
import type { ProjBoard } from "@/types";
import { tarjetaFormulario, type CampoChat, type Leidos } from "../../nucleo/formulario";
import { botonBot, botonEnlace, escapar, type Tarjeta, type Widget } from "../../nucleo/respuestas";

export const CLAVE_STATUS_CARD = "status-card";
export const ACCION_VER = "ver";
/** Volver a intentar cargar la lista (cuando el portafolio aún se estaba armando). */
export const ACCION_RECARGAR = "recargar";
export const CAMPO_PROYECTO = "proyecto";
/** Atrasos que se listan en el chat (el resto, en la app). */
export const MAX_ATRASOS = 8;

/** «PM-013 · TDP ADU 💡» */
export function nombreProyecto(boardName: string): string {
  const { code, name } = splitBoardName(boardName);
  return code ? `${code} · ${name}` : name;
}

export function campoProyecto(boards: Pick<ProjBoard, "id" | "name">[]): CampoChat {
  return {
    nombre: CAMPO_PROYECTO, etiqueta: "Proyecto", tipo: "lista", obligatorio: true, seccion: "datos",
    opciones: boards.map((b) => ({ valor: b.id, texto: nombreProyecto(b.name) })),
  };
}

/** El diálogo: elegir el proyecto. */
export function tarjetaElegirProyecto(boards: Pick<ProjBoard, "id" | "name">[], url: string, extra: { leidos?: Leidos; errores?: string[] } = {}): Tarjeta {
  return tarjetaFormulario({
    titulo: "Status Card", campos: [campoProyecto(boards)], url, flujo: CLAVE_STATUS_CARD,
    enviar: { texto: "Ver Status Card", accion: ACCION_VER }, ...extra,
  });
}

/** El diálogo mientras el portafolio se sigue armando (tarda más de lo que Google Chat espera): botón para reintentar. */
export function tarjetaCargando(url: string, mensaje = "Estoy cargando los proyectos del portafolio. Toca «Reintentar» en unos segundos."): Tarjeta {
  return {
    sections: [
      { header: "Status Card", widgets: [{ textParagraph: { text: `⏳ ${escapar(mensaje)}` } }] },
      { widgets: [{ buttonList: { buttons: [
        botonBot({ url, flujo: CLAVE_STATUS_CARD, accion: ACCION_RECARGAR, texto: "Reintentar" }),
        botonBot({ url, flujo: CLAVE_STATUS_CARD, accion: "cancelar", texto: "Cancelar", secundario: true }),
      ] } }] },
    ],
  };
}

// ── La Status Card ───────────────────────────────────────────────────────────

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «2026-05-22» → «22 may 2026» (sin zona horaria: es una fecha de calendario). */
export function fechaCorta(ymd: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
  if (!m) return "";
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}`;
}

const ICONO: Record<StatusPhaseStatus, string> = {
  done: "✅", current: "🔵", late: "🔴", pending_progress: "🟡", pending: "⚪", future: "⚪",
};

const color = (tone: Tone, texto: string) => `<font color="${TONE[tone].fg}">${texto}</font>`;

function rango(p: StatusPhase): string {
  if (p.milestone) return fechaCorta(p.milestone);
  const a = fechaCorta(p.start), b = fechaCorta(p.due);
  return a && b ? `${a} – ${b}` : a || b;
}

function lineaFase(p: StatusPhase): string {
  const pct = typeof p.progress === "number" && p.status !== "done" && p.status !== "future" ? ` · ${Math.round(p.progress * 100)} %` : "";
  const fechas = rango(p);
  return `${ICONO[p.status]} <b>${escapar(p.name)}</b> — ${escapar(p.state)}${pct}${fechas ? `  <font color="${NEUTRAL}">(${fechas})</font>` : ""}`;
}

const dato = (etiqueta: string, texto: string, abajo?: string): Widget =>
  ({ decoratedText: { topLabel: etiqueta, text: texto, wrapText: true, ...(abajo ? { bottomLabel: abajo } : {}) } });

const encabezado = (d: StatusReportData) => ({
  // El encabezado de la tarjeta es texto plano (no HTML): no se escapa («AIR & SEA» saldría «AIR &amp; SEA»).
  title: `${d.project.id ? `${d.project.id} · ` : ""}${d.project.name}`,
  subtitle: `Status Ejecutivo PMO · al ${fechaCorta(d.today)}`,
});

const botonOtro = (url: string) => botonBot({ url, flujo: CLAVE_STATUS_CARD, accion: "abrir", texto: "Ver otro proyecto", dialogo: true, secundario: true });

/** Con la FOTO de la hoja (idéntica a la app): 3 datos para leer sin abrirla (Salud, Atraso, Cierre estimado), la
 *  imagen (al tocarla se abre en grande) y los botones. `vence` = AAAA-MM-DD en que el enlace de la imagen deja de servir. */
export function tarjetaConImagen(d: StatusReportData, o: { url: string; enlace: string; imagen: string; vence: string }): Tarjeta {
  return {
    header: encabezado(d),
    sections: [
      { widgets: [
        dato("Salud", `${color(d.salud_tone, `<b>● ${escapar(d.salud_estado)}</b>`)} · ${escapar(d.salud_pct)}`),
        dato("Atraso", color(d.atraso_tone, `<b>${escapar(d.atraso_valor)}</b>`)),
        dato("Cierre estimado", color(d.cierre_estimado_tone, `<b>${escapar(d.cierre_estimado)}</b>`), d.cierre_estimado_sub || undefined),
      ] },
      { widgets: [
        { image: { imageUrl: o.imagen, altText: `Status Card de ${encabezado(d).title}`, onClick: { openLink: { url: o.imagen } } } },
        { textParagraph: { text: `<font color="${NEUTRAL}"><i>Toca la imagen para verla en grande. Se puede ver hasta el ${fechaCorta(o.vence)}.</i></font>` } },
      ] },
      { widgets: [{ buttonList: { buttons: [
        botonEnlace("Ver en grande", o.imagen),
        botonEnlace("Abrir en PMO Control Tower", o.enlace),
        botonOtro(o.url),
      ] } }] },
    ],
  };
}

/** La tarjeta del mensaje (va dentro de cardsV2). `enlace` = la Status Card en la app. */
export function tarjetaStatusCard(d: StatusReportData, o: { url: string; enlace: string }): Tarjeta {
  const p = d.project;
  const spi = d.spi === null ? "—" : d.spi.toFixed(2);

  const indicadores: Widget[] = [
    dato("Salud", `${color(d.salud_tone, `<b>● ${escapar(d.salud_estado)}</b>`)} · ${escapar(d.salud_pct)}`),
    dato("Avance", `Real <b>${escapar(d.avance_real)}</b> · Plan ${escapar(d.avance_plan)} · SPI ${spi}`),
    dato("Atraso", color(d.atraso_tone, `<b>${escapar(d.atraso_valor)}</b>`)),
    dato("Cierre plan", escapar(d.fecha_cierre_plan)),
    dato("Cierre estimado", color(d.cierre_estimado_tone, `<b>${escapar(d.cierre_estimado)}</b>`), d.cierre_estimado_sub || undefined),
    dato("Valor generado · ROI · Payback", `${escapar(d.valor_generado)} · ${escapar(d.roi)} · ${escapar(d.payback)}`),
  ];

  const fases = d.phases.filter((f) => f.indent === 0);
  const entregables = d.phases.filter((f) => f.indent === 1);
  const faseEntregables = fases.find((f) => f.band === "L")?.name ?? "Launch";

  const atrasos = d.atrasos.slice(0, MAX_ATRASOS).map((a): Widget => ({
    textParagraph: {
      text: `<b>${escapar(a.hito)}</b><br>` +
        `${color("crit", escapar(a.dias))} · ${escapar(a.fase)} · Vencía ${escapar(a.fecha)} · Responsable: ${escapar(a.resp)}` +
        `${a.acargo ? ` · A cargo: ${escapar(a.acargo)}` : ""}` +
        `${a.motivo ? `<br><i>${escapar(a.motivo)}</i>` : ""}`,
    },
  }));
  if (d.atrasos.length > MAX_ATRASOS) atrasos.push({ textParagraph: { text: `<i>…y ${d.atrasos.length - MAX_ATRASOS} más en la app.</i>` } });
  const reparto = d.resp_dist.length ? d.resp_dist.map((r) => `${escapar(r.label)} ${r.value} %`).join(" · ") : "";

  const proyecto: Widget[] = [
    dato("PM", escapar(p.pm || "—")),
    dato("Sponsor", escapar(p.sponsor || "—")),
    dato("CKU", escapar(p.cku || "—")),
    dato("Estrategia", escapar(p.estrategia || "—")),
    ...(p.alcance ? [dato("Alcance", escapar(p.alcance))] : []),
  ];

  return {
    header: encabezado(d),
    sections: [
      { widgets: indicadores },
      { header: "Fases VALOR", widgets: [{ textParagraph: { text: fases.map(lineaFase).join("<br>") || "Sin fases" } }] },
      ...(entregables.length ? [{
        header: `Entregables de ${escapar(faseEntregables)} (${entregables.length})`, collapsible: true, uncollapsibleWidgetsCount: 0,
        widgets: [{ textParagraph: { text: entregables.map(lineaFase).join("<br>") } }],
      }] : []),
      {
        header: `Causas de atraso (${d.atrasos.length})`,
        widgets: d.atrasos.length
          ? [...atrasos, ...(reparto ? [dato("Reparto del atraso", reparto)] : [])]
          : [{ textParagraph: { text: color("good", "Sin entregables atrasados.") } }],
      },
      { header: "Proyecto", collapsible: true, uncollapsibleWidgetsCount: 0, widgets: proyecto },
      { widgets: [{ buttonList: { buttons: [
        botonEnlace("Abrir en PMO Control Tower", o.enlace),
        botonOtro(o.url),
      ] } }] },
    ],
  };
}
