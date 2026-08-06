/**
 * ROI Log — PMO Control Tower
 * ---------------------------------------------------------------------------
 * Expone en SOLO LECTURA (doGet) la pestaña "003" de la hoja ROI para que la app
 * la muestre en la página "ROI". Los encabezados se leen de la fila 1, así que
 * las columnas nuevas fluyen solas sin tocar este archivo.
 *
 * Requiere Script Properties: ROI_SHEET_ID (ID del Google Sheet — de la URL
 * .../spreadsheets/d/<ESTE_ID>/edit).
 * Proyecto → Configuración (⚙️) → Propiedades del script.
 *
 * RENDIMIENTO — por qué el formato de fechas es JavaScript puro
 * ---------------------------------------------------------------------------
 * Apps Script corta cualquier ejecución a los 6 minutos. La versión anterior
 * llamaba a Utilities.formatDate() y Session.getScriptTimeZone() una vez por
 * celda de fecha; con ~59 mil filas y 6 columnas de fecha son ~700 mil llamadas
 * a servicios, cada una cruzando el puente JS↔Java, y la hoja creció hasta
 * rebasar ese límite (devolvía la página HTML "Excedió el tiempo máximo de
 * ejecución" en vez de JSON).
 *
 * En el runtime V8 la zona horaria por defecto ES la del proyecto, así que
 * d.getFullYear()/getMonth()/... ya devuelven la hora local correcta y se puede
 * armar "yyyy-MM-ddTHH:mm:ss" con getters puros — sin salir de JavaScript.
 * Si cambias la zona del proyecto (Configuración → Zona horaria), esto la sigue
 * automáticamente. Verifica con verificarFechas() de abajo.
 *
 * FIABILIDAD — por qué el doGet sirve un archivo y no lee la hoja
 * ---------------------------------------------------------------------------
 * El /exec no entrega el contenido: redirige a script.googleusercontent.com y
 * ESE endpoint devuelve 404 cada tantas peticiones. Midiéndolo salió una
 * correlación limpia: las peticiones que responden en ~12 s funcionan y las que
 * pasan de ~20 s fallan siempre (éxitos a 10.5 y 14.2 s; fallos a 21, 29, 42,
 * 43, 45 y 79 s). Cuanto más tarda la ejecución, más probable es el 404.
 *
 * Leer 59 mil filas × 15 columnas cuesta ~12 s y no se puede acelerar mucho más.
 * Así que el doGet ya no las lee: un disparador por tiempo deja el JSON armado
 * en un archivo de Drive y el doGet solo lo devuelve, en ~1 s. Menos tiempo de
 * ejecución, menos 404 — y de paso deja de importar cuánto crezca la hoja.
 *
 * INSTALACIÓN DEL CACHÉ: ejecuta instalarDisparador() una vez desde el editor.
 * Requiere autorizar el acceso a Drive (el script crea y actualiza un archivo).
 * ---------------------------------------------------------------------------
 */

var SHEET_TAB = "003"; // nombre de la pestaña a leer — actualizar aquí si cambia.

var PROP_CACHE_ID = "ROI_CACHE_FILE_ID";  // lo escribe el script, no lo pongas a mano
var CACHE_NOMBRE = "roi-003-cache.json";
var CACHE_MAX_MIN = 180;                  // más viejo que esto, el doGet lo rehace
var REFRESCO_MIN = 30;                    // cada cuánto corre el disparador

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
 *
 * OJO: no todas las columnas de fecha son fechas de verdad. En la hoja actual,
 * Creado / DPR / Revision_Analista vienen como Date, pero Clasificacion_exacta,
 * Creacion_Pre_DUCA y Solicitar_firma_def están guardadas como TEXTO
 * ("2025-01-28 09:33:21"). Si esta función solo aceptara Date, esas tres
 * columnas llegarían vacías a la app y las etapas T2..T5 saldrían en cero —
 * pasó exactamente eso. Por eso también se parsea la forma de texto.
 */
function segundosDeCelda(v) {
  if (v instanceof Date) return aSegundos(v);

  var s = String(v === null || v === undefined ? "" : v).trim();
  if (!s) return null;

  // "yyyy-MM-dd HH:mm:ss" o "yyyy-MM-ddTHH:mm:ss" (los segundos son opcionales).
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;

  return Math.round(
    (Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - EPOCA) / 1000
  );
}

/** Punto de entrada del WebApp: sirve el caché, sin tocar la hoja. */
function doGet() {
  var txt = leerCache();
  // Sin caché útil (primera vez, archivo borrado o demasiado viejo) se arma al
  // vuelo: la respuesta tarda más y puede toparse con el 404, pero nunca se
  // devuelve nada vacío.
  if (txt === null) txt = regenerarCache();
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}

// ── Caché en Drive ─────────────────────────────────────────────────────────

/**
 * Contenido del caché si existe, está fresco y NO está truncado; null si hay que
 * rehacerlo. Lo último importa: un archivo vacío se sirvió una vez como "" y la
 * app murió con «Unexpected end of JSON input». Mejor regenerar que servir eso.
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
    // Barato y suficiente: el payload siempre abre con { y cierra con }.
    if (!txt || txt.charAt(0) !== "{" || txt.charAt(txt.length - 1) !== "}") {
      Logger.log("caché ilegible (" + txt.length + " bytes) — se regenera");
      return null;
    }
    return txt;
  } catch (e) {
    // Archivo borrado o sin permiso: se limpia la referencia y se rehace.
    props.deleteProperty(PROP_CACHE_ID);
    return null;
  }
}

/**
 * Lee la hoja, arma el JSON COMPRIMIDO y lo deja en Drive. Lo llama el disparador.
 *
 * Por qué comprimido: con el caché el doGet ya responde en menos de 1 s, pero
 * mover 5 MB por la redirección de script.googleusercontent.com seguía fallando
 * 4 de cada 10 veces. Gzip + base64 lo baja a 1.63 MB (67% menos) y el envío se
 * vuelve mucho más corto, que es lo que correlaciona con el 404.
 *
 * Se envuelve en JSON ({gz, generado}) en vez de mandar el base64 pelado: así el
 * doGet sigue sirviendo JSON válido y la comprobación de integridad del caché
 * (abre con { y cierra con }) sigue valiendo.
 */
function regenerarCache() {
  var hoja = leerHoja();
  hoja.generado = new Date().toISOString(); // la app lo muestra como antigüedad
  var json = JSON.stringify(hoja);

  var gz = Utilities.gzip(Utilities.newBlob(json, "application/json"));
  var txt = JSON.stringify({ gz: Utilities.base64Encode(gz.getBytes()), generado: hoja.generado });

  Logger.log("payload: " + json.length.toLocaleString() + " → " + txt.length.toLocaleString() +
    " bytes (" + (100 - (txt.length / json.length) * 100).toFixed(0) + "% menos)");
  guardarCache(txt);
  return txt;
}

/**
 * Escribe el caché y COMPRUEBA lo que quedó guardado.
 *
 * Drive aceptó una vez un setContent() de 5 MB y dejó el archivo vacío, sin
 * lanzar ningún error: el doGet servía "" y la app moría con «Unexpected end of
 * JSON input». Un guardado que falla en silencio es peor que uno que falla, así
 * que aquí se relee y se compara; si no coincide, se rehace desde cero y si aun
 * así no cuadra, se lanza el error en vez de dejar basura servida.
 */
function guardarCache(txt) {
  var props = PropertiesService.getScriptProperties();

  for (var intento = 1; intento <= 2; intento++) {
    var id = props.getProperty(PROP_CACHE_ID);
    var file = null;
    if (id) {
      try { file = DriveApp.getFileById(id); } catch (e) { file = null; }
    }

    // Blob explícito: deja la codificación y el mime fuera de dudas.
    var blob = Utilities.newBlob(txt, "application/json", CACHE_NOMBRE);
    if (file) {
      file.setContent(txt);
    } else {
      file = DriveApp.createFile(blob);
      props.setProperty(PROP_CACHE_ID, file.getId());
    }

    // Releer de verdad, no confiar en el objeto que ya tenemos en memoria.
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
    // Sin throw: el diagnóstico tiene que reportar el problema, no morirse con él.
    Logger.log("JSON INVÁLIDO ✗ — " + e.message + ". Ejecuta diagnosticarCache().");
  }
}

/** Columnas cuyo valor se repite mucho → van por diccionario. */
var COLS_TEXTO = ["Proceso", "Cliente", "Usuario", "Analista", "Embarque", "Documento", "Mesa", "Docalpha"];
/** Columnas de fecha → van como segundos desde EPOCA. */
var COLS_FECHA = ["Creado", "DPR", "Clasificacion_exacta", "Creacion_Pre_DUCA", "Revision_Analista", "Solicitar_firma_def"];

/**
 * Devuelve la hoja CODIFICADA, no las filas crudas:
 *
 *   { epoca, libres, textos, fechas, dicc: {col: [valores únicos]}, filas: [[...]] }
 *
 * Cada fila es un arreglo posicional: primero las columnas de texto libre tal
 * cual, luego un índice al diccionario por cada columna de texto repetido, luego
 * los segundos de cada fecha (null si el hito no ocurrió).
 *
 * Por qué: las 8 columnas de texto repetido tienen 695 valores únicos entre
 * todas, pero se repetían ~59 mil veces cada una. El diccionario más las fechas
 * numéricas bajan el payload de 27.6 MB a 5.0 MB (1.2 MB comprimido) sin perder
 * un solo dato — la app reconstruye las filas idénticas al recibirlas.
 *
 * Esto es SOLO codificación de transporte: aquí no se agrupa, ni se deduplica,
 * ni se calcula nada. Todas las reglas de negocio viven en src/lib/tramites.ts,
 * donde están probadas.
 */
function leerHoja() {
  var vacio = { epoca: EPOCA, libres: [], textos: [], fechas: [], dicc: {}, filas: [] };

  var id = PropertiesService.getScriptProperties().getProperty("ROI_SHEET_ID");
  if (!id) return vacio;

  var sh = SpreadsheetApp.openById(id).getSheetByName(SHEET_TAB);
  if (!sh) return vacio;

  var last = sh.getLastRow();
  var ancho = sh.getLastColumn();
  if (last < 2 || ancho < 1) return vacio;

  // Dos únicas llamadas al servicio de hojas: encabezados y bloque de datos.
  var headers = sh.getRange(1, 1, 1, ancho).getValues()[0];
  var datos = sh.getRange(2, 1, last - 1, ancho).getValues();

  // Clasifica cada encabezado real de la hoja. Los que no reconocemos viajan
  // como texto libre, así una columna nueva sigue llegando sola a la app.
  var libres = [], textos = [], fechas = [];
  var posicion = {};
  for (var h = 0; h < headers.length; h++) {
    var nombre = String(headers[h]);
    posicion[nombre] = h;
    if (COLS_FECHA.indexOf(nombre) >= 0) fechas.push(nombre);
    else if (COLS_TEXTO.indexOf(nombre) >= 0) textos.push(nombre);
    else libres.push(nombre);
  }

  // Un diccionario por columna de texto repetido.
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
      // Clave con prefijo: evita chocar con propiedades heredadas de Object.
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

  // Cobertura por columna de fecha. Un 0% aquí significa que la columna no se
  // está codificando — es el síntoma de que su formato en la hoja cambió.
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
