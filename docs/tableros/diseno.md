# Tableros propios — diseño

Objetivo: que la app tenga sus propios tableros (boards) guardados en Supabase y deje de depender
de Monday. Los tableros son **libres** (cada quien agrega columnas y grupos), y cualquier tablero
se puede **guardar como plantilla** para reusarlo.

Decisiones tomadas (2026-11-10):

1. **Una sola columna "Persona"**, siempre ligada al directorio de personas (el Directorio RH
   pasa a ser una tabla de la app). Se acaba la diferencia entre *people* y relación a RH.
2. **Roles de columna y categorías de status**: las métricas leen por rol (Fecha límite, Costo…),
   nunca por nombre ni id de columna.
3. **Importación tal cual**: los 19 tableros de Monday se importan con su estructura actual;
   solo se les asignan roles. Ordenarlos en plantillas limpias es opcional y posterior.
4. **Permisos con "solo lo mío"**: además de permisos por rol y por columna, un rol puede
   limitarse a los elementos donde la persona es responsable.
5. **Extensible**: agregar o quitar funcionalidades (tipos de columna, roles, vistas, acciones)
   debe ser agregar o quitar un módulo, sin tocar el resto.

6. **Todo en una sola página de prueba** (instrucción del 2026-11-10): mientras se construye,
   Tableros vive solo en `/tableros`, con una pestaña por funcionalidad, **sin tocar la estructura
   de la app**. No está en el menú (`registry.ts`), sus acciones no están en `ACTIONS` (las tiene
   quien tiene `manage_roles`, ver `dominio/acciones.ts`) y no cambia ninguna métrica. Las
   pestañas salen del registro `ui/pestanas.ts`. Al terminar se conecta al menú y a las métricas.

---

## 1. Lo que hay hoy en Monday (estudio del 2026-11-10)

19 tableros de proyecto en 5 generaciones de la plantilla VALOR, más 4 de catálogo.

| Generación | Tableros | Fases | Subitems |
|---|---|---|---|
| VALOR clásico | PM-001, 002 | grupos Valuación / Aprobación / Launch \| Lanzamiento / Operación / Revisión | Actividades |
| VALOR Desarrollo | PM-003 a 009 | ídem, "Launch \| Desarrollo" | Hitos de desarrollo (PMS ID, Owner, Developer, TLD) |
| VALOR nueva plantilla | PM-010 a 014 | ídem clásico; items con Type HITO/ENTREGABLE/STEP | Actividades (Type ACTIVIDAD/HITO) |
| VALOR Lite | PM-015 a 018 | grupos con letra V \| A \| L \| O \| R | Actividades (PM-016 sin subitems) |
| Programa | PM-019 | grupos por cuenta; la fase va en columna "Fase VALOR" | — |

Catálogos: Iniciativas (embudo), PML / VALOR Lite (requerimientos), Directorio RH (personas),
Estrategia. Tipos de columna en uso: números, fecha, fórmula, dropdown, archivo, people, status,
timeline, relación, espejo, checkbox, texto, texto largo, email, id, creation log, hora.
Sin uso: *Dependent On* (0/434), *Completion Status*, columnas "link to Duplicate of…".

---

## 2. Principio de extensibilidad: todo es un registro

Igual que hoy `src/lib/registry.ts` es el catálogo de páginas y acciones, los tableros se arman
con **registros**: listas en código donde cada entrada es un módulo independiente. Agregar una
funcionalidad = agregar una entrada; quitarla = quitar la entrada (los datos se conservan).

| Registro | Qué contiene | Ejemplo de cómo crece |
|---|---|---|
| `TIPOS_COLUMNA` | cada tipo de columna: cómo se valida, guarda, muestra, edita, filtra, ordena e importa de Monday | agregar "Moneda" o "Calificación ⭐" |
| `ROLES_COLUMNA` | los roles que pueden tener las columnas y qué tipos aceptan | agregar rol "Riesgo" para un KPI nuevo |
| `CATEGORIAS_STATUS` | hecho / en curso / atascado / fuera de medición / en pausa | agregar "en revisión" |
| `VISTAS` | maneras de ver un tablero: Tabla, Gantt… | agregar Kanban o Calendario |
| `ACTIONS` (el actual) | acciones con permiso | "Administrar plantillas" |
| `CATEGORIAS_TABLERO` | proyecto, PML, iniciativas, estrategia, libre — y qué roles pide cada una | agregar "Programa" |

### Estructura de carpetas

```
src/features/tableros/
  dominio/                 ← lógica PURA (sin red ni BD), con tests
    tipos-columna/
      index.ts             ← el registro TIPOS_COLUMNA
      texto.ts  numero.ts  fecha.ts  timeline.ts  status.ts  dropdown.ts
      persona.ts  checkbox.ts  archivo.ts  formula.ts  relacion.ts  espejo.ts ...
    roles.ts               ← ROLES_COLUMNA + CATEGORIAS_STATUS
    formulas.ts            ← evaluador seguro de fórmulas (nunca eval)
    permisos.ts            ← puede(usuario, acción, tablero, columna, elemento)
    plantillas.ts          ← tablero → plantilla y plantilla → tablero
    metricas.ts            ← ADAPTADOR: tablero → ProjItem (lo que ya usan las métricas)
    importar-monday.ts     ← copia de Monday → tablero
  datos/                   ← SOLO SERVIDOR: lectura/escritura en Supabase
  ui/
    pestanas.ts            ← registro de pestañas de /tableros (una por funcionalidad)
    vistas/  index.ts (registro VISTAS)  tabla/  gantt/
    celdas/  (un editor por tipo de columna, registrado junto al tipo)
src/app/(app)/tableros/    ← la página de prueba (solo arma las pestañas)
src/app/api/tableros/      ← rutas del servidor (todas pasan por datos/puerta.ts)
```

Cada tipo de columna es un objeto con la misma forma:

```ts
interface TipoColumna<V, C> {
  clave: string;                 // "fecha"
  etiqueta: string;              // "Fecha"
  config: { defecto: C; validar(c: unknown): C };   // ej. etiquetas de un status
  valor:  { validar(v: unknown, c: C): V | null; texto(v: V, c: C): string; comparar(a: V, b: V): number };
  calculado?: (elemento, tablero) => V;             // fórmula, espejo: no se guardan
  desdeMonday?: (columnaMonday, valorMonday) => V;  // para la importación
}
```

La UI registra aparte su editor de celda para cada `clave`, así el dominio no depende de React.

---

## 3. Modelo de datos (Supabase)

Igual que el resto del esquema: RLS activo, sin políticas, solo el servidor (service_role) lee
y escribe; los permisos se revisan en una sola puerta en el servidor.

| Tabla | Para qué | Campos clave |
|---|---|---|
| `personas` | Directorio (antes Directorio RH) | nombre, email, tipo (CKU, Sponsor, Dev interno…), rol, TLD, hrs_mes, activo, `app_user_id` (liga con el login → "solo lo mío"), `monday_item_id` |
| `tableros` | Cada tablero | nombre, código (PM-001), categoría, `plantilla_id`, archivado, `monday_board_id` |
| `tablero_grupos` | Grupos / fases | título, color, orden, `fase` (V/A/L/O/R opcional) |
| `tablero_columnas` | Columnas de items y de subitems | `nivel` (item/sub), título, `tipo`, `rol`, `config` jsonb (etiquetas, opciones, fórmula, tablero destino…), orden, ancho, oculta |
| `elementos` | Items y subitems en una sola tabla | `tablero_id`, `grupo_id`, `parent_id`, nombre, orden, `valores` jsonb `{columna_id: valor}`, `responsables uuid[]`, creado/actualizado/archivado, `monday_item_id` |
| `elemento_comentarios` | Bitácora (antes Updates) | elemento, autor, texto, fecha |
| `elemento_archivos` | Archivos (Supabase Storage) | elemento, columna, ruta, nombre, tamaño |
| `tablero_historial` | Quién cambió qué y cuándo (trigger) | elemento, columna, antes, después, persona, fecha |
| `plantillas` | Plantillas reutilizables | nombre, descripción, versión, `definicion` jsonb (grupos, columnas con roles, items base), creada desde qué tablero |
| `tablero_permisos` | Permisos por rol | ver abajo |

Por qué `valores` en jsonb y no una columna de BD por cada columna del tablero: agregar o quitar
una columna del tablero es solo agregar o quitar una fila en `tablero_columnas`; no hay migración.
`responsables` es una copia indexada de la columna con rol Responsable, para filtrar rápido
"lo mío" sin recorrer el jsonb.

### Valor guardado por tipo

| Tipo | Valor | Tipo | Valor |
|---|---|---|---|
| texto, texto largo, email | `"…"` | status | `"id-etiqueta"` |
| número | `123.5` | dropdown | `["id", …]` |
| fecha | `"2026-11-10"` | persona | `["persona-uuid", …]` |
| timeline | `{ "desde": "…", "hasta": "…" }` | relación | `["elemento-uuid", …]` |
| checkbox | `true` | archivo | `["archivo-uuid", …]` |
| fórmula, espejo | (se calculan, no se guardan) | id automático | (lo da la app) |

### Roles de columna

Status · Responsable · Plan (inicio–fin) · Fecha límite · Nueva fecha límite · Fin real ·
Costo · Beneficio · Esfuerzo planeado · Esfuerzo real · Tipo (HITO / ENTREGABLE / ACTIVIDAD) ·
Fase VALOR. Cada categoría de tablero dice qué roles necesita para medirse (un proyecto sin
columna con rol Fecha límite no puede medir Cumplimiento, y la app lo avisa).

La fase sale del grupo (`tablero_grupos.fase`) o de una columna con rol Fase VALOR (caso PM-019).

---

## 4. Permisos

Tres capas, todas revisadas en `dominio/permisos.ts` (función pura, con tests) y aplicadas en una
sola puerta del servidor:

1. **Acciones globales** (registro actual `ACTIONS`): crear tableros, administrar plantillas,
   administrar el directorio de personas.
2. **Por tablero o categoría** (`tablero_permisos`: rol + tablero o categoría):
   - nivel: `ver` · `editar valores` · `editar estructura` (columnas, grupos) · `administrar`
   - `columnas_editables`: lista de roles/columnas que puede editar (vacío = todas)
   - `solo_lo_mio`: solo ve y edita elementos donde su persona está en `responsables`
3. **El dato**: la persona del usuario sale de `personas.app_user_id` (se liga por email al entrar).

Ejemplo — rol Developer en categoría "proyecto": `editar valores`, columnas = [Status, Fin real],
`solo_lo_mio` = sí → ve sus hitos y solo puede marcar status y fecha de fin.

---

## 5. Métricas: un solo adaptador

`dominio/metricas.ts` convierte un tablero al mismo `ProjItem` que hoy produce `projProcess`
(leyendo por rol). Cómo (hecho en Fase 2): el tablero se pasa a la forma de Monday (`MondayItem[]`)
emitiendo cada rol con el título que espera `projProcess` ("Limit Date", "Cost $", "CPM"…), las
etiquetas de status propias por su categoría ("Listo" → "Done") y conservando los ids de Monday en
lo importado (bases del EVM y atribuciones están guardadas por ese id); luego se usa el MISMO
`projProcess`. Igual que hoy, la fecha límite sale del fin del Plan si no hay columna propia y el
costo de Esfuerzo real × 9, por eso la categoría Proyecto acepta esos roles como alternativa.
`dominio/paridad.ts` compara ProjItem por ProjItem; en la app: botón "Comparar con Monday". Así Control Tower, Players, Portafolio, EVM y reportes **no cambian** y
funcionan a la vez con proyectos que siguen en Monday y con tableros de la app durante la
transición. Cuando ya no quede nada en Monday se retira `projProcess` y `monday-cols.ts`.

---

## 6. Importación desde Monday

Fuente: la copia que ya existe en Supabase (`monday_boards` / `monday_items`). Antes de importar,
la copia se completa con lo que falta:

- ids ligados de relaciones (para saber a qué persona apunta "Responsible")
- valor crudo de *people* (para ligar al directorio)
- bitácora (Updates) y archivos (descargados a Storage; los enlaces de Monday vencen)

Importar = un tablero de la app por cada board, con sus mismas columnas y grupos, más roles
asignados por un mapa por generación (revisable a mano antes de confirmar). Las 5 fórmulas en
uso se pasan al evaluador propio. Monday **no** queda de solo lectura al importar: sigue vivo
durante la convivencia (Fase 5, sección 8) y solo se congela en el corte (Fase 7).

---

## 7. Plan por fases

| Fase | Entrega | Cómo se valida |
|---|---|---|
| **0 · Base** ✓ | Registros, tablas, motor de permisos, `personas` importado del Directorio RH y ligado a usuarios. Página `/tableros` con pestañas Directorio, Permisos, Catálogo y Plan | tests del dominio + `TABLEROS_IT=1 npx vitest run src/features/tableros/datos/personas.integration.test.ts` (84 personas, 10 ligadas, 2ª corrida sin cambios) |
| **1 · Tablero** ✓ | Vista Tabla editable (pestaña Tableros): grupos, subitems, tipos básicos (texto, número, fecha, timeline, status, dropdown, persona, checkbox), crear/editar columnas y grupos, roles, historial (`tablero_historial`, función `tablero_cambiar_valor`). Todo cambio entra por el registro `datos/operaciones.ts`; los permisos por columna y "solo lo mío" ya se aplican en la puerta | `TABLEROS_IT=1 npx vitest run src/features/tableros/datos/tableros.integration.test.ts` (crea un tablero, lo usa y lo borra) |
| **2 · Plantillas + piloto** ✓ | Guardar como plantilla / crear desde plantilla (pestaña Plantillas); importar de Monday (`dominio/importar-monday.ts`, piloto PM-013: 31 elementos, 123 subelementos); adaptador de métricas y "Comparar con Monday" | `TABLEROS_IT=1 npx vitest run src/features/tableros/datos/piloto.integration.test.ts`: 0 diferencias en todos los ProjItem; EVM, salud y entregas idénticos |
| **3 · Completo** ✓ | Fórmulas (`dominio/formulas.ts`: parser propio, sintaxis de Monday + español; `dominio/calculos.ts` calcula fórmula/espejo/archivo y detecta ciclos; una fórmula puede tener rol si devuelve lo que el rol pide), espejo (dato del directorio o de un tablero ligado), relación entre tableros, bitácora (`elemento_comentarios`) y archivos (`elemento_archivos` + bucket privado `tableros`, subida directa con URL firmada). Importar trae fórmulas y espejos; "Traer bitácora y archivos" trae Updates y documentos de Monday (`datos/importar-extras.ts`) | piloto PM-013: 0 diferencias, fórmulas verificadas en 128 elementos, 68 actualizaciones y 9 archivos; prueba de punta a punta con un archivo real en Storage |
| **4 · Migración** ✓ | Pestaña Migración: Estrategia → Iniciativas → PML → 19 proyectos (orden por las relaciones); relaciones a tableros importados y espejos sobre ellas; tipos automáticos ID (autonumérico con prefijo, el "Item ID") y Creado (el "Creation log"); volver a importar conserva ids, permisos y lo que apunta al tablero; las columnas importadas conservan su id de Monday (Iniciativas y PML se procesan por id); personas fuera del directorio = aviso. Vista Gantt (registro `ui/vistas`) | `TABLEROS_IT=1 npx vitest run src/features/tableros/datos/portafolio.integration.test.ts`: 22 boards con 0 diferencias salvo una explicada (PM-018: Cost $ = esfuerzo × 9 + Costo adicional; la app de hoy ignora el adicional) |
| **5 · Convivencia** | Monday sigue vivo. Cada hora se trae todo de Monday a los tableros ya creados **sin rehacerlos** (sección 8): Monday manda en los datos, la app en el modelo. Bitácora, archivos, directorio y boards nuevos incluidos. Registro de corridas, «Sincronizar ahora» y paridad diaria en la pestaña Migración. Primero corre en local; en producción, con pg_cron + pg_net cuando se autorice subir. También se cierran huecos: adjuntos dentro de la bitácora, personas que faltan en el directorio | una semana de corridas sin errores; lo modelado en la app sobrevive a las sincronizaciones; la paridad diaria solo muestra las diferencias que se buscan a propósito al modelar |
| **6 · Conectar la app** (en curso, sección 10) | Interruptor `FUENTE_DATOS=monday\|tableros`: la app lee las métricas de los tableros (datos de hasta 1 h, o al momento con «Sincronizar ahora»). Mientras dure la convivencia, lo que la app escribe (status, actualizaciones) sigue yendo a Monday y dispara la sincronización de ese board. Menú y acciones en `ACTIONS`/roles (toca la estructura de la app: requiere el visto bueno) | comparación del dashboard completo con las dos fuentes (EVM, salud, Control Tower, Players, CKUs, Portafolio) |
| **7 · Corte** | Cuando el modelo esté listo: se detiene la sincronización, se desbloquean los valores ligados, las escrituras van a los tableros, Monday solo lectura → exportación final a Storage → se apagan la copia, el cron y la clave de Monday | paridad final 0; respaldo semanal de la base y de Storage |

---

## 8. Convivencia con Monday (Fase 5)

Decisión del 2026-11-11: Monday **no** se apaga todavía. Mientras se modela la data en la app, cada
hora se trae todo de Monday a la estructura ya creada. Cuando el modelo quede como se quiere, se
desconecta Monday (Fase 7). Regla general: **Monday es dueño de los datos; la app es dueña del modelo.**

"Volver a importar" (Fase 4) no sirve para esto: borra el tablero y lo rehace, así que perdería lo
modelado, la bitácora y los archivos. La sincronización **fusiona**:

| Lo trae de Monday (Monday manda) | No lo toca (la app manda) |
|---|---|
| Elementos y subelementos, por id de Monday: los nuevos se crean; nombre, grupo y padre se actualizan; los borrados o archivados en Monday se **archivan** (no se borran) | Columnas creadas en la app, y las fórmulas, espejos y relaciones (aunque vengan de Monday, vale la expresión que se deje en la app) |
| Valores de las columnas ligadas (las que tienen id de Monday), convertidos por el **tipo que tenga la columna en la app** (si un Texto se cambia a Persona, el valor de Monday se convierte a Persona) | Título, rol, tipo, orden y configuración de cada columna; nombres y orden de los grupos; categoría, permisos y plantillas |
| Etiquetas nuevas de status/dropdown (se agregan; las ya modeladas no cambian) | Columnas ligadas que se archiven en la app: no vuelven |
| Columnas nuevas en Monday: se agregan al final, sin rol (la corrida las lista en Migración para decidir qué hacer con ellas) | Elementos creados en la app (sin id de Monday) |
| Bitácora y archivos nuevos (solo lo que falta; una actualización editada en Monday se actualiza) | Comentarios y archivos agregados en la app |
| Directorio RH → `personas` (sin deshacer los ligados a mano) | |
| Boards nuevos en Monday (p. ej. PM-020): se importan solos y aparecen en Migración | |

- **Sin conflictos:** mientras dure la convivencia (`tableros.sincroniza_monday`), lo que viene de
  Monday es de solo lectura en la app: valores de las columnas ligadas (marca **M** en el encabezado),
  nombre, grupo y archivado de sus elementos, sus archivos y actualizaciones, y archivar un grupo con
  elementos de Monday. Lo decide `esDatoDeMonday` (dominio/tablero.ts): la UI lo usa para no ofrecer
  la edición y `datos/operaciones.ts` lo exige (409). Las columnas propias de la app y los elementos
  creados aquí sí se editan. Lo que entra de Monday queda en el historial como «Monday
  (sincronización)», solo cuando el valor cambió.
- **Cómo funciona:** `dominio/sincronizar.ts` (puro, con tests en `fase5.test.ts`) compara lo que hay
  hoy en la copia `monday_*` (pasado a definición por `importar-monday.ts`, igual que al importar)
  con el tablero, CON lo archivado, y devuelve un plan; `datos/sincronizar.ts` lo aplica. Los grupos
  se reconocen por su clave de Monday (`tablero_grupos.monday_group_id` = su título allá), así que
  renombrarlos aquí no los duplica; las etiquetas de Status/Lista van por id (renombrarlas aquí se
  respeta). Los valores se comparan en forma canónica (jsonb reordena las llaves), así que una
  corrida sin cambios en Monday no escribe nada.
- **La corrida** (`correrSincronizacion`): copia de Monday completa (`sincronizarTodo`, ~25 s) →
  directorio → cada board en orden (Estrategia → Iniciativas → PML → Proyectos; los nuevos se
  importan) → bitácora y archivos (solo lo nuevo, más el texto de las actualizaciones editadas) →
  comparación con el procesador real. Un board que falla no frena a los demás. La comparación es un
  reporte: al modelar, las diferencias buscadas a propósito son esperadas.
- **Registro:** tabla `tablero_sincronizaciones` (origen manual/programada, inicio, fin, estado y el
  resultado por board en `resumen`). Un índice único parcial deja **una sola corrida en curso**; una
  que se cortó hace más de 2 h se marca como fallida. La pestaña Migración muestra la última corrida
  (y su avance mientras corre), las anteriores, el resultado por board y «Sincronizar ahora».
  «Rehacer desde cero» (la reimportación de la Fase 4) queda por board, con confirmación, porque
  borra lo modelado.
- **Dónde corre (decisión 2026-11-11: solo local):** `npm run tableros:sincronizar`
  (`scripts/tableros-sincronizar.mjs`, carga el TypeScript con jiti; no necesita el servidor de
  desarrollo) y el Programador de tareas de Windows lo corre cada hora con
  `scripts/tableros-sincronizar.cmd` (bitácora en `%TEMP%\pmo-tableros-sync.log`); solo con la PC
  encendida. «Sincronizar ahora» (POST `/api/tableros/sincronizar`) la corre en el servidor local y
  en Vercel se rechaza. Si algún día se lleva a producción: pg_cron + pg_net cada hora hacia una ruta
  con `CRON_SECRET` (el plan Hobby de Vercel solo permite crons diarios), por tandas para no pasar el
  límite de tiempo de la función.

### Bitácora: respuestas y adjuntos (decisión 2026-11-11)

- **Dónde viven los archivos:** todos en Supabase Storage, bucket privado `tableros`, ruta
  `{tablero}/{elemento}/{id único}/{nombre}`, con su fila en `elemento_archivos`. Esa fila dice si
  el archivo es de una **columna** (`columna_id`) o de un **comentario** de la bitácora
  (`comentario_id`; nunca de los dos, hay un check). Se bajan con un enlace firmado de 2 minutos,
  después de revisar que la persona puede ver el elemento.
- **Lo que trae de Monday:** las actualizaciones con sus adjuntos (también las que solo tienen
  archivos, con texto vacío), y las **respuestas** (`elemento_comentarios.respuesta_a`; Monday solo
  anida un nivel). El tipo `Reply` de Monday no tiene `assets`: los adjuntos de una respuesta salen
  del `data-asset_id` de las imágenes de su HTML y se piden con `assets(ids:)`. Cada archivo se
  reconoce por su id de Monday (`monday_asset_id`), así que cada corrida solo baja lo nuevo.
  Simulacro del 2026-11-11: 1530 actualizaciones, 4 respuestas, 1067 adjuntos (248 MB).
- **Lo que se sube en la app:** un comentario puede ir solo con archivos; se responde a una
  actualización (no a otra respuesta); hasta 10 archivos de 50 MB por comentario, subidos directo
  del navegador a Storage con URL firmada. Solo quien escribió el comentario le adjunta archivos.
  Quedan solo en la app: la sincronización va de Monday hacia la app, no al revés.
- **Borrar:** un adjunto lo borra quien lo subió o un Admin; borrar un comentario se lleva sus
  respuestas y los archivos de todos (también de Storage). Lo que vino de Monday no se borra
  mientras el tablero se sincroniza.
- **Después del corte** hay que respaldar Storage aparte: los respaldos de la base no lo incluyen.

### Diferencias decididas con Monday

`dominio/paridad.ts::DIFERENCIAS_EXPLICADAS` lista las diferencias que ya se decidieron; la
comparación las aparta con su motivo y no las cuenta. Hoy una: **PM-018** — el costo es
`Effort Spent × 9 + Costo adicional $`. Monday no entrega el resultado de las fórmulas y la
app de hoy usa un respaldo que ignora el adicional; el tablero aplica la fórmula completa, **como
se ve en Monday** (decisión del 2026-11-11). Cuando Control Tower lea los tableros (Fase 6), el
EVM de PM-018 bajará a lo que Monday muestra.

## 9. Preparación de la Fase 6: el dashboard leído de Supabase

La app arma TODO desde un solo objeto: `fetchDashboardRaw()` (Monday) → `buildDashboardData()` →
Control Tower, Players, Portafolio, Proyectos… Por eso basta con dar el mismo `DashboardRaw` desde
Supabase:

- `datos/fuente-dashboard.ts::dashboardRawDesdeTableros()` arma el `DashboardRaw` con los
  tableros (Estrategia, Iniciativas, PML y los de categoría Proyecto, vía
  `tableroAMondayItems`) y el directorio (`dominio/dashboard.ts::personasAHrItems`: `personas`
  con los mismos ids de columna del board Directorio RH). Lo que no viene de Monday (bases del
  EVM, atribuciones, On Hold, Clase, NPS) se lee igual que hoy. La app lo usa con el interruptor
  `FUENTE_DATOS` (sección 10).
- `compararDashboardCompleto()` arma el `DashboardData` con la copia de Monday y con los tableros
  y los compara (`dominio/dashboard.ts::compararDashboard`): Iniciativas, PML, Proyectos (elementos
  y tableros), Estrategia, Directorio, y los indicadores del Control Tower (EVM, Calidad,
  Cumplimiento, NPS, los mismos del histórico semanal). Las diferencias decididas (PM-018) y las
  personas fuera del directorio no cuentan. Botón «Comparar dashboard» en Migración y
  `TABLEROS_IT=1 npx vitest run src/features/tableros/datos/dashboard.integration.test.ts`.
- Resultado del 2026-11-11: **sale igual**. EVM 85, Calidad 42, Cumplimiento 64 y NPS 41 con las
  dos fuentes; 1744 elementos de proyecto, 44 iniciativas, 31 PML, 23 estrategias y 80 personas
  del directorio idénticos. Avisos: «JC Rodas», «Rafael Toruño» y «Deleted outdated pending user».
  «Tablero Prueba con Plantilla» (categoría Proyecto, nacido en la app) no llega a la app mientras
  dure la convivencia (sección 10).
- No entran el calendario, la hoja ni el ROI (Apps Script y Sheets): no dependen de la fuente.

## 10. Fase 6: la app lee de los tableros (en curso desde el 2026-11-11, solo en local)

- **Interruptor:** `FUENTE_DATOS=monday|tableros` (`lib/fuenteDatos.ts`; sin definir = Monday). En
  local está en `tableros` (`.env.local`); en Vercel no está definida, así que producción y el cron
  semanal siguen leyendo de Monday. Volver atrás = `FUENTE_DATOS=monday` (el servidor de
  desarrollo recarga `.env.local` solo). La pestaña Migración dice qué fuente usa el servidor.
- **Qué cambia de fuente** (todo en `lib/monday.ts`, las páginas no se tocan):
  - `fetchDashboardRaw` → `fuenteMondayDesdeTableros()`: Iniciativas, PML, Proyectos, Estrategia y
    el directorio salen de los tableros; calendario, hoja y recordatorios siguen de Apps Script.
    `fetchedAt` («Actualizado:» del Topbar) es cuándo empezó la última sincronización: de
    cuándo son los datos de Monday. Tarda ~6 s (Monday: ~47 s).
  - `fetchProjBoardConContexto` (refresh de un board, `/api/dashboard/board/[id]`) →
    `proyectoDesdeTableros()`: solo ese tablero, Iniciativas y el directorio.
  - `fetchHrItems` (rol de quien responde una encuesta) → el directorio de la app.
- **Escrituras durante la convivencia:** el status de /proyectos se sigue escribiendo en Monday;
  luego `reflejarEscrituraEnTableros` copia ese board de Monday y lo trae a su tablero
  (`sincronizarProyectoDeItem`, ~5 s) para que el refresh que sigue ya lo vea. Si eso falla, el
  cambio llega con la sincronización de cada hora (no rompe la escritura). Para escribir hacen
  falta el correo de cada item y el board **oculto** de cada hito: el tablero no los guarda, salen
  de la copia (`completarDatosDeEscritura`). Un elemento creado en la app no existe en Monday: su
  status se cambia en /tableros (409). La bitácora de /proyectos sigue leyéndose y escribiéndose
  en Monday (no afecta métricas; llega a los tableros con la sincronización).
- **Lo que no llega a las páginas:** ningún tablero nacido en la app, de ninguna categoría (p. ej.
  «Tablero Prueba con Plantilla», o un segundo tablero de Iniciativas o PML): las páginas leen solo
  los que vienen de Monday, así se puede modelar en tableros nuevos sin que los usuarios lo vean.
- **Orden de los proyectos:** el de la carpeta de Monday (`monday_boards.orden`, lo llena la copia
  en cada corrida), como hoy; los que no tienen, al final por nombre. En la Fase 7 hay que pasarlo
  a los tableros.
- **Verificación del 2026-11-11** (`fetchDashboardRaw` con las dos fuentes, Monday en vivo):
  EVM 85, Calidad 42, Cumplimiento 64 y NPS 41 iguales; 1743 elementos, 44 iniciativas, 31 PML,
  23 estrategias, 21 proyectos y 80 personas iguales, en el mismo orden; correo, board oculto y
  columna de status iguales en los 1743 items/hitos. Solo difieren los avisos de personas fuera
  del directorio y la diferencia decidida de PM-018. `TABLEROS_IT=1 npx vitest run
  src/features/tableros/datos/dashboard.integration.test.ts` cubre el camino de la app y el
  refresh de un board.
- **Falta:** producción (sección 11) y menú/roles cuando se autorice.

## 11. Camino a producción: sincronización en la nube y respaldo (2026-11-12)

Para que en producción los usuarios lean de Supabase mientras se modela en tableros nuevos, la
sincronización tiene que correr fuera de esta PC (de noche se apaga: no hubo corridas de 18:00 a
08:00) y la app no puede quedarse con datos viejos si la sincronización falla.

**Sincronización por pasos (fase A).** Una corrida completa tarda ~4 min de trabajo y en Vercel una
función se corta a los 60 s. La corrida se parte en pasos (`dominio/sincronizar-pasos.ts`): buscar
los boards de Monday → copiarlos de a 3 → cerrar la copia → directorio → por cada board, en orden:
traerlo, su bitácora y archivos, su comparación. La cola de pasos que faltan vive en la corrida
(`tablero_sincronizaciones.pasos`, migración `20261112120000_tableros_sincronizacion_por_pasos`).

- `/api/cron/tableros-sync` (protegida con `CRON_SECRET`): la llama `pg_cron` **cada minuto**.
  Si hay una corrida a medias, la avanza ~35 s (ningún paso tarda más de ~20 s); si no, abre una
  nueva cuando la última empezó hace 60 min o más; si no toca, responde al momento. Una corrida
  queda lista en 6–7 llamadas.
- **Candado** (`trabajando_hasta`, 3 min, se renueva en cada paso): solo una llamada avanza la
  corrida; otra a la vez responde «ocupada». Si la función se corta a medio paso, el paso queda
  intentado y la siguiente llamada lo retoma cuando vence el candado; un paso que se corta 3 veces
  se abandona (queda como error de ese board; si es de la copia o del directorio, la corrida falla).
  Una corrida abierta hace más de 2 h se da por cortada.
- Todo usa el mismo motor: el botón «Sincronizar ahora» (en local la corre entera; en Vercel avanza
  ~35 s y el cron la termina), el script de esta PC (`npm run tableros:sincronizar`, retoma una corrida
  a medias) y la ruta. `sincronizarTodo` (copia de Monday, `/api/cron/monday-sync`) quedó armada con
  las mismas piezas (`abrirCopia`, `copiarBoards`, `cerrarCopia`).
- Origen de cada corrida: «a mano», «programada en esta PC» o «programada en la nube» (`nube`).

**Respaldo automático (fase B).** Con `FUENTE_DATOS=tableros`, la app lee de los tableros solo si la
última sincronización correcta (ok o con errores) empezó hace 2 h o menos (`decidirFuente` en
`lib/fuenteDatos.ts`, `fuenteEfectiva` en `lib/monday.ts`). Si es más vieja, si no se puede consultar
o si leer los tableros falla, lee de Monday y lo deja en el log; vuelve a los tableros sola con la
siguiente sincronización correcta. La pestaña Migración muestra «Respaldo activo» con el motivo.

**Verificación del 2026-11-12 (local):** la ruta llamada como lo haría pg_cron terminó una corrida en
6 llamadas (la más larga, 41 s con 40 s de presupuesto; se bajó a 35 s): 24 boards, 0 errores,
0 diferencias con Monday. Dos llamadas a la vez → una «ocupada». Un proceso muerto a medio paso →
el paso queda intentado, la corrida bloqueada hasta que vence el candado, y luego otra llamada la
termina (24 boards, 0 errores, 0 diferencias).

**Lo que falta, en orden:**
1. **Subir el código** (cuando el usuario lo diga): commit, unir con `origin/main` (conflictos en
   `monday.ts` y `supabase.ts`), renombrar `20261111120000_tableros_sincronizacion.sql` (choca con
   `20261111120000_encuestas_cku_entregable.sql`), lint/typecheck/tests/build y push. Producción sigue
   leyendo de Monday (sin `FUENTE_DATOS` en Vercel).
2. **Programar en Supabase:** activar `pg_cron` y `pg_net`; guardar en el Vault la URL de producción y
   el `CRON_SECRET`; un job cada minuto que llame `/api/cron/tableros-sync` con
   `Authorization: Bearer`. Apagar la tarea del Programador de Windows. Observar 2–3 días en
   Migración (corridas «en la nube», ok, 0 diferencias).
3. **Encender:** `FUENTE_DATOS=tableros` en Vercel (Production) y volver a desplegar. Para volver atrás:
   borrar la variable y desplegar.
