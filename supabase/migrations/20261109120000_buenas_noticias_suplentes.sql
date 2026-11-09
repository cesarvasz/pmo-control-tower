-- Suplentes de «Buenas noticias» (portada). Antes: Firestore buenas_noticias_suplentes/list
-- con un mapa «lunes de la semana» → nombre. Ahora una fila por semana; sin fila = da las
-- buenas noticias quien toca por la rotación (lib/buenasNoticias.ts).

create table public.buenas_noticias_suplentes (
  semana      date primary key,          -- lunes de la semana
  nombre      text not null,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

alter table public.buenas_noticias_suplentes enable row level security;
revoke all on table public.buenas_noticias_suplentes from anon, authenticated;
grant select, insert, update, delete on table public.buenas_noticias_suplentes to service_role;
