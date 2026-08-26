/**
 * ROI Clonación de Files — PMO Control Tower
 * ---------------------------------------------------------------------------
 * Expone en SOLO LECTURA (doGet) la pestaña "clonacion" del archivo de Google
 * Sheets "Clonacion files" (un archivo DISTINTO al de la hoja ROI de 003) para
 * que la app la muestre en la pestaña "Clonación de Files" de la página ROI.
 * Los encabezados se leen de la fila 1, así que las columnas nuevas fluyen
 * solas sin tocar este archivo.
 *
 * Fuente INDEPENDIENTE de 003 (roi-log.gs): su propio archivo de origen, su
 * propio doGet, su propia variable de entorno (ROI_CLONACION_WEBAPP_URL), su
 * propio caché en Drive. No comparte código con roi-log.gs a propósito — así
 * un cambio en uno no puede romper al otro.
 *
 * Requiere Script Properties: CLONACION_SHEET_ID (el ID del archivo "Clonacion
 * files" — de su URL: .../spreadsheets/d/<ESTE_ID>/edit — NO es el mismo ID
 * que ROI_SHEET_ID de 003, son archivos distintos).
 * Proyecto → Configuración (⚙️) → Propiedades del script.
 *
 * Todas las reglas de negocio (tiempo hábil, costo, anómalos) viven en la app,
 * en src/lib/clonaciones.ts — este script SOLO codifica para transporte, igual
 * que roi-log.gs con 003. No agrupa, no deduplica, no calcula nada: una fila
 * de la pestaña es una clonación, y así llega a la app.
 * ---------------------------------------------------------------------------
 */

var SHEET_TAB = "clonacion"; // nombre de la pestaña a leer — actualizar aquí si cambia.

var PROP_CACHE_ID = "ROI_CLONACION_CACHE_FILE_ID"; // lo escribe el script, no lo pongas a mano
var CACHE_NOMBRE = "roi-clonacion-cache.json";
var CACHE_MAX_MIN = 180;                           // más viejo que esto, el doGet lo rehace
var REFRESCO_MIN = 30;                             // cada cuánto corre el disparador

/**
 * Época de referencia para las fechas. Los hitos se mandan como SEGUNDOS desde
 * aquí en vez de como texto ISO: 8 dígitos en lugar de 19 caracteres.
 *
 * Ojo con la zona horaria: se empaquetan los componentes LOCALES (getFullYear,
 * getHours…) dentro de un Date.UTC. El número resultante no es un instante real,
 * es la hora de pared codificada — y el decodificador la desempaqueta con
 * getUTC* para recuperarla exacta. Así el valor no depende de la zona de nadie.
 */
var EPOCA = Date.UTC(2024, 0, 1);

function aSegundos(d) {
  return Math.round(
    (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(),
      d.getHours(), d.getMinutes(), d.getSeconds()) - EPOCA) / 1000
  );
}

/**
 * Codifica una celda de fecha. Devuelve null si el hito no ocurrió.
 * Acepta tanto Date reales como texto "yyyy-MM-dd HH:mm:ss" — algunas hojas de
 * origen traen la fecha como texto pegado en vez de como Date real.
 */
function segundosDeCelda(v) {
  if (v instanceof Date) return aSegundos(v);

  var s = String(v === null || v === undefined ? "" : v).trim();
  if (!s) return null;

  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;

  return Math.round(
    (Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - EPOCA) / 1000
  );
}

/** Punto de entrada del WebApp: sirve el caché, sin tocar la hoja. */
function doGet() {
  var txt = leerCache();
  if (txt === null) txt = regenerarCache();
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}

// ── Caché en Drive ─────────────────────────────────────────────────────────

/**
 * Contenido del caché si existe, está fresco y NO está truncado; null si hay que
 * rehacerlo. Un archivo vacío nunca se sirve: mejor regenerar que servir eso.
 */
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

/**
 * Lee la hoja, arma el JSON COMPRIMIDO y lo deja en Drive. Lo llama el disparador.
 * Mismo esquema que roi-log.gs: {gz: base64(gzip(json)), generado}.
 */
function regenerarCache() {
  var hoja = leerHoja();

  // Un caché vacío por error de configuración pisa uno bueno y deja la app sin
  // datos. Cuando no encontramos ni la hoja ni la pestaña se aborta y se
  // conserva el caché anterior; una pestaña realmente sin filas sí se guarda.
  if (hoja.aviso && !hoja.filas.length && /CLONACION_SHEET_ID|no existe la pestaña/.test(hoja.aviso)) {
    throw new Error("ROI Clonación: no se regeneró el caché (se conserva el anterior) — " + hoja.aviso);
  }

  hoja.generado = new Date().toISOString();
  var json = JSON.stringify(hoja);

  var gz = Utilities.gzip(Utilities.newBlob(json, "application/json"));
  var txt = JSON.stringify({ gz: Utilities.base64Encode(gz.getBytes()), generado: hoja.generado });

  Logger.log("payload: " + json.length.toLocaleString() + " → " + txt.length.toLocaleString() +
    " bytes (" + (100 - (txt.length / json.length) * 100).toFixed(0) + "% menos)");
  guardarCache(txt);
  return txt;
}

/**
 * Escribe el caché y COMPRUEBA lo que quedó guardado (Drive puede vaciar un
 * setContent() grande sin avisar). Si no coincide, se rehace desde cero.
 */
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

    Utilities.sleep(1500); // Drive necesita un momento para consolidar el archivo
    var guardado = DriveApp.getFileById(file.getId()).getBlob().getDataAsString();
    if (guardado.length === txt.length) return;

    Logger.log("aviso: el caché quedó en " + guardado.length + " de " + txt.length +
      " bytes (intento " + intento + "). Se rehace el archivo desde cero.");
    try { DriveApp.getFileById(file.getId()).setTrashed(true); } catch (e) { /* da igual */ }
    props.deleteProperty(PROP_CACHE_ID);
  }

  throw new Error(
    "No se pudo guardar el caché completo en Drive (" + txt.length + " bytes). " +
    "Ejecuta diagnosticarCache() para ver el detalle.");
}

/** Diagnóstico: qué hay realmente en el archivo de caché. */
function diagnosticarCache() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_CACHE_ID);
  if (!id) { Logger.log("Sin " + PROP_CACHE_ID + " — nunca se creó el caché."); return; }

  var file;
  try { file = DriveApp.getFileById(id); }
  catch (e) { Logger.log("El archivo " + id + " no existe o no es accesible: " + e.message); return; }

  var txt = file.getBlob().getDataAsString();
  Logger.log("archivo: " + file.getName() + " (" + id + ")");
  Logger.log("tamaño segun Drive: " + file.getSize() + " bytes");
  Logger.log("tamaño al leerlo:   " + txt.length + " bytes");
  Logger.log("actualizado: " + file.getLastUpdated());
  Logger.log("empieza con: " + JSON.stringify(txt.slice(0, 80)));
  Logger.log("termina con: " + JSON.stringify(txt.slice(-40)));
  try {
    var d = JSON.parse(txt);
    if (d.gz) {
      var json = Utilities.newBlob(Utilities.base64Decode(d.gz), "application/x-gzip", "c.gz");
      var plano = Utilities.ungzip(json).getDataAsString();
      var real = JSON.parse(plano);
      Logger.log("JSON válido ✓ comprimido · " + plano.length.toLocaleString() + " bytes al descomprimir · filas: " +
        real.filas.length + " · generado: " + d.generado);
    } else {
      Logger.log("JSON válido ✓ sin comprimir · filas: " + d.filas.length + " · generado: " + d.generado);
    }
  } catch (e) {
    Logger.log("JSON INVÁLIDO ✗ — " + e.message);
  }
}

/**
 * Instalación en un clic: crea el disparador por tiempo y llena el caché.
 * Se puede reejecutar sin miedo — primero borra el disparador anterior.
 */
function instalarDisparador() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "regenerarCache") ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger("regenerarCache").timeBased().everyMinutes(REFRESCO_MIN).create();

  var t0 = Date.now();
  var txt = regenerarCache(); // lanza error si el guardado no queda completo
  Logger.log("disparador cada " + REFRESCO_MIN + " min · caché de " + txt.length.toLocaleString() +
    " bytes (" + (txt.length / 1048576).toFixed(2) + " MB) armado en " +
    ((Date.now() - t0) / 1000).toFixed(1) + " s");
  Logger.log("archivo: " + PropertiesService.getScriptProperties().getProperty(PROP_CACHE_ID));
  Logger.log("verifica con medirDoGet()");
}

/** Diagnóstico: ¿qué tan rápido responde el doGet ahora? */
function medirDoGet() {
  var t0 = Date.now();
  var txt = leerCache();
  var seg = (Date.now() - t0) / 1000;
  if (txt === null) {
    Logger.log("SIN CACHÉ ⚠ — el doGet tendría que leer la hoja entera. Ejecuta instalarDisparador().");
    return;
  }
  var edad = (Date.now() - DriveApp.getFileById(
    PropertiesService.getScriptProperties().getProperty(PROP_CACHE_ID)).getLastUpdated().getTime()) / 60000;
  Logger.log("caché servido en " + seg.toFixed(2) + " s · " + txt.length.toLocaleString() +
    " bytes (" + (txt.length / 1048576).toFixed(2) + " MB) · generado hace " + edad.toFixed(0) + " min");
  try {
    var d = JSON.parse(txt);
    if (d.gz) {
      var plano = Utilities.ungzip(
        Utilities.newBlob(Utilities.base64Decode(d.gz), "application/x-gzip", "c.gz")).getDataAsString();
      Logger.log("JSON válido ✓ comprimido · filas: " + JSON.parse(plano).filas.length +
        " · generado: " + d.generado);
    } else {
      Logger.log("JSON válido ✓ · filas: " + d.filas.length + " · generado: " + d.generado);
    }
  } catch (e) {
    Logger.log("JSON INVÁLIDO ✗ — " + e.message + ". Ejecuta diagnosticarCache().");
  }
}

/** Columnas cuyo valor se repite mucho → van por diccionario. */
var COLS_TEXTO = ["c807_file", "Usuario", "Cliente"];
/** Columnas de fecha → van como segundos desde EPOCA. "Fecha" no se usa en la
 *  app, pero se codifica igual para no dejar una celda Date sin convertir. */
var COLS_FECHA = ["Solicitud_fecha", "Creacion_Fecha", "Fecha"];

/**
 * Devuelve la hoja CODIFICADA, no las filas crudas:
 *
 *   { epoca, libres, textos, fechas, dicc: {col: [valores únicos]}, filas: [[...]] }
 *
 * Cada fila es un arreglo posicional: primero las columnas de texto libre tal
 * cual, luego un índice al diccionario por cada columna de texto repetido, luego
 * los segundos de cada fecha (null si el hito no ocurrió).
 *
 * Una fila = una clonación. Un mismo c807_file puede repetirse: no se
 * deduplica ni se agrupa aquí — eso es del dominio de la app.
 */
function leerHoja() {
  function vacio(motivo) {
    Logger.log("leerHoja: SIN DATOS — " + motivo);
    return { epoca: EPOCA, libres: [], textos: [], fechas: [], dicc: {}, filas: [], aviso: motivo };
  }

  var id = PropertiesService.getScriptProperties().getProperty("CLONACION_SHEET_ID");
  if (!id) return vacio("falta la Script Property CLONACION_SHEET_ID");

  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName(SHEET_TAB);
  if (!sh) {
    return vacio('no existe la pestaña "' + SHEET_TAB + '" en "' + ss.getName() +
      '". Pestañas disponibles: ' + nombresDePestanas_(ss).join(" · ") +
      '. Si la renombraste, actualiza SHEET_TAB arriba.');
  }

  var last = sh.getLastRow();
  var ancho = sh.getLastColumn();
  if (last < 2 || ancho < 1) {
    return vacio('la pestaña "' + SHEET_TAB + '" no tiene filas de datos ' +
      '(última fila ' + last + ', última columna ' + ancho + ')');
  }

  var headers = sh.getRange(1, 1, 1, ancho).getValues()[0];
  var datos = sh.getRange(2, 1, last - 1, ancho).getValues();

  var libres = [], textos = [], fechas = [];
  var posicion = {};
  for (var h = 0; h < headers.length; h++) {
    var nombre = String(headers[h]);
    posicion[nombre] = h;
    if (COLS_FECHA.indexOf(nombre) >= 0) fechas.push(nombre);
    else if (COLS_TEXTO.indexOf(nombre) >= 0) textos.push(nombre);
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
      if (vl instanceof Date) vl = aSegundos(vl);
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
      var sf = segundosDeCelda(r[posicion[fechas[c]]]);
      if (sf !== null) vacia = false;
      fila.push(sf);
    }

    if (!vacia) filas.push(fila); // salta filas completamente vacías
  }

  return { epoca: EPOCA, libres: libres, textos: textos, fechas: fechas, dicc: dicc, filas: filas };
}

/** Nombres de todas las pestañas de un spreadsheet. */
function nombresDePestanas_(ss) {
  var hojas = ss.getSheets();
  var out = [];
  for (var i = 0; i < hojas.length; i++) out.push('"' + hojas[i].getName() + '"');
  return out;
}

/**
 * Diagnóstico — ejecútalo desde el editor y mira el registro.
 * Responde "¿por qué la app no muestra datos?": si el CLONACION_SHEET_ID está puesto,
 * a qué hoja apunta, qué pestañas tiene, si existe la que buscamos (SHEET_TAB)
 * y cuántas filas trae. Es de SOLO LECTURA: no toca el caché.
 */
function diagnosticarHoja() {
  var id = PropertiesService.getScriptProperties().getProperty("CLONACION_SHEET_ID");
  Logger.log("SHEET_TAB configurado : " + SHEET_TAB);
  Logger.log("CLONACION_SHEET_ID    : " + (id || "✗ NO CONFIGURADO"));
  if (!id) { Logger.log("→ Ponlo en Configuración (⚙️) → Propiedades del script."); return; }

  var ss;
  try {
    ss = SpreadsheetApp.openById(id);
  } catch (e) {
    Logger.log("✗ No se pudo abrir esa hoja: " + e.message);
    Logger.log("→ El ID es incorrecto o la cuenta del script no tiene acceso.");
    return;
  }

  Logger.log("Hoja                  : " + ss.getName());
  Logger.log("Pestañas              : " + nombresDePestanas_(ss).join(" · "));

  var sh = ss.getSheetByName(SHEET_TAB);
  if (!sh) {
    Logger.log('✗ NO existe la pestaña "' + SHEET_TAB + '".');
    Logger.log("→ Esta es la causa: renombra la pestaña, o actualiza SHEET_TAB arriba del script.");
    return;
  }

  var last = sh.getLastRow(), ancho = sh.getLastColumn();
  Logger.log('Pestaña "' + SHEET_TAB + '"      : ✓ existe · ' + last + " filas × " + ancho + " columnas");
  if (last < 2 || ancho < 1) {
    Logger.log("✗ Sin filas de datos (se necesita al menos la fila 1 de encabezados + 1 fila).");
    return;
  }
  Logger.log("Encabezados (fila 1)  : " + sh.getRange(1, 1, 1, ancho).getValues()[0].join(" | "));
  Logger.log("Filas de datos        : " + (last - 1));
  Logger.log("✓ La hoja se lee bien. Si la app sigue vacía, el caché está viejo:");
  Logger.log("  ejecuta regenerarCache() y luego medirDoGet().");
}

/**
 * Diagnóstico — ejecútalo desde el editor y mira el registro.
 * Confirma que el doGet cabe en los 6 minutos y con cuánto margen.
 */
function medirTiempo() {
  var t0 = Date.now();
  var hoja = leerHoja();
  Logger.log("filas: " + hoja.filas.length + " · lectura: " + ((Date.now() - t0) / 1000).toFixed(1) + " s");

  var t1 = Date.now();
  var bytes = JSON.stringify(hoja).length;
  Logger.log("JSON: " + (bytes / 1048576).toFixed(1) + " MB · serializar: " +
    ((Date.now() - t1) / 1000).toFixed(1) + " s");

  var uni = 0;
  for (var i = 0; i < hoja.textos.length; i++) uni += hoja.dicc[hoja.textos[i]].length;
  Logger.log("diccionarios: " + uni + " valores únicos en " + hoja.textos.length + " columnas");
  if (hoja.libres.length) Logger.log("columnas sin clasificar (van como texto libre): " + hoja.libres.join(", "));

  var base = hoja.libres.length + hoja.textos.length;
  for (var f = 0; f < hoja.fechas.length; f++) {
    var con = 0;
    for (var j = 0; j < hoja.filas.length; j++) if (hoja.filas[j][base + f] !== null) con++;
    var pct = hoja.filas.length ? (con / hoja.filas.length) * 100 : 0;
    Logger.log("  " + (pct === 0 ? "⚠ " : "  ") + hoja.fechas[f] + ": " + con + " (" + pct.toFixed(1) + "%)");
  }

  Logger.log("TOTAL: " + ((Date.now() - t0) / 1000).toFixed(1) + " s de los 360 s permitidos");
}

/**
 * Diagnóstico — confirma que la codificación de fechas da la vuelta exacta.
 * Compara contra Utilities.formatDate, que es la referencia del servicio.
 */
function verificarFechas() {
  var casos = [new Date(2026, 0, 5, 14, 30, 45), new Date(2025, 6, 1, 0, 0, 0), new Date(2024, 11, 31, 23, 59, 59)];
  for (var i = 0; i < casos.length; i++) {
    var d = casos[i];
    var u = new Date(EPOCA + aSegundos(d) * 1000);
    var p2 = function (n) { return n < 10 ? "0" + n : "" + n; };
    var vuelta = u.getUTCFullYear() + "-" + p2(u.getUTCMonth() + 1) + "-" + p2(u.getUTCDate()) +
      "T" + p2(u.getUTCHours()) + ":" + p2(u.getUTCMinutes()) + ":" + p2(u.getUTCSeconds());
    var esperado = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
    Logger.log((vuelta === esperado ? "✓ " : "✗ ") + esperado + "  →  " + vuelta);
  }
}
