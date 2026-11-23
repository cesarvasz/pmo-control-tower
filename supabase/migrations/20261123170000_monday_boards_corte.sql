-- Corte de un board de Monday que no es tablero (hoy: el Directorio RH → tabla personas).
-- cortado_at NULL = Monday sigue mandando (la sincronización trae sus datos); con fecha = desde entonces manda la app:
-- la sincronización ya no lo importa y la app lo lee siempre de Supabase. (Los tableros usan tableros.sincroniza_monday.)

alter table public.monday_boards add column if not exists cortado_at timestamptz;

comment on column public.monday_boards.cortado_at is
  'Corte: desde esta fecha la app manda en los datos de este board (p. ej. Directorio RH → personas). NULL = Monday manda.';
