// Versión imprimible del Reporte Ducafast.
//
// Devuelve un HTML autocontenido —sin hojas de estilo ni scripts externos—
// que se abre en una ventana aparte y se manda a imprimir; el navegador ofrece
// «Guardar como PDF». Mismo camino que el informe anterior (informe-html.ts) y
// el reporte de comentarios NPS: no arrastra ninguna dependencia y produce un
// PDF con texto seleccionable en vez de una captura de pantalla.
//
// Los gráficos se representan como tabla + barra proporcional en CSS (sin
// SVG): imprime igual en todos lados y es lo que ya usa el resto del tablero
// para PDF.

import type { ReporteDucafast, MesDucafast } from "./reporteDucafast";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const usd2 = (n: number) => `$${n.toFixed(2)}`;
const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const min1 = (n: number) => `${n.toFixed(1)} min`;
const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;
const num0 = (n: number) => Math.round(n).toLocaleString("en-US");

/** Barra proporcional dentro de una celda. Sin SVG: imprime igual en todos lados. */
const barra = (frac: number, color: string) =>
  `<span class="bar"><i style="width:${Math.max(0, Math.min(1, frac)) * 100}%;background:${color}"></i></span>`;

export function construirHtmlReporteDucafast(rep: ReporteDucafast): string {
  const generado = new Date().toLocaleDateString("es-GT", { day: "2-digit", month: "long", year: "numeric" });
  const { meses, totales: t } = rep;

  if (meses.length === 0) {
    return envolver(`<p class="vacio">No hay files de Mesa 2 en los últimos meses.</p>`);
  }

  const primero = meses[0], ultimo = meses[meses.length - 1];
  const reduccionCosto = t.costoFileNod > 0 ? 1 - t.costoFileDuca / t.costoFileNod : 0;
  const multiploTiempo = t.minutosDuca > 0 ? t.minutosNod / t.minutosDuca : 0;
  const metaMensual = t.metaPorCapturar / meses.length;
  const rango = `${esc(primero.label)} – ${esc(ultimo.label)}`;

  const kpis = `
    <div class="kpis">
      <div class="kpi"><div class="l">Costo por file</div><div class="v">${usd2(t.costoFileDuca)}</div>
        <div class="n">vs ${usd2(t.costoFileNod)} sin Ducafast · ${Math.round(reduccionCosto * 100)}% más barato</div></div>
      <div class="kpi"><div class="l">Tiempo por file</div><div class="v">${min1(t.minutosDuca)}</div>
        <div class="n">vs ${min1(t.minutosNod)} sin Ducafast · ${multiploTiempo.toFixed(1)} veces</div></div>
      <div class="kpi"><div class="l">Volumen Ducafast</div><div class="v">${pct1(t.pctDucafastUltimo)}</div>
        <div class="n">${esc(ultimo.label)}, desde ${pct1(t.pctDucafastPrimero)} en ${esc(primero.label)}</div></div>
      <div class="kpi"><div class="l">Ahorro generado</div><div class="v">${usd0(t.ahorroGenerado)}</div>
        <div class="n">en ${num0(t.duca)} files y ${num0(t.horasAhorradas)} horas</div></div>
      <div class="kpi"><div class="l">Meta de ahorro</div><div class="v">${usd0(t.metaPorCapturar)}</div>
        <div class="n">en ${meses.length} meses · ${usd0(metaMensual)} al mes</div></div>
    </div>`;

  const maxFiles = Math.max(1, ...meses.map((m) => m.totalFiles));
  const filasVolumen = meses.map((m) => `
    <tr>
      <td>${esc(m.label)}</td>
      <td class="n destacado">${num0(m.duca.files)}</td>
      <td class="n">${num0(m.nod.files)}</td>
      <td class="n">${barra(m.totalFiles / maxFiles, "#888780")}</td>
      <td class="n gris">${pct1(m.pctDucafast)}</td>
    </tr>`).join("");

  const maxCosto = Math.max(1, ...meses.flatMap((m) => [m.duca.costoFile, m.nod.costoFile]));
  const filasCosto = meses.map((m) => `
    <tr>
      <td>${esc(m.label)}</td>
      <td class="n destacado">${usd2(m.duca.costoFile)}</td>
      <td class="n">${usd2(m.nod.costoFile)}</td>
      <td class="n">${barra(m.nod.costoFile / maxCosto, "#eb6834")}</td>
    </tr>`).join("");

  const maxTiempo = Math.max(1, ...meses.flatMap((m) => [m.duca.minutosFile, m.nod.minutosFile]));
  const filasTiempo = meses.map((m) => `
    <tr>
      <td>${esc(m.label)}</td>
      <td class="n destacado">${min1(m.duca.minutosFile)}</td>
      <td class="n">${min1(m.nod.minutosFile)}</td>
      <td class="n">${barra(m.nod.minutosFile / maxTiempo, "#eb6834")}</td>
    </tr>`).join("");

  const maxAhorro = Math.max(1, ...meses.map((m) => m.ahorroGenerado));
  const filasAhorro = meses.map((m) => `
    <tr>
      <td>${esc(m.label)}</td>
      <td class="n">${usd0(m.duca.costoFile * m.duca.files)}</td>
      <td class="n">${usd0(m.nod.costoFile * m.duca.files)}</td>
      <td class="n destacado">${usd0(m.ahorroGenerado)}</td>
      <td class="n">${barra(m.ahorroGenerado / maxAhorro, "#2a78d6")}</td>
    </tr>`).join("");

  const maxMeta = Math.max(1, ...meses.flatMap((m) => [m.ahorroGenerado, m.metaPorCapturar]));
  const filasMeta = meses.map((m) => `
    <tr>
      <td>${esc(m.label)}</td>
      <td class="n">${usd0(m.ahorroGenerado)}</td>
      <td class="n destacado">${usd0(m.metaPorCapturar)}</td>
      <td class="n">${barra(m.metaPorCapturar / maxMeta, "#2a78d6")}</td>
    </tr>`).join("");

  const maxFte = Math.max(0.01, ...meses.flatMap((m) => [m.fteHoy, m.fteEscenario]));
  const filasFte = meses.map((m) => `
    <tr>
      <td>${esc(m.label)}</td>
      <td class="n">${m.fteHoy.toFixed(2)}</td>
      <td class="n destacado" style="color:#2f8f6f">${m.fteEscenario.toFixed(2)}</td>
      <td class="n" style="color:#2f8f6f">${(m.fteEscenario - m.fteHoy).toFixed(2)}</td>
      <td class="n">${barra(m.fteHoy / maxFte, "#888780")}</td>
    </tr>`).join("");

  const capacidadProm = meses.reduce((s, m) => s + m.capacidadInstalada, 0) / meses.length;
  const filasIndicadores = meses.map((m, i) => `
    <tr${i % 2 === 1 ? ' class="alt"' : ""}>
      <td>${esc(m.label)}</td>
      <td class="n">${num0(m.capacidadInstalada)}</td>
      <td class="n">${num0(m.totalFiles)} · ${pct1(m.pctDucafast)}</td>
      <td class="n">${usd2(m.costoMezclado)}</td>
      <td class="n">${usd2(m.brechaCosto)}</td>
      <td class="n">${min1(m.brechaTiempo)}</td>
      <td class="n destacado">${usd0(m.ahorroGenerado)}</td>
    </tr>`).join("");

  const maxMezclado = Math.max(1, ...meses.map((m) => m.costoMezclado));
  const maxCapacidad = Math.max(1, ...meses.map((m) => m.filesPorCapacidad));
  const filasMezclado = meses.map((m) => `
    <tr><td>${esc(m.label)}</td><td class="n">${usd2(m.costoMezclado)}</td>
      <td class="n">${barra(m.costoMezclado / maxMezclado, "#888780")}</td></tr>`).join("");
  const filasCapacidadUso = meses.map((m: MesDucafast) => `
    <tr><td>${esc(m.label)}</td><td class="n">${m.filesPorCapacidad.toFixed(1)}</td>
      <td class="n">${barra(m.filesPorCapacidad / maxCapacidad, "#888780")}</td></tr>`).join("");

  const cuerpo = `
    ${kpis}

    <section>
      <h2><span class="tag">1</span> Volumen de files por mes</h2>
      <p class="sub">De ${num0(primero.totalFiles)} files en ${esc(primero.label)} a ${num0(ultimo.totalFiles)} en
        ${esc(ultimo.label)}. La participación de Ducafast bajó de ${pct1(primero.pctDucafast)} a ${pct1(ultimo.pctDucafast)}.</p>
      <table><thead><tr><th>Mes</th><th class="n">Ducafast</th><th class="n">No Ducafast</th><th></th><th class="n">% Ducafast</th></tr></thead>
        <tbody>${filasVolumen}</tbody></table>
    </section>

    <section>
      <h2><span class="tag">2</span> Costo por file</h2>
      <p class="sub">Ducafast se mantuvo entre ${usd2(Math.min(...meses.map((m) => m.duca.costoFile)))} y
        ${usd2(Math.max(...meses.map((m) => m.duca.costoFile)))} por file.</p>
      <table><thead><tr><th>Mes</th><th class="n">Ducafast</th><th class="n">No Ducafast</th><th></th></tr></thead>
        <tbody>${filasCosto}</tbody></table>
    </section>

    <section>
      <h2><span class="tag">3</span> Tiempo por file</h2>
      <p class="sub">Brecha de ${min1(primero.brechaTiempo)} en ${esc(primero.label)} a ${min1(ultimo.brechaTiempo)} en ${esc(ultimo.label)}.</p>
      <table><thead><tr><th>Mes</th><th class="n">Ducafast</th><th class="n">No Ducafast</th><th></th></tr></thead>
        <tbody>${filasTiempo}</tbody></table>
    </section>

    <section class="salto">
      <h2><span class="tag">4</span> Ahorro generado con Ducafast</h2>
      <p class="sub">Costo real de los files con Ducafast contra lo que habrían costado a la tarifa sin Ducafast del mismo mes.</p>
      <table><thead><tr><th>Mes</th><th class="n">Costo real</th><th class="n">A tarifa sin Ducafast</th><th class="n">Ahorro</th><th></th></tr></thead>
        <tbody>${filasAhorro}</tbody></table>
    </section>

    <section>
      <h2><span class="tag">5</span> Meta de ahorro por mes</h2>
      <p class="sub">Promedio mensual de la meta por capturar: ${usd0(metaMensual)}.</p>
      <table><thead><tr><th>Mes</th><th class="n">Ahorro generado</th><th class="n">Meta por capturar</th><th></th></tr></thead>
        <tbody>${filasMeta}</tbody></table>
    </section>

    <section>
      <h2><span class="tag">6</span> Personas necesarias por mes</h2>
      <p class="sub">Personas a tiempo completo con el mix actual contra el escenario 100% Ducafast.</p>
      <table><thead><tr><th>Mes</th><th class="n">Hoy</th><th class="n">Escenario Ducafast</th><th class="n">Reducción</th><th></th></tr></thead>
        <tbody>${filasFte}</tbody></table>
    </section>

    <section class="salto">
      <h2><span class="tag">7</span> Indicadores por mes</h2>
      <table><thead><tr>
          <th>Mes</th><th class="n">Capacidad</th><th class="n">Volumen Ducafast</th><th class="n">Costo mezclado</th>
          <th class="n">Brecha costo</th><th class="n">Brecha tiempo</th><th class="n">Ahorro generado</th>
        </tr></thead>
        <tbody>${filasIndicadores}
          <tr class="total">
            <td>Total</td><td class="n">${num0(capacidadProm)}</td>
            <td class="n">${num0(t.files)} · ${pct1(t.duca / t.files)}</td>
            <td class="n">${usd2((t.costoFileDuca * t.duca + t.costoFileNod * t.nod) / t.files)}</td>
            <td class="n">${usd2(t.costoFileNod - t.costoFileDuca)}</td>
            <td class="n">${min1(t.minutosNod - t.minutosDuca)}</td>
            <td class="n">${usd0(t.ahorroGenerado)}</td>
          </tr>
        </tbody></table>
    </section>

    <section>
      <h2><span class="tag">8</span> Costo mezclado y uso de la capacidad</h2>
      <div class="dos">
        <table><thead><tr><th>Mes</th><th class="n">Costo mezclado</th><th></th></tr></thead>
          <tbody>${filasMezclado}</tbody></table>
        <table><thead><tr><th>Mes</th><th class="n">Files/capacidad</th><th></th></tr></thead>
          <tbody>${filasCapacidadUso}</tbody></table>
      </div>
    </section>

    <p class="metodo">
      Promedios ponderados por volumen de files, nunca como promedio simple de los ${meses.length} meses.
      Tiempos convertidos de hh:mm:ss a minutos decimales. La meta de ahorro asume que cada file sin
      Ducafast se hubiera procesado al costo Ducafast de su propio mes. Las horas son la suma de la
      duración de cada file, así que si varios se trabajan en paralelo el tiempo realmente ocupado es
      menor y las personas necesarias son un techo. La capacidad instalada no equivale a personas de
      tiempo completo dedicadas solo a esto.
    </p>`;

  return envolver(cuerpo, rango, generado);
}

function envolver(cuerpo: string, rango = "", generado = ""): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Reporte Ducafast</title>
<style>
  @page { margin: 0.6in 0.5in 0.5in 0.5in; size: letter portrait; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a19;
         font-size: 10.5px; line-height: 1.5; margin: 0; }
  .cab { background: #f5f4ef; padding: 16px 18px; border-radius: 10px; margin-bottom: 14px; }
  .cab .fase { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; color: #2a78d6; }
  .cab h1 { font-size: 19px; margin: 4px 0 3px; font-weight: 800; }
  .cab .sub { font-size: 10px; color: #6b6a66; }
  .kpis { display: flex; gap: 0; margin-bottom: 14px; border-radius: 10px; overflow: hidden; background: #f5f4ef; }
  .kpi { flex: 1; padding: 10px 12px; border-right: 1px solid #e1e0d9; }
  .kpi:last-child { border-right: none; }
  .kpi .l { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b6a66; }
  .kpi .v { font-size: 17px; font-weight: 800; margin-top: 3px; line-height: 1; }
  .kpi .n { font-size: 7.5px; margin-top: 4px; color: #6b6a66; line-height: 1.35; }
  section { margin-top: 14px; page-break-inside: avoid; break-inside: avoid; }
  section.salto { page-break-before: always; break-before: page; }
  h2 { font-size: 12px; font-weight: 800; margin: 0 0 3px; }
  .tag { display: inline-block; background: #eef2f8; color: #2a78d6; border-radius: 4px;
         padding: 2px 6px; font-size: 8px; font-weight: 700; vertical-align: middle; margin-right: 5px; }
  .sub { font-size: 8.5px; color: #6b6a66; margin: 0 0 7px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { background: #1a1a19; color: #fff; font-size: 8px; font-weight: 700; text-align: left;
       padding: 5px 7px; text-transform: uppercase; letter-spacing: .03em; }
  th.n, td.n { text-align: center; }
  td { padding: 4px 7px; border-bottom: 1px solid #e1e0d9; font-variant-numeric: tabular-nums; }
  tr.alt { background: #faf9f5; }
  tr.total { border-top: 2px solid #1a1a19; font-weight: 700; }
  td.destacado { font-weight: 700; color: #2a78d6; }
  td.gris { color: #6b6a66; }
  .bar { display: block; width: 46px; height: 6px; background: #e1e0d9; border-radius: 3px; overflow: hidden; margin: 0 auto; }
  .bar i { display: block; height: 100%; }
  .dos { display: flex; gap: 14px; }
  .dos > table { flex: 1; }
  .metodo { font-size: 7.5px; color: #6b6a66; line-height: 1.5; margin-top: 14px; padding-top: 7px; border-top: 1px solid #e1e0d9; }
  .vacio { color: #6b6a66; font-style: italic; }
</style></head>
<body>
  <div class="cab">
    <div class="fase">Mesa 2 · Ducafast vs. no Ducafast</div>
    <h1>Reporte Ducafast</h1>
    <div class="sub">${rango ? esc(rango) + " · " : ""}generado el ${esc(generado)}</div>
  </div>
  ${cuerpo}
</body></html>`;
}
