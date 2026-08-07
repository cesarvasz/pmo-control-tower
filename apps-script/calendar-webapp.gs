// ──────────────────────────────────────────────────────────────
// Web App del calendario: expone calendario + hoja como JSON.
// Lo consume la app en CALENDAR_WEBAPP_URL (ver src/lib/monday.ts).
//
// El parseo del título ya no usa substring(0, 9): ese corte fijo
// asumía exactamente "IN-###" + 1 espacio + "M#" = 9 caracteres, así
// que un doble espacio, un espacio inicial o un código de otro largo
// descartaban la reunión en silencio. Ahora se usa un regex.
// ──────────────────────────────────────────────────────────────

// ── CONFIGURACIÓN ─────────────────────────────────────────────
var HOJA_ID = "1IGLdWJO7KEGyGpVfttSI11dcT6QioZj7LuAIgd3FO34";
var HOJA_PESTANA = "Respuestas de formulario 1"; // ⚠️ AJUSTA al nombre real de la pestaña

var CAL_DESDE = new Date(2026, 4, 1); // 1 de mayo de 2026
var CAL_DIAS_ADELANTE = 120;          // antes 30: las M2 se agendan con más holgura
var CAL_TODOS_LOS_CALENDARIOS = true; // false = solo el calendario por defecto

// Token para el modo diagnóstico por HTTP (?debug=IN-120&token=...).
// Vacío = modo diagnóstico DESHABILITADO. El Web App es público
// (access: ANYONE_ANONYMOUS), así que sin token no se expone nada extra.
// Ponlo, diagnostica, y déjalo en "" cuando termines.
var DEBUG_TOKEN = "";

// ──────────────────────────────────────────────────────────────
// PARSEO DEL TÍTULO
// ──────────────────────────────────────────────────────────────
/** "IN-120 M2 Reglas ISR M@cf" → { codigo: "IN-120", meeting: "M2" }.
 *  Devuelve null si el título no corresponde a una reunión de iniciativa.
 *  Tolera espacios múltiples/iniciales, espacios no separables y guiones
 *  tipográficos (los que mete el autocorrector al pegar desde Word/Slack). */
function parseTituloEvento_(titulo) {
  var t = String(titulo || "")
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ") // NBSP y afines -> espacio normal
    .replace(/[\u2010-\u2015\u2212]/g, "-")        // guiones tipograficos -> guion ASCII
    .trim();

  var m = t.match(/^(IN-\d+)\s+(M[12])(?![0-9A-Za-z])/i);
  if (!m) return null;
  return { codigo: m[1].toUpperCase(), meeting: m[2].toUpperCase() };
}

/** Calendarios a inspeccionar. */
function calendarios_() {
  if (!CAL_TODOS_LOS_CALENDARIOS) return [CalendarApp.getDefaultCalendar()];
  var todos = CalendarApp.getAllCalendars();
  return todos && todos.length ? todos : [CalendarApp.getDefaultCalendar()];
}

// ──────────────────────────────────────────────────────────────
// CALENDARIO → JSON
// ──────────────────────────────────────────────────────────────
function getCalendarData() {
  var fechaFin = new Date();
  fechaFin.setDate(fechaFin.getDate() + CAL_DIAS_ADELANTE);

  var cals = calendarios_();
  var vistos = {};
  var resultado = [];

  for (var c = 0; c < cals.length; c++) {
    var eventos = cals[c].getEvents(CAL_DESDE, fechaFin);
    for (var i = 0; i < eventos.length; i++) {
      var evento = eventos[i];
      var p = parseTituloEvento_(evento.getTitle());
      if (!p) continue;

      var inicio = evento.getStartTime().toISOString();
      // Dedup: el mismo evento puede venir de varios calendarios (invitados).
      var clave = p.codigo + "|" + p.meeting + "|" + inicio;
      if (vistos[clave]) continue;
      vistos[clave] = true;

      resultado.push({
        codigo: p.codigo,
        meeting: p.meeting,
        inicio: inicio,
        fin: evento.getEndTime().toISOString()
      });
    }
  }
  return resultado;
}

// ──────────────────────────────────────────────────────────────
// DIAGNÓSTICO — corre esto a mano y mira Registros (Ctrl+Enter)
// ──────────────────────────────────────────────────────────────
/** Busca TODOS los eventos cuyo título contenga el código, en TODOS los
 *  calendarios y en una ventana amplia (±1 año), e imprime el título con
 *  delimitadores y los códigos de carácter. Sirve para ver por qué una
 *  reunión no está llegando a la app: título raro, fecha fuera de rango,
 *  o evento en un calendario distinto al que lee getCalendarData(). */
function debugBuscarEvento() {
  var CODIGO = "IN-120"; // ← cambia esto al código que quieras revisar
  var d = diagnostico_(CODIGO);

  Logger.log("Cuenta que ejecuta : " + d.cuentaEfectiva + "  (activa: " + d.cuentaActiva + ")");
  Logger.log("Zona horaria       : " + d.zonaHoraria);
  Logger.log("Calendarios vistos : " + d.calendarios.length);
  for (var k = 0; k < d.calendarios.length; k++) {
    Logger.log("   - " + d.calendarios[k].nombre + (d.calendarios[k].esDefault ? "  ← DEFAULT" : "") +
               "  [" + d.calendarios[k].id + "]");
  }
  Logger.log("Ventana endpoint   : " + d.ventana.desde + "  →  " + d.ventana.hasta);
  Logger.log("Total eventos que devuelve el endpoint: " + d.totalEndpoint);
  Logger.log("──────────────────────────────────────────────");
  Logger.log("Coincidencias con '" + CODIGO + "': " + d.coincidencias.length);

  for (var i = 0; i < d.coincidencias.length; i++) {
    var c = d.coincidencias[i];
    Logger.log("Calendario : " + c.calendario);
    Logger.log("Título     : [" + c.titulo + "]");
    Logger.log("Códigos    : " + c.codigosCaracter);
    Logger.log("Inicio     : " + c.inicio);
    Logger.log("¿Parsea?   : " + (c.parsea ? "SÍ → " + c.codigo + " / " + c.meeting : "NO ← título fuera de patrón"));
    Logger.log("¿En rango? : " + (c.enVentana ? "SÍ" : "NO ← fuera de la ventana de fechas"));
    Logger.log("Llega a la app: " + (c.llegaALaApp ? "SÍ" : "NO"));
    Logger.log("──────────────────────────────────────────────");
  }
  if (!d.coincidencias.length) {
    Logger.log("Ningún evento contiene '" + CODIGO + "' en ±1 año, en ninguno de los " +
               d.calendarios.length + " calendarios de " + d.cuentaEfectiva + ".");
    Logger.log("→ La reunión está en OTRA cuenta, o en un calendario no compartido con esta.");
  }
}

/** Reúne todo el diagnóstico en un objeto. Lo usan debugBuscarEvento()
 *  (por Logger) y doGet(?debug=CODIGO&token=...) (por HTTP). */
function diagnostico_(codigo) {
  var desde = new Date(); desde.setFullYear(desde.getFullYear() - 1);
  var hasta = new Date(); hasta.setFullYear(hasta.getFullYear() + 1);

  var ventanaFin = new Date();
  ventanaFin.setDate(ventanaFin.getDate() + CAL_DIAS_ADELANTE);

  var def = null, defId = "";
  try { def = CalendarApp.getDefaultCalendar(); defId = def.getId(); } catch (err) {}

  var cals = CalendarApp.getAllCalendars() || [];
  var infoCals = [];
  for (var c = 0; c < cals.length; c++) {
    infoCals.push({
      nombre: cals[c].getName(),
      id: cals[c].getId(),
      esDefault: cals[c].getId() === defId
    });
  }

  var coincidencias = [];
  var needle = String(codigo || "").toUpperCase();
  for (var c2 = 0; c2 < cals.length; c2++) {
    var eventos = cals[c2].getEvents(desde, hasta);
    for (var i = 0; i < eventos.length; i++) {
      var ev = eventos[i];
      var titulo = ev.getTitle() || "";
      if (titulo.toUpperCase().indexOf(needle) === -1) continue;

      var p = parseTituloEvento_(titulo);
      var ini = ev.getStartTime();
      var enVentana = (ini >= CAL_DESDE && ini <= ventanaFin);
      coincidencias.push({
        calendario: cals[c2].getName(),
        titulo: titulo,
        codigosCaracter: codigosDeCaracter_(titulo.substring(0, 14)),
        inicio: ini.toISOString(),
        fin: ev.getEndTime().toISOString(),
        parsea: !!p,
        codigo: p ? p.codigo : null,
        meeting: p ? p.meeting : null,
        enVentana: enVentana,
        llegaALaApp: !!p && enVentana
      });
    }
  }

  var cuentaEfectiva = "", cuentaActiva = "";
  try { cuentaEfectiva = Session.getEffectiveUser().getEmail(); } catch (err) {}
  try { cuentaActiva = Session.getActiveUser().getEmail(); } catch (err) {}

  return {
    codigoBuscado: codigo,
    cuentaEfectiva: cuentaEfectiva,
    cuentaActiva: cuentaActiva,
    zonaHoraria: Session.getScriptTimeZone(),
    calendarios: infoCals,
    ventana: { desde: CAL_DESDE.toISOString(), hasta: ventanaFin.toISOString() },
    totalEndpoint: getCalendarData().length,
    coincidencias: coincidencias
  };
}

/** "IN-120 M2" → "I(73) N(78) -(45) 1(49) ..." — delata NBSP y dobles espacios. */
function codigosDeCaracter_(s) {
  var out = [];
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    var code = s.charCodeAt(i);
    out.push((ch === " " ? "espacio" : ch) + "(" + code + ")");
  }
  return out.join(" ");
}

// ──────────────────────────────────────────────────────────────
// (OPCIONAL) Exporta el calendario a la pestaña 'Calendar'.
// No la usa el endpoint; se mantiene por si la corres manualmente.
// ──────────────────────────────────────────────────────────────
function exportarCalendarioSeparado() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName('Calendar') || libro.getActiveSheet();

  hoja.clear();
  hoja.appendRow(['Codigo', 'Meeting', 'Fecha y Hora de Inicio', 'Fecha y Hora de Fin']);

  var datos = getCalendarData();
  for (var i = 0; i < datos.length; i++) {
    hoja.appendRow([datos[i].codigo, datos[i].meeting, new Date(datos[i].inicio), new Date(datos[i].fin)]);
  }
}

// ──────────────────────────────────────────────────────────────
// HOJA NUEVA → JSON  (encabezados dinámicos hasta la 1ª celda vacía)
// ──────────────────────────────────────────────────────────────
function getHojaData() {
  var ss = SpreadsheetApp.openById(HOJA_ID);
  var hoja = ss.getSheetByName(HOJA_PESTANA) || ss.getSheets()[0];
  var datos = hoja.getDataRange().getValues();
  if (datos.length < 2) return [];

  // Encabezados: primera fila, corta en la primera celda vacía
  var encabezados = [];
  var filaEnc = datos[0];
  for (var c = 0; c < filaEnc.length; c++) {
    var h = String(filaEnc[c]).trim();
    if (h === "") break;
    encabezados.push(h);
  }
  var numCols = encabezados.length;

  // Filas de datos
  var filas = [];
  for (var r = 1; r < datos.length; r++) {
    var fila = datos[r];

    // Saltar filas vacías en las columnas de interés
    var vacia = true;
    for (var k = 0; k < numCols; k++) {
      if (String(fila[k]).trim() !== "") { vacia = false; break; }
    }
    if (vacia) continue;

    var obj = {};
    for (var c2 = 0; c2 < numCols; c2++) {
      var val = fila[c2];
      if (val instanceof Date) val = val.toISOString(); // fechas → ISO
      obj[encabezados[c2]] = val;
    }
    filas.push(obj);
  }
  return filas;
}

// ──────────────────────────────────────────────────────────────
// ENDPOINT: devuelve calendario + hoja en un solo objeto
// ──────────────────────────────────────────────────────────────
function doGet(e) {
  var params = (e && e.parameter) || {};

  // Modo diagnóstico: ?debug=IN-120&token=<DEBUG_TOKEN>
  // Solo responde si DEBUG_TOKEN está configurado Y coincide; si no, cae al
  // payload normal. Así el endpoint público no filtra calendarios ni correos.
  if (params.debug && DEBUG_TOKEN && params.token === DEBUG_TOKEN) {
    return ContentService
      .createTextOutput(JSON.stringify(diagnostico_(params.debug), null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var payload = {
    calendar: getCalendarData(),
    sheet:    getHojaData()
  };
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
