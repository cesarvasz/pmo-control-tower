-- Contraseña temporal: cuando un Admin le pone una contraseña temporal a un usuario
-- (desde /usuarios), la app lo obliga a cambiarla en su siguiente ingreso.
alter table public.app_users
  add column must_change_password boolean not null default false;
