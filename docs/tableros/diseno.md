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
uso se pasan al evaluador propio. Tras importar, el board de Monday queda de solo lectura.

---

## 7. Plan por fases

| Fase | Entrega | Cómo se valida |
|---|---|---|
| **0 · Base** ✓ | Registros, tablas, motor de permisos, `personas` importado del Directorio RH y ligado a usuarios. Página `/tableros` con pestañas Directorio, Permisos, Catálogo y Plan | tests del dominio + `TABLEROS_IT=1 npx vitest run src/features/tableros/datos/personas.integration.test.ts` (84 personas, 10 ligadas, 2ª corrida sin cambios) |
| **1 · Tablero** ✓ | Vista Tabla editable (pestaña Tableros): grupos, subitems, tipos básicos (texto, número, fecha, timeline, status, dropdown, persona, checkbox), crear/editar columnas y grupos, roles, historial (`tablero_historial`, función `tablero_cambiar_valor`). Todo cambio entra por el registro `datos/operaciones.ts`; los permisos por columna y "solo lo mío" ya se aplican en la puerta | `TABLEROS_IT=1 npx vitest run src/features/tableros/datos/tableros.integration.test.ts` (crea un tablero, lo usa y lo borra) |
| **2 · Plantillas + piloto** ✓ | Guardar como plantilla / crear desde plantilla (pestaña Plantillas); importar de Monday (`dominio/importar-monday.ts`, piloto PM-013: 31 elementos, 123 subelementos); adaptador de métricas y "Comparar con Monday" | `TABLEROS_IT=1 npx vitest run src/features/tableros/datos/piloto.integration.test.ts`: 0 diferencias en todos los ProjItem; EVM, salud y entregas idénticos |
| **3 · Completo** ✓ | Fórmulas (`dominio/formulas.ts`: parser propio, sintaxis de Monday + español; `dominio/calculos.ts` calcula fórmula/espejo/archivo y detecta ciclos; una fórmula puede tener rol si devuelve lo que el rol pide), espejo (dato del directorio o de un tablero ligado), relación entre tableros, bitácora (`elemento_comentarios`) y archivos (`elemento_archivos` + bucket privado `tableros`, subida directa con URL firmada). Importar trae fórmulas y espejos; "Traer bitácora y archivos" trae Updates y documentos de Monday (`datos/importar-extras.ts`) | piloto PM-013: 0 diferencias, fórmulas verificadas en 128 elementos, 68 actualizaciones y 9 archivos; prueba de punta a punta con un archivo real en Storage |
| **4 · Migración** ✓ | Pestaña Migración: Estrategia → Iniciativas → PML → 19 proyectos (orden por las relaciones); relaciones a tableros importados y espejos sobre ellas; tipos automáticos ID (autonumérico con prefijo, el "Item ID") y Creado (el "Creation log"); volver a importar conserva ids, permisos y lo que apunta al tablero; las columnas importadas conservan su id de Monday (Iniciativas y PML se procesan por id); personas fuera del directorio = aviso. Vista Gantt (registro `ui/vistas`) | `TABLEROS_IT=1 npx vitest run src/features/tableros/datos/portafolio.integration.test.ts`: 22 boards con 0 diferencias salvo una explicada (PM-018: Cost $ = esfuerzo × 9 + Costo adicional; la app de hoy ignora el adicional) |
| **5 · Corte** | Monday solo lectura → exportación final → se apaga la copia | — |
