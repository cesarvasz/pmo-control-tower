-- La encuesta NPS de un CKU ahora nace de un ENTREGABLE completado (item de la Fase 3 de un proyecto, Status Done en
-- Monday) y toma su nombre automáticamente. Se guarda el id del item para no crear dos encuestas del mismo entregable
-- y para que el botón del entregable muestre la que ya existe. Las encuestas anteriores (nombre manual) quedan con null.

alter table public.cku_surveys add column entregable_id text;

-- Un entregable (de un CKU) tiene una sola encuesta.
create unique index cku_surveys_entregable_uidx on public.cku_surveys (cku, entregable_id) where entregable_id is not null;
