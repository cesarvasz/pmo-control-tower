/**
 * Recordatorios "Sin Valor Def" — PMO Control Tower
 * ---------------------------------------------------------------------------
 * Envía hasta 4 correos (uno cada 10 días hábiles) a las iniciativas que:
 *   - están en status "Sin Valor Def", y
 *   - tienen la casilla PKU SIN marcar.
 * El correo va al email de la columna "CKU Mail".
 *
 * Cadencia:
 *   - Correo 1: 10 días hábiles después de la fecha de "En Espera".
 *   - Correo 2/3/4: 10 días hábiles después del correo anterior,
 *     solo si sigue en "Sin Valor Def" y PKU sin marcar. Máximo 4.
 *
 * Disparo: trigger diario ~7:30am (ver crearTriggerDiario).
 * Registro: hoja de cálculo "Envios" (se crea sola la primera vez).
 *
 * Requiere Script Properties: MONDAY_API_KEY, MONDAY_INI_BOARD_ID
 * (Proyecto → Configuración → Propiedades del script).
 * ---------------------------------------------------------------------------
 */

// ── Configuración ───────────────────────────────────────────────────────────
var MONDAY_URL   = "https://api.monday.com/v2";
var DIAS_HABILES = 10;    // intervalo entre correos (días hábiles, sin fines de semana)
var MAX_CORREOS  = 4;     // tope de correos por iniciativa
var DRY_RUN      = true;  // true = simula (no envía ni registra), solo escribe en el log.
                          // Ponlo en false cuando quieras que envíe de verdad.

// ── Remitente / firma (el correo debe salir a nombre del manager) ───────────
// ✔ CAMINO ELEGIDO: A — el MANAGER instala/ejecuta el script, así que los correos
//   salen desde su propia cuenta. Deja REMITENTE_ALIAS y REMITENTE_NOMBRE vacíos
//   (Gmail usa el correo y el nombre de la cuenta del manager automáticamente).
//   El Camino B (cuenta compartida + alias "Enviar como") queda documentado en el README.
var REMITENTE_ALIAS  = "";  // (Camino A) dejar vacío. Solo para Camino B: alias verificado del manager.
var REMITENTE_NOMBRE = "";  // (Camino A) dejar vacío = usa el nombre de la cuenta del manager.
var RESPONDER_A      = "";  // opcional: dirección de respuesta (reply-to).
// La firma se toma AUTOMÁTICAMENTE de la configurada en Gmail del remitente
// (requiere activar el servicio avanzado "Gmail API" — ver README). FIRMA es solo
// el respaldo por si no se puede leer la de Gmail.
var FIRMA = [
  "Nombre del Manager",
  "Gerente PMO",
  "C807",
].join("\n");

var STATUS_OBJETIVO = "Sin Valor Def";

// Asuetos oficiales de Guatemala 2026 (misma lista que src/lib/holidays.ts de la app).
// Se excluyen del cálculo de días hábiles. Actualizar al cambiar de año.
var FERIADOS = {
  "2026-01-01": 1, "2026-04-02": 1, "2026-04-03": 1, "2026-04-04": 1,
  "2026-05-01": 1, "2026-05-10": 1, "2026-06-29": 1, "2026-08-15": 1,
  "2026-09-15": 1, "2026-10-20": 1, "2026-11-01": 1, "2026-12-24": 1,
  "2026-12-25": 1, "2026-12-31": 1,
};

// IDs de columnas del board de Iniciativas en Monday.
var COL = {
  status:  "color_mm3a94fr",
  iniId:   "pulse_id_mm3atas7",
  espera:  "date_mm3gw8yy",
  pku:     "boolean_mm3gbngt",         // checkbox: "v" = marcado
  ckuMail: "lookup_mm3baydr",          // mirror: email del CKU (destinatario) en display_value
  ckuNom:  "board_relation_mm3bde9a",  // relación: nombre del CKU (saludo) en display_value
  pm:      "multiple_person_mm3akwgd", // people: nombre del PM (para CC vía Directorio RH)
};

// Board Directorio RH: el nombre del item es el nombre del recurso; email en esta columna.
var RH_EMAIL_COL = "email_mkz5qg4v";

// ── Web App: devuelve el registro de envíos en JSON (lo consume la app) ─────
// Desplegar como Web App ("ejecutar como: yo", "acceso: cualquiera con el enlace").
// La URL resultante va en REMINDERS_WEBAPP_URL del .env.local de la app.
function doGet() {
  var envios = [];
  var id = PropertiesService.getScriptProperties().getProperty("LOG_SHEET_ID");
  if (id) {
    var sh = SpreadsheetApp.openById(id).getSheetByName("Envios");
    var last = sh ? sh.getLastRow() : 0;
    if (last >= 2) {
      sh.getRange(2, 1, last - 1, 8).getValues().forEach(function (r) {
        envios.push({
          fecha:  (r[0] instanceof Date) ? Utilities.formatDate(r[0], Session.getScriptTimeZone(), "yyyy-MM-dd") : String(r[0]),
          itemId: String(r[1]),
          iniId:  String(r[2]),
          nombre: String(r[3]),
          para:   String(r[4]),
          cc:     String(r[5]),
          numero: Number(r[6]) || null,
          espera: String(r[7]),
        });
      });
    }
  }
  return ContentService
    .createTextOutput(JSON.stringify({ envios: envios }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Función principal (la ejecuta el trigger diario) ────────────────────────
function revisarYEnviarRecordatorios() {
  var items = fetchIniItems_();
  var rhMap = fetchDirectorioRH_();     // nombre-normalizado del recurso -> email
  var hoja  = getHojaEnvios_();
  var registros = leerRegistros_(hoja); // itemId -> { count, lastSent: Date }
  var hoy = hoyMedianoche_();
  var candidatos = 0, enviados = 0;

  items.forEach(function (it) {
    if (valorCol_(it, COL.status) !== STATUS_OBJETIVO) return;   // debe estar en Sin Valor Def
    if (valorCol_(it, COL.pku) === "v") return;                 // PKU marcado → no enviar

    var esperaTxt = valorCol_(it, COL.espera);
    var espera = parseFecha_(esperaTxt);
    if (!espera) return;                                        // sin fecha En Espera → no se programa

    var email = valorMirror_(it, COL.ckuMail);
    if (!email) return;                                         // sin correo destino → se omite

    candidatos++;
    var reg = registros[it.id] || { count: 0, lastSent: null };
    if (reg.count >= MAX_CORREOS) return;                       // ya se enviaron los 4

    var base  = reg.count === 0 ? espera : reg.lastSent;        // 1er correo desde En Espera; resto desde el último envío
    var vence = sumarDiasHabiles_(base, DIAS_HABILES);
    if (hoy < vence) return;                                    // aún no toca

    var numero = reg.count + 1;
    var datos = {
      to:        email,
      ckuNombre: valorMirror_(it, COL.ckuNom),          // nombre del CKU (saludo)
      iniId:     valorCol_(it, COL.iniId),
      nombre:    it.name,                               // nombre de la iniciativa
      pmNombre:  valorCol_(it, COL.pm),                 // nombre del PM
      cc:        emailsPorNombres_(valorCol_(it, COL.pm), rhMap), // email(s) del PM (CC)
      numero:    numero,
    };

    if (DRY_RUN) {
      Logger.log("[DRY_RUN] Correo " + numero + "/" + MAX_CORREOS + " → " + datos.to +
                 " (CC: " + (datos.cc || "—") + ") — " + it.name + " (vencía " + fmt_(vence) + ")");
    } else {
      enviarCorreo_(datos);
      hoja.appendRow([new Date(), it.id, datos.iniId, it.name, datos.to, datos.cc || "", numero, esperaTxt]);
    }
    enviados++;
  });

  Logger.log("Candidatos: " + candidatos + " · Correos " +
             (DRY_RUN ? "(simulados)" : "enviados") + ": " + enviados);
}

// ── Monday ──────────────────────────────────────────────────────────────────
function fetchIniItems_() {
  var boardId = prop_("MONDAY_INI_BOARD_ID");
  var ids = [COL.status, COL.iniId, COL.espera, COL.pku, COL.ckuMail, COL.ckuNom, COL.pm]
    .map(function (s) { return '"' + s + '"'; }).join(",");
  var query = "{ boards(ids:[" + boardId + "]) { items_page(limit:500) { items { id name " +
              "column_values(ids:[" + ids + "]) { id text " +
              "... on MirrorValue { display_value } ... on BoardRelationValue { display_value } } } } } }";
  return mondayGql_(query).boards[0].items_page.items;
}

// Directorio RH: nombre-normalizado del recurso -> email (para resolver el CC del PM).
function fetchDirectorioRH_() {
  var boardId = prop_("MONDAY_RH_BOARD_ID");
  var query = "{ boards(ids:[" + boardId + "]) { items_page(limit:500) { items { name " +
              "column_values(ids:[\"" + RH_EMAIL_COL + "\"]) { id text } } } } }";
  var items = mondayGql_(query).boards[0].items_page.items;
  var map = {};
  items.forEach(function (it) {
    var email = (it.column_values[0] && it.column_values[0].text || "").trim();
    if (it.name && email) map[norm_(it.name)] = email;
  });
  return map;
}

// Convierte "Nombre A, Nombre B" (columna people) en "emailA,emailB" usando el Directorio RH.
function emailsPorNombres_(texto, rhMap) {
  if (!texto) return "";
  var out = [];
  texto.split(",").forEach(function (n) {
    var email = rhMap[norm_(n)];
    if (email && out.indexOf(email) === -1) out.push(email);
  });
  return out.join(",");
}

function mondayGql_(query) {
  var res = UrlFetchApp.fetch(MONDAY_URL, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: prop_("MONDAY_API_KEY"), "API-Version": "2024-01" },
    payload: JSON.stringify({ query: query }),
    muteHttpExceptions: true,
  });
  var json = JSON.parse(res.getContentText());
  if (json.errors) throw new Error("Monday API: " + JSON.stringify(json.errors));
  return json.data;
}

function norm_(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function colCV_(it, id) {
  for (var i = 0; i < it.column_values.length; i++) {
    if (it.column_values[i].id === id) return it.column_values[i];
  }
  return null;
}
function valorCol_(it, id)    { var c = colCV_(it, id); return c ? (c.text || "") : ""; }
function valorMirror_(it, id) { var c = colCV_(it, id); return c ? (c.display_value || c.text || "") : ""; }

// ── Correo ──────────────────────────────────────────────────────────────────
function enviarCorreo_(d) {
  var iniTxt = (d.iniId ? d.iniId + " " : "") + d.nombre;
  var saludo = d.ckuNombre ? ("Estimado/a " + d.ckuNombre + ",") : "Estimado/a,";
  // Referencia al PM: nombre y, si se resolvió, su email al lado. Ej: "Luis Aguilar (pm1@c807.com)".
  var pmRef  = d.pmNombre ? (d.cc ? d.pmNombre + " (" + d.cc + ")" : d.pmNombre) : (d.cc || "el PM");
  var asunto = "Seguimiento " + iniTxt;

  // Firma: la configurada en Gmail del remitente; si no se puede leer, el respaldo FIRMA.
  var firmaHtml = firmaGmailHtml_();
  var cierreHtml = firmaHtml
    ? "<p>Saludos cordiales,</p>" + firmaHtml
    : "<p>Saludos cordiales,<br>" + FIRMA.split("\n").map(escapeHtml_).join("<br>") + "</p>";
  var firmaTexto = firmaHtml ? stripHtml_(firmaHtml) : FIRMA;

  var html =
    "<p>" + escapeHtml_(saludo) + " Espero se encuentre bien.</p>" +
    "<p>Me comunico para dar seguimiento a la iniciativa <b>" + escapeHtml_(iniTxt) + "</b>, " +
      "actualmente en estatus \"En espera\". En particular, quisiera consultar dos puntos:</p>" +
    "<p>1. ¿Se logró determinar si el Valor del proyecto (ROI/beneficio) pudo ser calculado?<br>" +
      "2. De ser así, ¿podría agendarse una revisión conjunta para retomar el ciclo de esta iniciativa?</p>" +
    "<p>Quedo atento a su respuesta al correo de " + escapeHtml_(pmRef) + " y agradezco de antemano su apoyo.</p>" +
    cierreHtml;

  var texto =
    saludo + " Espero se encuentre bien.\n\n" +
    "Me comunico para dar seguimiento a la iniciativa " + iniTxt + ", actualmente en estatus \"En espera\". " +
      "En particular, quisiera consultar dos puntos:\n\n" +
    "1. ¿Se logró determinar si el Valor del proyecto (ROI/beneficio) pudo ser calculado?\n" +
    "2. De ser así, ¿podría agendarse una revisión conjunta para retomar el ciclo de esta iniciativa?\n\n" +
    "Quedo atento a su respuesta al correo de " + pmRef + " y agradezco de antemano su apoyo.\n\n" +
    "Saludos cordiales,\n" + firmaTexto;

  var opciones = { htmlBody: html };
  if (d.cc) opciones.cc = d.cc;                                 // CC al PM (email resuelto vía Directorio RH)
  if (REMITENTE_NOMBRE) opciones.name = REMITENTE_NOMBRE;
  if (RESPONDER_A) opciones.replyTo = RESPONDER_A;
  if (REMITENTE_ALIAS) {
    if (GmailApp.getAliases().indexOf(REMITENTE_ALIAS) === -1) {
      throw new Error("REMITENTE_ALIAS '" + REMITENTE_ALIAS + "' no es un alias 'Enviar como' de la " +
        "cuenta que ejecuta el script. Configúralo en Gmail (Configuración → Cuentas → Enviar como) " +
        "y verifícalo, o ejecuta el script con la cuenta del manager y deja REMITENTE_ALIAS vacío.");
    }
    opciones.from = REMITENTE_ALIAS;
  }
  GmailApp.sendEmail(d.to, asunto, texto, opciones);
}

function escapeHtml_(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Lee la firma configurada en Gmail del remitente (la que aparece al redactar un correo nuevo).
// Requiere activar el servicio avanzado "Gmail API" (Servicios → Gmail API). Devuelve HTML o "".
function firmaGmailHtml_() {
  try {
    var arr = (Gmail.Users.Settings.SendAs.list("me").sendAs) || [];
    var match = null;
    for (var i = 0; i < arr.length; i++) {
      if (REMITENTE_ALIAS) { if (arr[i].sendAsEmail === REMITENTE_ALIAS) { match = arr[i]; break; } }
      else if (arr[i].isPrimary) { match = arr[i]; break; }
    }
    if (!match && arr.length) match = arr[0];
    return (match && match.signature) ? match.signature : "";
  } catch (e) {
    Logger.log("No se pudo leer la firma de Gmail (¿activaste el servicio Gmail API?): " + e);
    return "";
  }
}

// Convierte HTML de firma a texto plano para la versión no-HTML del correo.
function stripHtml_(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Hoja de registros ───────────────────────────────────────────────────────
function getHojaEnvios_() {
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty("LOG_SHEET_ID");
  var ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create("PMO — Recordatorios Sin Valor Def");
    p.setProperty("LOG_SHEET_ID", ss.getId());
    Logger.log("Hoja de registros creada: " + ss.getUrl());
  }
  var sh = ss.getSheetByName("Envios");
  if (!sh) {
    sh = ss.insertSheet("Envios");
    sh.appendRow(["Fecha envío", "Item ID", "Ini ID", "Iniciativa", "Para (CKU Mail)", "CC (PM)", "# Correo", "En Espera"]);
  }
  return sh;
}

function leerRegistros_(hoja) {
  var map = {};
  var last = hoja.getLastRow();
  if (last < 2) return map;
  var data = hoja.getRange(2, 1, last - 1, 8).getValues();
  data.forEach(function (r) {
    var itemId = String(r[1]);
    if (!itemId) return;
    var d = (r[0] instanceof Date) ? new Date(r[0].getTime()) : new Date(r[0]);
    d.setHours(0, 0, 0, 0);
    if (!map[itemId]) map[itemId] = { count: 0, lastSent: null };
    map[itemId].count++;
    if (!map[itemId].lastSent || d > map[itemId].lastSent) map[itemId].lastSent = d;
  });
  return map;
}

// ── Utilidades de fecha ─────────────────────────────────────────────────────
function parseFecha_(s) {
  if (!s) return null;
  var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]); // medianoche local
}

// Suma n días hábiles: salta sábado, domingo y asuetos oficiales (FERIADOS).
function sumarDiasHabiles_(date, n) {
  var d = new Date(date.getTime());
  var added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    var wd = d.getDay(); // 0 = domingo, 6 = sábado
    if (wd !== 0 && wd !== 6 && !esFeriado_(d)) added++;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

function esFeriado_(d) {
  var iso = d.getFullYear() + "-" +
            ("0" + (d.getMonth() + 1)).slice(-2) + "-" +
            ("0" + d.getDate()).slice(-2);
  return FERIADOS[iso] === 1;
}

function hoyMedianoche_() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function fmt_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd"); }

function prop_(k) {
  var v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v) throw new Error("Falta la Script Property: " + k);
  return v;
}

// ── Setup: crear el trigger diario (ejecutar UNA vez a mano) ─────────────────
function crearTriggerDiario() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "revisarYEnviarRecordatorios") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("revisarYEnviarRecordatorios")
    .timeBased().everyDays(1).atHour(7).nearMinute(30).create();
  Logger.log("Trigger diario creado (~7:30am, zona horaria del proyecto).");
}
