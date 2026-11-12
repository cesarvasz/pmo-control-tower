-- Tableros · sincronización POR PASOS (camino a producción).
-- En Vercel una función se corta a los 60 s y la corrida completa tarda 2–3 min: la corrida se parte
-- en pasos que se guardan aquí; cada llamada (pg_cron cada minuto) avanza los que le alcancen.
--   pasos             la cola de pasos que faltan (el primero es el que sigue)
--   trabajando_hasta  candado: mientras no venza, otra llamada no toca esta corrida
--   latido            cuándo avanzó por última vez
--   origen 'nube'     la disparó el cron de producción (pg_cron → /api/cron/tableros-sync)

alter table public.tablero_sincronizaciones
  add column if not exists pasos jsonb not null default '[]'::jsonb,
  add column if not exists trabajando_hasta timestamptz,
  add column if not exists latido timestamptz;

alter table public.tablero_sincronizaciones drop constraint if exists tablero_sincronizaciones_origen_check;
alter table public.tablero_sincronizaciones
  add constraint tablero_sincronizaciones_origen_check check (origen in ('manual', 'programada', 'nube'));

comment on column public.tablero_sincronizaciones.pasos is 'Pasos que faltan de la corrida (el primero es el que sigue).';
comment on column public.tablero_sincronizaciones.trabajando_hasta is 'Candado: mientras no venza, otra llamada no avanza esta corrida.';
comment on column public.tablero_sincronizaciones.latido is 'Cuándo avanzó la corrida por última vez.';
