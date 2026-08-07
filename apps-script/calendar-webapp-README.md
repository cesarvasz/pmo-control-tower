# Apps Script — Web App del calendario

Expone en un solo `doGet` el **calendario de reuniones de iniciativas** y la **hoja de
respuestas del formulario**. Lo consume la app en `CALENDAR_WEBAPP_URL`
(ver [`src/lib/monday.ts`](../src/lib/monday.ts) → `fetchWebApp`).

- [`calendar-webapp.gs`](./calendar-webapp.gs) — todo el código para pegar en Apps Script.

## Cómo nombrar los eventos del calendario

El script no lee la descripción ni los invitados: **decide solo por el título**. El patrón es

```
IN-<número> M1|M2 <lo que quieras>
```

| Título | Resultado |
|---|---|
| `IN-120 M1 Reglas ISR` | ✅ `IN-120` / `M1` |
| `IN-120 M2 Reglas ISR M@cf` | ✅ `IN-120` / `M2` |
| `IN-120 M2` | ✅ `IN-120` / `M2` |
| `in-120 m2 minúsculas` | ✅ se normaliza a `IN-120` / `M2` |
| `IN-120 Reglas ISR M2` | ❌ el `M2` debe ir **justo después** del código |
| `Reunión IN-120 M2` | ❌ el título debe **empezar** con el código |
| `IN-120 M3` | ❌ solo existen M1 y M2 |

El código y el `M1`/`M2` van pegados al inicio; el resto del título es libre.
Espacios de más, tabuladores, espacios no separables (NBSP) y guiones tipográficos
(`–`, `—`) se toleran — se normalizan antes de comparar.

> **Historial:** la versión anterior parseaba con `titulo.substring(0, 9)`, un corte fijo que
> asumía exactamente `IN-###` + 1 espacio + `M#` = 9 caracteres. Un doble espacio, un espacio
> inicial o un código de otro largo (`IN-12`, `IN-1200`) descartaban la reunión **en silencio**:
> la app la mostraba como "sin reunión agendada" sin ningún error. Hoy se usa un regex.

## Configuración (arriba del `.gs`)

| Constante | Default | Para qué |
|---|---|---|
| `HOJA_ID` | — | ID del spreadsheet del formulario |
| `HOJA_PESTANA` | `Respuestas de formulario 1` | Pestaña a exportar |
| `CAL_DESDE` | `2026-05-01` | Inicio de la ventana de eventos |
| `CAL_DIAS_ADELANTE` | `120` | Días hacia el futuro (antes eran 30) |
| `CAL_TODOS_LOS_CALENDARIOS` | `true` | `false` = solo el calendario por defecto |

Con `true` se recorren todos los calendarios de la cuenta (incluidos los compartidos) y se
deduplica por `codigo + meeting + inicio`, para que un evento en el que estás invitado no se
cuente dos veces.

> `CAL_DESDE` es una fecha fija: la ventana crece indefinidamente. Si algún día el feed pesa
> demasiado, muévela hacia adelante — pero ten en cuenta que la app usa la **última reunión
> pasada** cuando no hay ninguna futura (`nextOrLatest` en [`src/lib/ini.ts`](../src/lib/ini.ts)),
> así que recortar el pasado hace perder ese dato en iniciativas antiguas.

## Formato que devuelve

```json
{
  "calendar": [{ "codigo": "IN-120", "meeting": "M2", "inicio": "ISO", "fin": "ISO" }],
  "sheet":    [{ "<encabezado>": "<valor>" }]
}
```

`src/lib/ini.ts` → `buildCalMap` indexa por `codigo` y lo cruza contra el **Ini ID** de Monday,
que viene en mayúsculas (`IN-120`). Por eso el script normaliza el código: un título escrito
`in-120` antes no hacía match y la reunión se perdía sin dejar rastro.

## Cuando una reunión no aparece en la app

Hay dos formas de diagnosticar; ambas reportan lo mismo.

**Desde el editor:** ejecuta **`debugBuscarEvento()`** (ajusta `var CODIGO = "IN-120"` adentro)
y abre **Registros**.

**Por HTTP:** pon un valor en `DEBUG_TOKEN`, redespliega, y consulta

```
<CALENDAR_WEBAPP_URL>?debug=IN-120&token=<DEBUG_TOKEN>
```

> El modo HTTP **solo** responde si `DEBUG_TOKEN` no está vacío **y** el token coincide; en
> cualquier otro caso devuelve el payload normal. El Web App es público
> (`access: ANYONE_ANONYMOUS`), así que sin token no se filtran correos ni nombres de
> calendarios. **Devuelve `DEBUG_TOKEN` a `""` cuando termines de diagnosticar.**

El diagnóstico busca en ±1 año y en **todos** los calendarios, y reporta:

- **`cuentaEfectiva`** — bajo qué cuenta corre el script. Si no es la tuya, el script está
  mirando un calendario que no es el que ves tú: ahí suele estar el problema.
- **`calendarios`** — todos los calendarios visibles para esa cuenta, y cuál es el default
  (el único que leía la versión anterior).
- **`ventana`** — el rango de fechas real del endpoint.
- **`coincidencias`** — por cada evento cuyo título contenga el código: el título crudo, los
  **códigos de carácter** de los primeros 14 (delata el NBSP o el doble espacio que no se ven
  a simple vista), si parsea, si cae en la ventana, y el veredicto **`llegaALaApp`**.

Si `coincidencias` viene vacío, el evento **no existe para la cuenta que ejecuta el script**:
está en otra cuenta, o en un calendario que no le han compartido.

## Despliegue

**Implementar → Administrar implementaciones → Editar (✏️) → Versión: Nueva versión**.
Usa siempre "Nueva versión" sobre la implementación existente para **conservar la misma URL**
de `CALENDAR_WEBAPP_URL`; si creas una implementación nueva, la URL cambia y hay que
actualizar `.env.local`.

La app cachea el resultado 60 s ([`fetchDashboardRaw`](../src/lib/monday.ts)), así que el cambio
puede tardar hasta un minuto en verse. Si el fetch falla, degrada a `calData: []` sin romper el
dashboard: **un calendario caído se ve igual que un calendario vacío**.
