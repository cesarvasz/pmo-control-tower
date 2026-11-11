-- Tableros · Fase 5: adjuntos de la bitácora y respuestas a las actualizaciones.
-- Hasta ahora un archivo pertenecía a una COLUMNA de archivo. Ahora también puede pertenecer a un
-- COMENTARIO de la bitácora (los adjuntos de los Updates de Monday, y los que se suban en la app),
-- y un comentario puede ser la RESPUESTA a otro.

alter table public.elemento_comentarios
  add column if not exists respuesta_a uuid references public.elemento_comentarios (id) on delete cascade;

comment on column public.elemento_comentarios.respuesta_a is
  'Si es una respuesta, el comentario (actualización) al que responde. Monday solo anida un nivel.';

create index if not exists elemento_comentarios_respuesta_a
  on public.elemento_comentarios (respuesta_a) where respuesta_a is not null;

alter table public.elemento_archivos
  add column if not exists comentario_id uuid references public.elemento_comentarios (id) on delete set null;

comment on column public.elemento_archivos.comentario_id is
  'Si el archivo es un adjunto de la bitácora: el comentario al que pertenece (entonces columna_id es null).';

-- Un archivo es de una columna O de un comentario, no de los dos.
alter table public.elemento_archivos
  drop constraint if exists elemento_archivos_columna_o_comentario;
alter table public.elemento_archivos
  add constraint elemento_archivos_columna_o_comentario check (columna_id is null or comentario_id is null);

create index if not exists elemento_archivos_comentario_id
  on public.elemento_archivos (comentario_id) where comentario_id is not null;
