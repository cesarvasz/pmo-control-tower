-- Tableros propios · Fase 6: el orden de los boards de Proyectos en la carpeta de Monday.
-- La app los muestra en ese orden (Control Tower, Costo UN…); al leer de los tableros de Supabase
-- se conserva con esta columna, que la copia de Monday llena en cada corrida (sincronizarTodo).
alter table public.monday_boards add column if not exists orden integer;

comment on column public.monday_boards.orden is
  'Posición del board en la carpeta de Proyectos de Monday (0 = primero). Solo boards de tipo proj; la llena sincronizarTodo.';
