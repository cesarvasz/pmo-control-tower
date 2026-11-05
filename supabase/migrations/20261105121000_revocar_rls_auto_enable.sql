-- `public.rls_auto_enable()` es la función del event trigger `ensure_rls` que el
-- proyecto trae de fábrica (activa RLS en cada tabla nueva de `public`). Es
-- SECURITY DEFINER y quedó con EXECUTE para anon/authenticated. Como devuelve
-- `event_trigger` no se puede invocar por /rpc, pero se le quita el permiso
-- igual (el trigger sigue funcionando: no depende de EXECUTE) para dejar los
-- advisors de seguridad limpios.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
