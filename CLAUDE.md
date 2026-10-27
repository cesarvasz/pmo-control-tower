@AGENTS.md

# Notas específicas para Claude Code

Todo lo del proyecto (stack, arquitectura, patrones, dominio, git) está en `AGENTS.md`, importado arriba. Aquí solo va lo propio de Claude Code y de esta máquina.

## Forma de trabajar con el usuario

- Responde en español. El usuario avanza paso a paso y valida en localhost antes de seguir: termina cada cambio con lint + typecheck + tests en verde y el dev server corriendo para que lo pruebe.
- Commitear localmente está bien cuando conviene; **push a `main` solo cuando lo diga** ("push a main" o equivalente).
- Cuando una regla de negocio no está clara (cómo medir una plantilla nueva, qué cuenta como "confirmado"…), pregunta en lugar de inventarla, y si la propones tú, dilo explícitamente.

## Entorno Windows

- **No edites archivos con PowerShell** (`Get-Content` / `Set-Content` / `Out-File`): el roundtrip corrompe tildes, ñ y "—" a mojibake aunque pases `-Encoding utf8`. Usa Edit/Write o Bash.
- **Un solo `next dev` por carpeta.** Detener la tarea de fondo no mata los procesos hijos de Turbopack; si aparece "Another next dev server is already running" o :3000 sirve 500 viejos:
  ```powershell
  Get-CimInstance Win32_Process -Filter "name='node.exe'" | ? CommandLine -like '*pmo-app*next*' | % { taskkill /PID $_.ProcessId /F }
  ```
- Si tras tocar `next.config.ts` todas las rutas fallan (`ComponentMod.handler is not a function`), el caché quedó corrupto: borra `.next/` y reinicia.
- Las variables `NEXT_PUBLIC_*` se leen al arrancar: si cambias `.env.local`, reinicia el dev server.
- `auth/configuration-not-found` al iniciar sesión con Google = el proveedor no está habilitado en la consola de Firebase, no es un problema del `.env`.

## Recursos del workspace

- Skill `/status-pdf` (en `../.claude/skills/status-pdf`): reporte ejecutivo por proyecto en PDF; su spec está en `../.claude/statusPDF/pmo-status-ejecutivo.md` y la paleta en `src/lib/reportTheme.ts`.
- Los `.gs` de `apps-script/` no se despliegan desde aquí: se pegan en script.google.com. Si cambias uno, avisa al usuario y actualiza su README.
- Pendiente conocido: `CRON_SECRET` aún no está configurado en Vercel.
