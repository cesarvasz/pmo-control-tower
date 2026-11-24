// Bot de Google Chat · una página mínima de resultado (p. ej. al volver de autorizar Drive). Lógica PURA.

import { escapar } from "./respuestas";

export function paginaResultado(o: { ok: boolean; texto: string }): string {
  const color = o.ok ? "#137333" : "#b3261e";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>PMO Control Tower · Google Drive</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;color:#1f2328">
<main style="max-width:480px;margin:15vh auto;padding:24px;background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
<h1 style="font-size:18px;margin:0 0 12px;color:${color}">${o.ok ? "Drive conectado" : "No se pudo conectar"}</h1>
<p style="margin:0;line-height:1.5">${escapar(o.texto)}</p>
<p style="margin:16px 0 0;color:#5f6368;font-size:13px">Ya puedes cerrar esta pestaña.</p>
</main></body></html>`;
}
