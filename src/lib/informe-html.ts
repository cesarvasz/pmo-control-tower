// Versión imprimible del informe DUCAFAST.
//
// Devuelve un HTML autocontenido —sin hojas de estilo ni scripts externos—
// que se abre en una ventana aparte y se manda a imprimir; el navegador ofrece
// «Guardar como PDF». Mismo camino que el reporte de comentarios NPS, y por la
// misma razón: no arrastra ninguna dependencia y produce un PDF con texto
// seleccionable en vez de una captura de pantalla.
//
// El contenido es el mismo que el de la pantalla, incluidas las advertencias.
// Un PDF circula solo, sin nadie que lo explique, así que las salvedades tienen
// que viajar con él — no son adorno de la interfaz.

import type { Informe, MesInforme } from "./informe";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Sin abreviar a «K»: en un informe formal el titular es la cifra que la gente
// cita, y «$63 K» junto a un detalle de $62,571.42 se lee como un descuadre.
const usdCorto = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)} M` : `$${Math.round(n).toLocaleString("en-US")}`;
const num = (n: number) => Math.round(n).toLocaleString("es-GT");
const pct = (n: number | null, d = 0) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);
const dur = (seg: number | null) => {
  if (seg == null) return "—";
  const h = seg / 3600;
  return h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`;
};

/** Barra proporcional dentro de una celda. Sin SVG: imprime igual en todos lados. */
const barra = (frac: number, color: string) =>
  `<span class="bar"><i style="width:${Math.max(0, Math.min(1, frac)) * 100}%;background:${color}"></i></span>`;

const marca = (m: MesInforme) => (m.parcial ? ' <span class="ast">*</span>' : "");

export function construirHtmlInforme(inf: Informe): string {
  const generado = new Date().toLocaleDateString("es-GT", { day: "2-digit", month: "long", year: "numeric" });
  const rango = inf.meses.length > 0
    ? `${inf.meses[0].label} – ${inf.meses[inf.meses.length - 1].label}`
    : "sin datos";
  // Único origen de la verdad: la librería ya resolvió cuál es el mes de
  // referencia, incluida la salvaguarda de cuando no hay ninguno cerrado.
  const ultimo = inf.meses.find((m) => m.clave === inf.ultimoCompleto) ?? null;
  const hayParcial = inf.meses.some((m) => m.parcial);
  const sc = inf.scorecard;

  if (inf.meses.length === 0) {
    return envolver(inf, generado, `<p class="vacio">No hay expedientes en ${inf.anio}.</p>`);
  }

  const maxTiempo = Math.max(1, ...inf.meses.map((m) => Math.max(m.con.segTramo ?? 0, m.sin.segTramo ?? 0)));
  const maxCosto = Math.max(1, ...inf.meses.map((m) => Math.max(m.con.costoFile, m.sin.costoFile)));
  const maxTasa = Math.max(0.001, ...inf.meses.map((m) => Math.max(m.con.personasPorMil, m.sin.personasPorMil)));

  const kpis = `
    <div class="kpis">
      <div class="kpi fuerte">
        <div class="v">${usdCorto(inf.ahorro)}</div>
        <div class="l">Ahorro acumulado en costo operativo</div>
        <div class="n">${num(inf.filesCon)} files procesados con DUCAFAST</div>
      </div>
      <div class="kpi">
        <div class="v">${pct(inf.reduccionPromedio)}</div>
        <div class="l">Reducción promedio del tiempo de ciclo</div>
        <div class="n">Creación → Pre-DUCA (T1+T2+T3)</div>
      </div>
      <div class="kpi">
        <div class="v">${pct(sc.roi)}</div>
        <div class="l">ROI real sobre la inversión en licencias</div>
        <div class="n">ejecutada a la fecha (${sc.multiplo.toFixed(1)}x)</div>
      </div>
      <div class="kpi">
        <div class="v">${pct(ultimo?.reduccionPersonal ?? null, 1)}</div>
        <div class="l">Menos personal necesario por file</div>
        <div class="n">${ultimo ? `en ${esc(ultimo.label)}, sobre T1–T3` : "—"}</div>
      </div>
    </div>`;

  const avisoParcial = hayParcial ? `
    <p class="pie">
      * El último mes va a medias. Los acumulados y el ROI llegan hasta
      ${esc(ultimo?.label ?? "—")}: sumar un mes incompleto al beneficio mientras la meta de
      licencias lo cuenta entero hundiría el ROI por un artefacto del calendario.
    </p>` : "";

  const contrapeso = ultimo?.con.segCola != null && ultimo.sin.segCola != null ? `
    <div class="aviso">
      <strong>Parte del tiempo ganado se devuelve después.</strong>
      El informe mide T1–T3, pero el tramo siguiente no es gratis: en ${esc(ultimo.label)} los files
      de DUCAFAST pasaron <strong>${dur(ultimo.con.segCola)}</strong> en revisión y firma contra
      <strong>${dur(ultimo.sin.segCola)}</strong> de los manuales${
        ultimo.con.segCola > ultimo.sin.segCola
          ? ` — ${(ultimo.con.segCola / ultimo.sin.segCola).toFixed(1)}× más`
          : ""
      }. Medido de punta a punta el ahorro del año sería
      <strong>${usdCorto(inf.ahorroCiclo)}</strong> en vez de ${usdCorto(inf.ahorro)}:
      ${usdCorto(inf.ahorro - inf.ahorroCiclo)} se devuelven en la revisión. No se descuenta aquí a
      propósito — este informe mide el tramo automatizado.
    </div>` : "";

  const filasTiempo = inf.meses.map((m) => `
    <tr>
      <td>${esc(m.label)}${marca(m)}</td>
      <td class="n destacado">${dur(m.con.segTramo)}</td>
      <td class="n">${dur(m.sin.segTramo)}</td>
      <td class="n">${barra((m.sin.segTramo ?? 0) / maxTiempo, "#9ca3af")}</td>
      <td class="n ok">${pct(m.reduccionTiempo)}</td>
      <td class="n gris">${dur(m.con.segTramoMediana)} / ${dur(m.sin.segTramoMediana)}</td>
      <td class="n gris">${num(m.con.filesTramo)} / ${num(m.sin.filesTramo)}</td>
    </tr>`).join("");

  const filasCosto = inf.meses.map((m) => `
    <tr>
      <td>${esc(m.label)}${marca(m)}</td>
      <td class="n destacado">${usd(m.con.costoFile)}</td>
      <td class="n gris">${usd(m.con.costoOperativoFile)}</td>
      <td class="n gris">${usd(m.con.costoLicenciasFile)}</td>
      <td class="n">${usd(m.sin.costoFile)}</td>
      <td class="n">${barra(m.sin.costoFile / maxCosto, "#9ca3af")}</td>
      <td class="n gris">${num(m.con.files)}</td>
      <td class="n ${m.parcial ? "gris" : "ok"}">${usd(m.ahorro)}</td>
    </tr>`).join("");

  const filasCapacidad = inf.meses.map((m) => `
    <tr>
      <td>${esc(m.label)}${marca(m)}</td>
      <td class="n destacado">${m.con.personasPorMil.toFixed(2)}</td>
      <td class="n">${m.sin.personasPorMil.toFixed(2)}</td>
      <td class="n">${barra(m.sin.personasPorMil / maxTasa, "#9ca3af")}</td>
      <td class="n ok">${pct(m.reduccionPersonal, 1)}</td>
      <td class="n gris">${m.con.personasNecesarias.toFixed(1)} de ${m.con.personasPresentes}</td>
      <td class="n gris">${m.sin.personasNecesarias.toFixed(1)} de ${m.sin.personasPresentes}</td>
    </tr>`).join("");

  const escala = inf.escala ? `
    <div class="caja">
      <div class="caja-t">Proyección a escala completa</div>
      <div class="caja-s">con la economía unitaria de ${esc(inf.escala.label)}</div>
      <div class="caja-v">${usd(inf.escala.ahorroMensual)}</div>
      <div class="caja-s">ahorro mensual si DUCAFAST cubriera el 100% de los
        ${num(inf.escala.files)} files del mes</div>
      <div class="caja-v">${usd(inf.escala.ahorroAnual)}</div>
      <div class="caja-s">ahorro anualizado a full escala</div>
      <div class="caja-n">Supone que el resto del volumen se comporta como el que ya pasa por
        DUCAFAST. Los files que quedan fuera pueden ser justamente los que no se dejan automatizar,
        así que léelo como techo, no como pronóstico.</div>
    </div>` : "";

  const cuerpo = `
    ${kpis}
    ${avisoParcial}

    <section>
      <h2><span class="tag">Indicador 1</span> Reducción del tiempo de ciclo</h2>
      <p class="sub">Tiempo promedio por file de T1+T2+T3 (Creación → Pre-DUCA): proceso manual
        contra DUCAFAST. Es el tramo que la automatización toca.</p>
      <table>
        <thead><tr>
          <th>Mes</th><th class="n">Con DUCAFAST</th><th class="n">Sin DUCAFAST</th><th></th>
          <th class="n">Reducción</th><th class="n">Mediana con / sin</th><th class="n">Files comparados</th>
        </tr></thead>
        <tbody>${filasTiempo}</tbody>
      </table>
      <p class="nota">Solo entran los files con los tres tiempos presentes: a uno al que le falta un
        hito no se le puede decir que «tardó menos». La mediana va aparte a propósito — el promedio
        carga una cola larga y queda muy por encima del file típico.</p>
      ${contrapeso}
    </section>

    <section>
      <h2><span class="tag">Indicador 2</span> Costo operativo por file</h2>
      <p class="sub">Tiempo humano de T1–T3 a ${usd(inf.tarifa)}/hora, más las licencias de
        digitalización a ${usd(inf.precioLicencia)} cada una. El robot no cobra por hora: su costo
        entra como licencia.</p>
      <table>
        <thead><tr>
          <th>Mes</th><th class="n">Con DUCAFAST</th><th class="n">· operativo</th>
          <th class="n">· licencias</th><th class="n">Sin DUCAFAST</th><th></th>
          <th class="n">Files con</th><th class="n">Ahorro</th>
        </tr></thead>
        <tbody>${filasCosto}</tbody>
      </table>
      <div class="caja ancha">
        <div class="caja-t">Ahorro acumulado ${inf.anio}</div>
        <div class="caja-v grande">${usd(inf.ahorro)}</div>
        <div class="caja-s">Contra el costo del proceso manual sobre el mismo volumen de files: la
          diferencia de costo unitario multiplicada por los ${num(inf.filesCon)} files que sí
          pasaron por DUCAFAST.</div>
      </div>
    </section>

    <section class="salto">
      <h2><span class="tag">Indicador 3</span> Productividad y capacidad instalada</h2>
      <p class="sub">Personas a tiempo completo que consume cada 1,000 files en T1–T3, al 95% de
        ocupación. Menos es mejor: es cuánta gente hay que poner para sacar el mismo volumen.</p>
      <table>
        <thead><tr>
          <th>Mes</th><th class="n">Personas/1,000 con</th><th class="n">… sin</th><th></th>
          <th class="n">Reducción</th><th class="n">Personas DUCAFAST</th><th class="n">Personas manual</th>
        </tr></thead>
        <tbody>${filasCapacidad}</tbody>
      </table>
      <p class="nota">La tasa va por cada 1,000 files y no como «files por persona» porque en T1–T3
        el tiempo humano de DUCAFAST tiende a cero: dividir entre eso daba múltiplos que saltaban
        entre 16x y 2,600x de un mes a otro sin que la operación cambiara. «Personas» son
        equivalentes a tiempo completo, sin redondear; la última columna de cada proceso es la
        plantilla que realmente aparece, mayor que la necesaria porque nadie está ocupado el 95% del
        tiempo ni trabaja un solo tipo de trámite.</p>
    </section>

    <section>
      <h2><span class="tag">Fase Revisión / ROI</span> Scorecard: retorno real contra línea base</h2>
      <p class="sub">Business Case: ${usd(inf.precioLicencia)} por licencia ×
        ${num(sc.metaMensual * 12)} licencias/año, prorrateado a los ${sc.meses} meses completos
        medidos.</p>
      <div class="dos">
        <div>
          <table>
            <thead><tr>
              <th>Métrica</th><th class="n">Proyectado (línea base)</th><th class="n">Real ejecutado</th>
            </tr></thead>
            <tbody>
              <tr><td>Inversión en licencias</td><td class="n gris">${usd(sc.inversionBase)}</td>
                <td class="n destacado">${usd(sc.inversionReal)}</td></tr>
              <tr><td>Licencias consumidas</td><td class="n gris">${num(sc.metaMensual * sc.meses)}</td>
                <td class="n destacado">${num(sc.licencias)}</td></tr>
              <tr><td>Beneficio (ahorro en costo)</td><td class="n gris">—</td>
                <td class="n ok">${usd(sc.beneficio)}</td></tr>
              <tr><td>ROI</td><td class="n gris">—</td>
                <td class="n destacado">${pct(sc.roi, 1)} (${sc.multiplo.toFixed(1)}x)</td></tr>
            </tbody>
          </table>
          <p class="nota">La inversión real quedó por debajo de la línea base porque el consumo de
            licencias sigue en ramp-up: ${num(sc.licenciasUltimoMes)} de ${num(sc.metaMensual)}
            licencias al mes en ${esc(ultimo?.label ?? "—")}.${
              sc.licencias > 0
                ? ` Al precio que trae la hoja (${usd(sc.inversionHoja / sc.licencias)} por licencia,
                    contra los ${usd(inf.precioLicencia)} del Business Case) la inversión real sería
                    ${usd(sc.inversionHoja)} y el ROI ${pct((sc.beneficio - sc.inversionHoja) / sc.inversionHoja, 1)}.`
                : ""
            }</p>
        </div>
        ${escala}
      </div>
    </section>

    <p class="metodo">
      Todo el informe mide <strong>T1+T2+T3</strong> (Creado → Creación Pre-DUCA), el tramo que
      DUCAFAST automatiza; la revisión del analista y la firma quedan fuera porque ocurren igual con
      DUCAFAST y sin él. Calculado sobre todos los expedientes de ${inf.anio} de la hoja 003, sin
      filtros. Las horas salen de unir los intervalos de cada persona, así que el trabajo simultáneo
      no se cuenta dos veces, y los ejecutores automatizados no suman horas. Horario hábil L–J
      08:00–13:00 y 14:00–18:00, V hasta las 17:00; no se descuentan asuetos.
    </p>`;

  return envolver(inf, generado, cuerpo, rango);
}

function envolver(inf: Informe, generado: string, cuerpo: string, rango = ""): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>DUCAFAST GT — resultados ${inf.anio}</title>
<style>
  @page { margin: 13mm; size: A4 portrait; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1f2937;
         font-size: 10.5px; line-height: 1.5; margin: 0; }
  .cab { background: #1e2a5a; color: #fff; padding: 18px 20px; border-radius: 10px; margin-bottom: 16px; }
  .cab .fase { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .14em; color: #a8bbff; }
  .cab h1 { font-size: 21px; margin: 4px 0 3px; font-weight: 800; }
  .cab .sub { font-size: 11px; color: #c7d2fe; }
  .cab .par { margin-top: 11px; padding-top: 9px; border-top: 1px solid #3b4a86; font-size: 9.5px; color: #c7d2fe; }
  .kpis { display: flex; gap: 9px; margin-bottom: 12px; }
  .kpi { flex: 1; background: #f3f4f6; border-radius: 9px; padding: 10px 11px; }
  .kpi.fuerte { background: #e0e7ff; }
  .kpi .v { font-size: 21px; font-weight: 800; line-height: 1; color: #1f2937; }
  .kpi.fuerte .v { color: #3651c8; }
  .kpi .l { font-size: 9px; margin-top: 5px; color: #4b5563; line-height: 1.35; }
  .kpi .n { font-size: 8px; margin-top: 2px; color: #6b7280; }
  .kpi.fuerte .n { color: #4d5fa8; }
  section { margin-top: 16px; page-break-inside: avoid; }
  section.salto { page-break-before: always; }
  h2 { font-size: 13px; font-weight: 800; margin: 0 0 3px; }
  .tag { display: inline-block; background: #e0e7ff; color: #3651c8; border-radius: 4px;
         padding: 2px 6px; font-size: 8px; font-weight: 700; text-transform: uppercase;
         letter-spacing: .09em; vertical-align: middle; margin-right: 5px; }
  .sub { font-size: 9.5px; color: #6b7280; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 7px; }
  th { background: #1e2a5a; color: #fff; font-size: 8.5px; font-weight: 700; text-align: left;
       padding: 5px 7px; text-transform: uppercase; letter-spacing: .03em; }
  th.n, td.n { text-align: center; }
  td { padding: 4px 7px; border-bottom: 1px solid #e5e7eb; font-variant-numeric: tabular-nums; }
  tbody tr:nth-child(even) { background: #f9fafb; }
  td.destacado { font-weight: 700; color: #3651c8; }
  td.ok { font-weight: 700; color: #0f8a5f; }
  td.gris { color: #9ca3af; }
  .ast { color: #9ca3af; }
  .bar { display: block; width: 54px; height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; }
  .bar i { display: block; height: 100%; }
  .nota { font-size: 8.5px; color: #6b7280; line-height: 1.45; margin: 5px 0 0; }
  .pie { font-size: 8.5px; color: #6b7280; line-height: 1.45; margin: 0 0 6px; }
  .aviso { margin-top: 8px; border-left: 3px solid #d97706; background: #fffbeb; padding: 7px 10px;
           font-size: 9px; line-height: 1.5; color: #4b5563; border-radius: 0 5px 5px 0; }
  .caja { background: #1e2a5a; color: #fff; border-radius: 9px; padding: 12px 14px; }
  .caja.ancha { background: #e0e7ff; color: #1f2937; margin-top: 8px; }
  .caja-t { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .09em; color: #a8bbff; }
  .caja.ancha .caja-t { color: #3651c8; }
  .caja-v { font-size: 19px; font-weight: 800; margin: 5px 0 2px; }
  .caja-v.grande { font-size: 24px; color: #3651c8; }
  .caja-s { font-size: 9px; line-height: 1.4; color: #c7d2fe; }
  .caja.ancha .caja-s { color: #4b5563; }
  .caja-n { font-size: 8px; line-height: 1.4; color: #9ca3af; margin-top: 8px; padding-top: 6px;
            border-top: 1px solid #3b4a86; }
  .dos { display: flex; gap: 11px; align-items: flex-start; }
  .dos > div:first-child { flex: 1; }
  .dos > .caja { width: 210px; flex: none; }
  .metodo { font-size: 8px; color: #9ca3af; line-height: 1.5; margin-top: 16px;
            padding-top: 8px; border-top: 1px solid #e5e7eb; }
  .vacio { color: #9ca3af; font-style: italic; }
</style></head>
<body>
  <div class="cab">
    <div class="fase">Seguimiento · Fase Operación</div>
    <h1>DUCAFAST GT — resultados ${inf.anio}</h1>
    <div class="sub">Autoautomatización de generación de DUCAs · medición continua de beneficio${rango ? `, ${esc(rango)}` : ""}</div>
    <div class="par">
      Tarifa ${usd(inf.tarifa)}/h · ${usd(inf.precioLicencia)} por licencia ·
      meta ${num(inf.scorecard.metaMensual * 12)} licencias/año · generado el ${esc(generado)}
    </div>
  </div>
  ${cuerpo}
</body></html>`;
}
