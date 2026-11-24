-- Bot de Google Chat: imágenes PNG de la Status Card que el bot muestra en el chat.
-- Bucket privado: sin políticas en storage.objects para anon/authenticated. El servidor (service_role) sube la imagen y
-- da una URL firmada de 7 días (Google Chat necesita un enlace que pueda abrir). Las de más de 8 días se borran solas
-- cuando se genera otra del mismo proyecto. Límite 5 MB, solo PNG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('google-chat', 'google-chat', false, 5242880, array['image/png'])
on conflict (id) do nothing;
