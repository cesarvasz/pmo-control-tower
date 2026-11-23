# Agendar reuniones desde la app (Google Calendar)

Estado: **en construcción por fases**. Fase 1 (datos y permiso) hecha; las siguientes están en la tabla de abajo.

## Qué se está construyendo

En cada iniciativa, un botón **Agendar** en la flecha de la reunión que toca crea el evento en el Google Calendar del PM, con Google Meet e
invitaciones por correo, y guarda la reunión en la base. La BD pasa a ser la fuente de lectura del calendario del dashboard: se retira
`apps-script/calendar-webapp.gs`.

## Decisiones (acordadas con el usuario)

- **Alcance:** solo la Meeting 1 y la Meeting 2 de las iniciativas. Con status New toca M1; con Meeting 1 toca M2; en otras etapas no hay botón.
- **Quién agenda:** roles PM y Administrador (acción `schedule_meetings`). Un PM solo las iniciativas donde es el PM; el Administrador, cualquiera.
  Siempre desde **su propio** calendario: el organizador es el usuario con la sesión, nunca un dato que mande el cliente.
- **Conexión:** OAuth por usuario (no cuenta de servicio). Scopes `calendar.events`, `calendar.freebusy`, `openid email`.
- **Invitados:** los elige el PM de las personas activas con correo del Directorio RH; no se aceptan correos escritos a mano.
- **Horario:** sin duración por defecto; el PM define inicio y fin. Zona por defecto `America/Guatemala`. Para sugerir huecos libres: 8:00–18:00, L–V, sin asuetos.
- **Correos:** los envía Google (`sendUpdates=all`).
- **Una reunión por iniciativa y tipo.** Reprogramar edita la misma; cancelar la deja en «Sin agendar».
- **Disponibilidad (freebusy)** entra desde la primera versión.
- Producción: `https://pmo-control-tower.vercel.app` (redirect de OAuth: `/api/google/callback`).

## Datos (migración `20261116120000_google_calendar_reuniones.sql`)

| Tabla | Qué guarda |
|---|---|
| `google_conexiones` | La cuenta de Google que conectó cada usuario (una por usuario). El **refresh token no está aquí**: vive cifrado en el Vault y la fila apunta a él (`secreto_id`). `estado` = `activa` · `reconectar`. |
| `reuniones` | Cada reunión: `codigo` (`IN-158`, la llave del calendario de hoy), `tipo` M1/M2, `elemento_id` (null en las históricas), inicio/fin en UTC + `zona` IANA, `invitados` (`[{personaId, email, nombre}]`), `estado` agendada/cancelada, `origen` app/google/apps-script, y los ids de Google (`google_event_id`, `google_etag`, `meet_url`). |

- Una sola reunión **vigente** por `(codigo, tipo)` creada desde la app (índice único parcial; también frena el doble clic). El mismo evento de Google no entra dos veces.
- Las canceladas no se borran; no cuentan en el calendario.
- Como las demás tablas: RLS sin políticas y sin permisos para `anon`/`authenticated`; solo el servidor (secret key) las toca.

### Vault

Las únicas puertas al secreto son dos funciones `SECURITY DEFINER` que **solo `service_role` puede ejecutar**:
`google_guardar_conexion(...)` (guarda o renueva conexión + token en una transacción) y `google_leer_token(usuario)`.
Un trigger borra el secreto del Vault cuando se borra la conexión (desconectar, o borrar al usuario en cascada).
Desconectar conserva las reuniones ya agendadas (`organizador_email` queda como rastro; `organizador_id` pasa a null si se borra al usuario).

## Código

- `src/lib/reunionesRows.ts` (puro, con tests): filas → tipos; `aEntradasCalendario` devuelve las reuniones vigentes con la **misma forma que el Apps Script**
  (`{codigo, meeting, inicio, fin}`), así `buildCalMap` y todo lo que lo usa no cambian.
- `src/lib/reuniones.ts` (solo servidor): conexión (`getConexion`, `guardarConexion`, `leerRefreshToken`, `marcarConexion`, `desconectar`) y
  reuniones (`crearReunion`, `getReunion`, `reunionesVigentesDe`, `actualizarReunion`, `cancelarReunion`, `reunionesParaCalendario`).
- `src/lib/reuniones.integration.test.ts`: de punta a punta contra la base real (Vault, restricciones, trigger, y que la llave pública no abre nada).
  No corre en `npm test`: `REUNIONES_IT=1 npx vitest run src/lib/reuniones.integration.test.ts`. Crea usuarios de prueba y los borra.
- Acción `schedule_meetings` en `src/lib/registry.ts`: Admin la tiene siempre; al rol PM se le otorga desde `/roles`.
- Interruptor del botón: `NEXT_PUBLIC_AGENDAR_REUNIONES=1` (en `.env.local` para probar; en Vercel no existe → apagado en producción).

## Fases

| # | Fase | Estado |
|---|---|---|
| 0 | Google Cloud (proyecto en c807.com, API de Calendar, consentimiento «Interna», cliente OAuth localhost y producción) y consola de Admin (uso compartido de «libre/ocupado») | **hecha** la parte de Cloud (2026-11-19); consola de Admin sin revisar (el usuario no tiene permiso; no hizo falta) |
| 1 | Migración, Vault, tipos, capa de datos y acción `schedule_meetings` | **hecha** |
| 2 | Conectar, callback, estado y desconectar (OAuth) | **probada con Google real** (2026-11-19, local) |
| 3 | Cliente de Calendar y crear evento con Meet y correos | **probada con Google real** |
| 4 | Disponibilidad y sugerencia de huecos | **probada con Google real** |
| 5 | Botón «Agendar» en las flechas de M1 y M2 | **probada con Google real** (encendido solo en local) |
| 6 | Editar y cancelar con control de versión del evento | **probada con Google real** |
| 7 | Lectura desde la base en todo el sistema + importación del histórico del Apps Script | código listo; ensayo hecho (109 reuniones por importar), sin aplicar |
| 8 | Sincronización desde Google (cambios hechos directo en el calendario) y reintentos | pendiente |
| 9 | Paridad con el Apps Script, apagado y retiro de `calendar-webapp.gs` y `CALENDAR_WEBAPP_URL` | pendiente |
| 10 | Producción y grupo piloto de PMs | pendiente |

## Pendientes conocidos

- Melody Hernández (PM) no está ligada a un usuario de la app: hasta ligarla desde el Directorio no podrá agendar.
- `src/lib/holidays.ts` solo trae los asuetos de 2026; para sugerir huecos en 2027 hay que cargarlos.
- La hoja de respuestas del formulario (`sheetRows`) que sirve el mismo Apps Script no la usa ninguna pantalla ni cálculo; se retira con él.
- El Apps Script de recordatorios «Sin Valor Def» sigue leyendo Monday (independiente de esto).
