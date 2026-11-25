-- Bot de Google Chat · archivos del formulario «Nueva iniciativa». Google Chat no tiene un control para subir archivos
-- dentro de un formulario: el formulario abre una página de la app (/archivos-iniciativa/<código firmado>) donde la persona
-- sube sus archivos a un BORRADOR (el id que el bot le dio a ese formulario al abrirlo). Al tocar «Crear iniciativa», el
-- servidor MUEVE los archivos a la bitácora de la iniciativa (elemento_archivos, mismo bucket "tableros") y borra estas filas.
--
-- google_chat_borrador_archivos   un archivo subido a un borrador. Va por CORREO (el del código firmado), no por usuario de
--                                 la app: casi ningún CKU tiene cuenta. Los borradores que nunca se usan se borran solos
--                                 (con su archivo en Storage) a los 2 días.

create table public.google_chat_borrador_archivos (
  id         uuid primary key default gen_random_uuid(),
  borrador   uuid not null,                                  -- el formulario abierto (lo genera el bot)
  email      text not null check (email = lower(email)),     -- quien sube (del código firmado)
  ruta       text not null unique,                           -- ruta dentro del bucket "tableros" (chat-borradores/…)
  nombre     text not null,
  tamano     bigint,
  tipo_mime  text,
  estado     text not null default 'pendiente' check (estado in ('pendiente', 'listo')),
  creado_at  timestamptz not null default now()
);
create index google_chat_borrador_archivos_borrador_idx on public.google_chat_borrador_archivos (borrador, email);
create index google_chat_borrador_archivos_creado_idx   on public.google_chat_borrador_archivos (creado_at);

alter table public.google_chat_borrador_archivos enable row level security;
revoke all on table public.google_chat_borrador_archivos from anon, authenticated;
grant select, insert, update, delete on table public.google_chat_borrador_archivos to service_role;
