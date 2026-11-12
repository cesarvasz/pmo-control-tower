@echo off
rem Sincronizacion con Monday (Tableros, Fase 5). La corre el Programador de tareas cada hora.
rem Bitacora de cada corrida: %TEMP%\pmo-tableros-sync.log (el detalle queda en /tableros -> Migracion).
cd /d "%~dp0.."
node scripts\tableros-sincronizar.mjs >> "%TEMP%\pmo-tableros-sync.log" 2>&1
