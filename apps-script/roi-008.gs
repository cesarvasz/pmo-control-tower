/**
 * ROI 008 — Ducafast SV · análisis de tiempos — PMO Control Tower
 * ---------------------------------------------------------------------------
 * Expone en SOLO LECTURA (doGet) la pestaña "008" de la MISMA hoja ROI de la que
 * ya lee el reporte 003, para la pestaña «Ducafast SV» de la página ROI. Es un
 * proyecto de Apps Script aparte (como Clonación e Implementación): su propio
 * doGet, su propio caché, su propia variable de entorno en la app
 * (ROI_008_WEBAPP_URL). Así un cambio aquí no puede romper el 003.
 *
 * Es una copia del patrón de roi-log.gs (caché en Drive + gzip + fechas como
 * hora de pared). Lo que cambia:
 *   · SHEET_TAB = "008" y las columnas de esa pestaña.
 *   · Las columnas se reconocen por nombre NORMALIZADO (sin mayúsculas, tildes,
 *     espacios ni guiones): «Clasificación exacta» = «Clasificacion_exacta».
 *   · Una fecha puede venir como Date, como TEXTO o como NÚMERO DE SERIE de
 *     Sheets/Excel (días desde 1899-12-30) — se aceptan las tres.
 *   · Si la zona horaria de la hoja y la del proyecto no coinciden, se corrige
 *     (ver ajusteZona_): la hora que vale es la que se ve en la hoja.
 *
 * Requiere Script Properties: ROI_SHEET_ID (el MISMO ID que usa el script de
 * 003 — de la URL .../spreadsheets/d/<ESTE_ID>/edit).
 * Proyecto → Configuración (⚙️) → Propiedades del script.
 *
 * INSTALACIÓN DEL CACHÉ: ejecuta instalarDisparador() una vez desde el editor.
 * Ver apps-script/roi-008-README.md.
 * ---------------------------------------------------------------------------
 */

var SHEET_TAB = "008"; // nombre de la pestaña a leer — actualizar aquí si cambia.

var PROP_CACHE_ID = "ROI_008_CACHE_FILE_ID"; // lo escribe el script, no lo pongas a mano
var CACHE_NOMBRE = "roi-008-cache.json";
var CACHE_MAX_MIN = 180;                     // más viejo que esto, el doGet lo rehace
var REFRESCO_MIN = 30;                       // cada cuánto corre el disparador

/**
 * Época de referencia: las fechas viajan como SEGUNDOS desde aquí. Se empaquetan
 * los componentes LOCALES (hora de pared) dentro de un Date.UTC y la app los
 * desempaqueta con getUTC*: el número no es un instante real, así que no
 * depende de la zona horaria de nadie (ver roi-log.gs).
 */
var EPOCA = Date.UTC(2024, 0, 1);

/** Días entre 1899-12-30 (día 0 de Sheets/Excel) y 1970-01-01. */
var SERIE_1970 = 25569;

/** Columnas de texto repetido → van por diccionario (nombres normalizados). */
var COLS_TEXTO = ["cliente", "usuario"];
/** Columnas de fecha → van como segundos desde EPOCA (nombres normalizados). */
var COLS_FECHA = ["fechafile", "creado", "dpr", "clasificacionexacta", "solicitudprepoliza"];

/** «Clasificación exacta» → «clasificacionexacta». */
function normalizar_(s) {
  return String(s === null || s === undefined ? "" : s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Segundos que hay que sumar a la hora que da el script para obtener la hora
 * que se VE en la hoja. Es 0 cuando las dos zonas coinciden (lo normal).
 *
 * Los Date de getValues() son el instante que la hoja calcula con SU zona; los
 * getters (getHours…) lo leen con la zona del PROYECTO. Si difieren, las horas
 * se correrían y con ellas los tiempos hábiles. Se mide una sola vez con
 * Utilities.formatDate (no por celda: eso fue lo que reventó los 6 min en 003).
 * Guatemala y El Salvador no tienen horario de verano, así que una sola
 * medición vale para todo el año.
 */
function ajusteZona_(ss) {
  var zonaHoja = ss.getSpreadsheetTimeZone();
  var zonaScript = Session.getScriptTimeZone();
  if (zonaHoja === zonaScript) return 0;

  var ref = new Date();
  var txt = Utilities.formatDate(ref, zonaHoja, "yyyy-MM-dd'T'HH:mm:ss");
  var m = txt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  var enHoja = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  var enScript = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate(),
    ref.getHours(), ref.getMinutes(), ref.getSeconds());
  var ajuste = Math.round((enHoja - enScript) / 1000);
  Logger.log("aviso: zona de la hoja (" + zonaHoja + ") ≠ zona del proyecto (" + zonaScript +
    ") — se corrigen " + ajuste + " s por fecha");
  return ajuste;
}

function aSegundos_(d, ajuste) {
  return Math.round(
    (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(),
      d.getHours(), d.getMinutes(), d.getSeconds()) - EPOCA) / 1000
  ) + ajuste;
}

/** Número de serie de Sheets/Excel (46352.626748 = 2026-11-26 15:02:31) → segundos desde EPOCA. */
function segundosDeSerie_(n) {
  return Math.round((n - SERIE_1970) * 86400) - Math.round(EPOCA / 1000);
}

/**
 * Codifica una celda de fecha. null si está vacía o no se entiende.
 * Acepta Date, número de serie y texto:
 *   "2026-01-01 23:59:16" · "2026-01-01T23:59:16" · "01/01/2026 23:59:16" (día primero)
 * Los segundos son opcionales. Cualquier sufijo de zona ("Z", "-06:00") se
 * ignora: vale la hora tal como está escrita.
 */
function segundosDeCelda_(v, ajuste) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : aSegundos_(v, ajuste);
  if (typeof v === "number") return isFinite(v) && v > 0 ? segundosDeSerie_(v) : null;

  var s = String(v === null || v === undefined ? "" : v).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return segundosDeSerie_(parseFloat(s));

  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - EPOCA) / 1000);
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    return Math.round((Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - EPOCA) / 1000);
  }
  return null;
}

/** Punto de entrada del WebApp: sirve el caché, sin tocar la hoja. */
function doGet() {
  var txt = leerCache();
  if (txt === null) txt = regenerarCache();
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}

// ── Regenerar a pedido (n8n) ───────────────────────────────────────────────

/** Script Property con el secreto que debe mandar quien pide regenerar (n8n). */
var PROP_TOKEN = "REGENERAR_TOKEN";

/**
 * Regenera el caché a pedido: lo llama n8n al terminar de pegar los datos en la
 * hoja, para que la app vea lo nuevo sin esperar al disparador de 30 min.
 *
 *   POST <la misma URL /exec del WebApp>
 *   Content-Type: application/json
 *   {"token": "<valor de la Script Property REGENERAR_TOKEN>"}
 *
 * Sin token válido no hace nada (el WebApp es público: sin esto cualquiera con la
 * URL podría gastarte la cuota de ejecución). Responde SIEMPRE JSON con `ok`:
 * Apps Script devuelve HTTP 200 aunque falle, así que n8n debe revisar `ok`.
 *
 *   {"ok": true, "filas": 22947, "generado": "2026-11-27T16:05:08.000Z", "segundos": 9.4}
 *   {"ok": false, "error": "…"}
 */
function doPost(e) {
  var t0 = Date.now();
  try {
    var esperado = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN);
    if (!esperado) {
      return respuestaJson_({ ok: false, error: "falta la Script Property " + PROP_TOKEN + ": ejecuta crearTokenRegeneracion() en el editor" });
    }
    if (!mismoTexto_(tokenDe_(e), esperado)) {
      return respuestaJson_({ ok: false, error: "token inválido" });
    }
    regenerarCache();
    return respuestaJson_({
      ok: true,
      filas: ULTIMA_REGENERACION_.filas,
      generado: ULTIMA_REGENERACION_.generado,
      segundos: Math.round((Date.now() - t0) / 100) / 10,
    });
  } catch (err) {
    return respuestaJson_({ ok: false, error: String((err && err.message) || err) });
  }
}

/** El token puede venir en el cuerpo JSON ({"token": …}) o como parámetro de formulario. */
function tokenDe_(e) {
  if (!e) return "";
  if (e.parameter && e.parameter.token) return String(e.parameter.token);
  try {
    var cuerpo = JSON.parse((e.postData && e.postData.contents) || "{}");
    return String(cuerpo.token || "");
  } catch (x) {
    return "";
  }
}

/** Comparación que no se corta en la primera diferencia (no delata el token por tiempos). */
function mismoTexto_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var dif = 0;
  for (var i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

function respuestaJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Ejecútala UNA vez desde el editor: crea el token (si no existe) y lo muestra en
 * el registro para copiarlo en n8n. Para cambiarlo, borra la Script Property
 * REGENERAR_TOKEN y vuelve a ejecutarla (y actualiza n8n).
 */
function crearTokenRegeneracion() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty(PROP_TOKEN);
  if (!token) {
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
    props.setProperty(PROP_TOKEN, token);
    Logger.log("Token creado. Cópialo en el nodo HTTP Request de n8n:");
  } else {
    Logger.log("Ya existía un token (no se cambió):");
  }
  Logger.log(token);
}

// ── Caché en Drive (idéntico a roi-log.gs) ─────────────────────────────────

function leerCache() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_CACHE_ID);
  if (!id) return null;
  try {
    var file = DriveApp.getFileById(id);
    var edadMin = (Date.now() - file.getLastUpdated().getTime()) / 60000;
    if (edadMin > CACHE_MAX_MIN) return null;

    var txt = file.getBlob().getDataAsString();
    if (!txt || txt.charAt(0) !== "{" || txt.charAt(txt.length - 1) !== "}") {
      Logger.log("caché ilegible (" + txt.length + " bytes) — se regenera");
      return null;
    }
    return txt;
  } catch (e) {
    props.deleteProperty(PROP_CACHE_ID);
    return null;
  }
}

/** Filas y fecha de la última regeneración de esta ejecución (doPost las devuelve a n8n). */
var ULTIMA_REGENERACION_ = { filas: null, generado: null };

/**
 * Lee la hoja, arma el JSON COMPRIMIDO ({gz, generado}) y lo deja en Drive. Lo
 * llaman el disparador, n8n (doPost) y el doGet sin caché.
 *
 * Con candado: si n8n pide regenerar justo cuando corre el disparador, el segundo
 * espera a que termine el primero (y vuelve a leer la hoja, así refleja lo último)
 * en vez de escribir el archivo de Drive los dos a la vez.
 */
function regenerarCache() {
  var candado = LockService.getScriptLock();
  candado.waitLock(120000); // lanza error si en 2 min no se libera
  try {
    return regenerarCacheSinCandado_();
  } finally {
    candado.releaseLock();
  }
}

function regenerarCacheSinCandado_() {
  var hoja = leerHoja();

  // Cualquier motivo de "sin datos" (sin ID, sin pestaña, pestaña vacía) aborta y
  // se conserva el caché anterior: un caché vacío pisaría uno bueno pasando todas
  // las comprobaciones de integridad (el JSON vacío es válido).
  if (hoja.aviso && !hoja.filas.length) {
    throw new Error("ROI 008: no se regeneró el caché (se conserva el anterior) — " + hoja.aviso);
  }

  hoja.generado = new Date().toISOString();
  var json = JSON.stringify(hoja);

  var gz = Utilities.gzip(Utilities.newBlob(json, "application/json"));
  var txt = JSON.stringify({ gz: Utilities.base64Encode(gz.getBytes()), generado: hoja.generado });

  Logger.log("payload: " + json.length.toLocaleString() + " → " + txt.length.toLocaleString() +
    " bytes (" + (100 - (txt.length / json.length) * 100).toFixed(0) + "% menos)");
  guardarCache(txt);
  ULTIMA_REGENERACION_ = { filas: hoja.filas.length, generado: hoja.generado };
  return txt;
}

/** Escribe el caché y COMPRUEBA lo que quedó guardado (Drive llegó a dejar un archivo vacío en 003). */
function guardarCache(txt) {
  var props = PropertiesService.getScriptProperties();

  for (var intento = 1; intento <= 2; intento++) {
    var id = props.getProperty(PROP_CACHE_ID);
    var file = null;
    if (id) {
      try { file = DriveApp.getFileById(id); } catch (e) { file = null; }
    }

    var blob = Utilities.newBlob(txt, "application/json", CACHE_NOMBRE);
    if (file) {
      file.setContent(txt);
    } else {
      file = DriveApp.createFile(blob);
      props.setProperty(PROP_CACHE_ID, file.getId());
    }

    Utilities.sleep(1500);
    var guardado = DriveApp.getFileById(file.getId()).getBlob().getDataAsString();
    if (guardado.length === txt.length) return;

    Logger.log("aviso: el caché quedó en " + guardado.length + " de " + txt.length +
      " bytes (intento " + intento + "). Se rehace el archivo desde cero.");
    try { DriveApp.getFileById(file.getId()).setTrashed(true); } catch (e) { /* da igual */ }
    props.deleteProperty(PROP_CACHE_ID);
  }

  throw new Error("No se pudo guardar el caché completo en Drive (" + txt.length + " bytes).");
}

/** Instalación en un clic: crea el disparador por tiempo y llena el caché. Se puede reejecutar. */
function instalarDisparador() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "regenerarCache") ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger("regenerarCache").timeBased().everyMinutes(REFRESCO_MIN).create();

  var t0 = Date.now();
  var txt = regenerarCache();
  Logger.log("disparador cada " + REFRESCO_MIN + " min · caché de " + txt.length.toLocaleString() +
    " bytes (" + (txt.length / 1048576).toFixed(2) + " MB) armado en " +
    ((Date.now() - t0) / 1000).toFixed(1) + " s");
  Logger.log("verifica con medirDoGet()");
}

/** Diagnóstico: ¿qué tan rápido responde el doGet y qué trae el caché? */
function medirDoGet() {
  var t0 = Date.now();
  var txt = leerCache();
  var seg = (Date.now() - t0) / 1000;
  if (txt === null) {
    Logger.log("SIN CACHÉ ⚠ — el doGet tendría que leer la hoja entera. Ejecuta instalarDisparador().");
    return;
  }
  Logger.log("caché servido en " + seg.toFixed(2) + " s · " + txt.length.toLocaleString() + " bytes");
  try {
    var d = JSON.parse(txt);
    var plano = Utilities.ungzip(
      Utilities.newBlob(Utilities.base64Decode(d.gz), "application/x-gzip", "c.gz")).getDataAsString();
    var real = JSON.parse(plano);
    Logger.log("JSON válido ✓ · filas: " + real.filas.length + " · generado: " + d.generado);
  } catch (e) {
    Logger.log("JSON INVÁLIDO ✗ — " + e.message);
  }
}

/**
 * Devuelve la hoja CODIFICADA (mismo esquema que roi-log.gs):
 *
 *   { epoca, libres, textos, fechas, dicc: {col: [valores únicos]}, filas: [[...]] }
 *
 * Los nombres de columna viajan TAL COMO están en la hoja; solo la clasificación
 * (texto / fecha / libre) usa el nombre normalizado. Aquí no se calcula nada:
 * las reglas de negocio viven en src/lib/tiempos008.ts, donde están probadas.
 */
function leerHoja() {
  function vacio(motivo) {
    Logger.log("leerHoja: SIN DATOS — " + motivo);
    return { epoca: EPOCA, libres: [], textos: [], fechas: [], dicc: {}, filas: [], aviso: motivo };
  }

  var id = PropertiesService.getScriptProperties().getProperty("ROI_SHEET_ID");
  if (!id) return vacio("falta la Script Property ROI_SHEET_ID");

  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName(SHEET_TAB);
  if (!sh) {
    return vacio('no existe la pestaña "' + SHEET_TAB + '" en "' + ss.getName() +
      '". Pestañas disponibles: ' + nombresDePestanas_(ss).join(" · ") +
      '. Si la renombraste, actualiza SHEET_TAB arriba.');
  }

  var last = sh.getLastRow();
  var ancho = sh.getLastColumn();
  if (last < 1 || ancho < 1) return vacio('la pestaña "' + SHEET_TAB + '" está vacía');

  var headers = sh.getRange(1, 1, 1, ancho).getValues()[0];
  var datos = last >= 2 ? sh.getRange(2, 1, last - 1, ancho).getValues() : [];
  var ajuste = ajusteZona_(ss);

  var libres = [], textos = [], fechas = [];
  var posicion = {};
  for (var h = 0; h < headers.length; h++) {
    var nombre = String(headers[h]).trim();
    if (!nombre) continue; // columnas sin encabezado no viajan
    posicion[nombre] = h;
    var norm = normalizar_(nombre);
    if (COLS_FECHA.indexOf(norm) >= 0) fechas.push(nombre);
    else if (COLS_TEXTO.indexOf(norm) >= 0) textos.push(nombre);
    else libres.push(nombre);
  }

  var dicc = {}, indice = {};
  for (var t = 0; t < textos.length; t++) { dicc[textos[t]] = []; indice[textos[t]] = {}; }

  var filas = [];
  for (var i = 0; i < datos.length; i++) {
    var r = datos[i];
    var fila = [];
    var vacia = true;

    for (var a = 0; a < libres.length; a++) {
      var vl = r[posicion[libres[a]]];
      if (vl instanceof Date) vl = aSegundos_(vl, ajuste);
      if (vl !== "" && vl !== null) vacia = false;
      fila.push(vl);
    }

    for (var b = 0; b < textos.length; b++) {
      var col = textos[b];
      var vt = String(r[posicion[col]] === null ? "" : r[posicion[col]]);
      if (vt !== "") vacia = false;
      var clave = "$" + vt;
      var k = indice[col][clave];
      if (k === undefined) { k = dicc[col].length; dicc[col].push(vt); indice[col][clave] = k; }
      fila.push(k);
    }

    for (var c = 0; c < fechas.length; c++) {
      var sf = segundosDeCelda_(r[posicion[fechas[c]]], ajuste);
      if (sf !== null) vacia = false;
      fila.push(sf);
    }

    if (!vacia) filas.push(fila);
  }

  return { epoca: EPOCA, libres: libres, textos: textos, fechas: fechas, dicc: dicc, filas: filas };
}

function nombresDePestanas_(ss) {
  var hojas = ss.getSheets();
  var out = [];
  for (var i = 0; i < hojas.length; i++) out.push('"' + hojas[i].getName() + '"');
  return out;
}

/**
 * Diagnóstico de SOLO LECTURA: a qué hoja apunta ROI_SHEET_ID, qué pestañas
 * tiene, si existe la "008", sus encabezados y cuántas fechas de cada columna
 * se entienden. Un 0% en una columna de fecha = su formato en la hoja cambió.
 */
function diagnosticarHoja() {
  var id = PropertiesService.getScriptProperties().getProperty("ROI_SHEET_ID");
  Logger.log("SHEET_TAB configurado : " + SHEET_TAB);
  Logger.log("ROI_SHEET_ID          : " + (id || "✗ NO CONFIGURADO"));
  if (!id) return;

  var ss = SpreadsheetApp.openById(id);
  Logger.log("Hoja                  : " + ss.getName());
  Logger.log("Pestañas              : " + nombresDePestanas_(ss).join(" · "));
  Logger.log("Zona de la hoja       : " + ss.getSpreadsheetTimeZone() + " · del proyecto: " + Session.getScriptTimeZone());
  var sh = ss.getSheetByName(SHEET_TAB);
  if (!sh) { Logger.log('✗ NO existe la pestaña "' + SHEET_TAB + '".'); return; }
  Logger.log("Encabezados (fila 1)  : " + sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].join(" | "));

  var hoja = leerHoja();
  Logger.log("Filas de datos        : " + hoja.filas.length);
  var base = hoja.libres.length + hoja.textos.length;
  for (var f = 0; f < hoja.fechas.length; f++) {
    var con = 0;
    for (var j = 0; j < hoja.filas.length; j++) if (hoja.filas[j][base + f] !== null) con++;
    var pct = hoja.filas.length ? (con / hoja.filas.length) * 100 : 0;
    Logger.log("  " + (pct === 0 ? "⚠ " : "  ") + hoja.fechas[f] + ": " + con + " (" + pct.toFixed(1) + "%)");
  }
}

/** Diagnóstico: la lectura del número de serie y del texto da la hora exacta. */
function verificarFechas() {
  var p2 = function (n) { return n < 10 ? "0" + n : "" + n; };
  var fmt = function (seg) {
    var u = new Date(EPOCA + seg * 1000);
    return u.getUTCFullYear() + "-" + p2(u.getUTCMonth() + 1) + "-" + p2(u.getUTCDate()) +
      " " + p2(u.getUTCHours()) + ":" + p2(u.getUTCMinutes()) + ":" + p2(u.getUTCSeconds());
  };
  var casos = [
    [46352.626748, "2026-11-26 15:02:31"],
    ["2026-01-01 23:59:16", "2026-01-01 23:59:16"],
    ["12/02/2026 10:23:27", "2026-02-12 10:23:27"],
  ];
  for (var i = 0; i < casos.length; i++) {
    var r = fmt(segundosDeCelda_(casos[i][0], 0));
    Logger.log((r === casos[i][1] ? "✓ " : "✗ ") + casos[i][0] + " → " + r);
  }
}
