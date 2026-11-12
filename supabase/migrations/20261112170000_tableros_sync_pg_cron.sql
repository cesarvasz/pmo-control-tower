-- Tableros · sincronización con Monday EN LA NUBE (fase D, docs/tableros/diseno.md §11).
-- pg_cron llama CADA MINUTO a /api/cron/tableros-sync de producción con pg_net; la ruta sigue la
-- corrida abierta (~35 s por llamada) o abre una nueva cada hora.
--
-- El secreto NO va en este archivo: se lee del Vault de Supabase (nombre 'cron_secret', el mismo
-- valor que CRON_SECRET en Vercel). Se guarda una vez desde el SQL Editor:
--   select vault.create_secret('<valor de CRON_SECRET>', 'cron_secret');
-- Mientras no exista, el job no manda nada (el select no devuelve filas).
--
-- Para pausar:   select cron.unschedule('tableros-sync');
-- Para revisar:  select * from cron.job_run_details order by start_time desc limit 10;
--                select status_code, timed_out, error_msg, created from net._http_response order by created desc limit 10;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- cron.schedule con el mismo nombre reemplaza el job (idempotente).
select cron.schedule(
  'tableros-sync',
  '* * * * *',
  $job$
  select net.http_get(
    url := 'https://pmo-control-tower.vercel.app/api/cron/tableros-sync',
    headers := jsonb_build_object('Authorization', 'Bearer ' || s.decrypted_secret),
    -- La ruta trabaja hasta ~35 s (máx. 60 s en Vercel): se espera la respuesta completa.
    timeout_milliseconds := 58000
  )
  from vault.decrypted_secrets s
  where s.name = 'cron_secret';
  $job$
);

-- El historial de pg_cron crece 1 440 filas al día: se guarda una semana.
select cron.schedule(
  'limpiar-historial-cron',
  '30 9 * * *',
  $job$ delete from cron.job_run_details where end_time < now() - interval '7 days'; $job$
);
