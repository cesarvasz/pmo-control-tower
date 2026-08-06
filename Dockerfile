# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────
# PMO Dashboard — imagen de producción (Next.js 16, output "standalone").
# Build multi-etapa: el runner solo recibe .next/standalone (~36 MB) en vez
# de los ~711 MB de node_modules. Imagen final ≈ 190 MB.
# ─────────────────────────────────────────────────────────────────────────

# 20 es el mínimo soportado por Next 16 (engines: node >= 20.9.0) y el que
# usa el CI. 22 es el recomendado para producción.
ARG NODE_VERSION=22

# ── 1) deps — dependencias completas, cacheable ──────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
# libc6-compat: algunos binarios esperan glibc; Alpine usa musl.
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# ── 2) builder — compila la app ──────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Las NEXT_PUBLIC_* se incrustan en el bundle del cliente durante el build,
# por eso entran como build args y no como variables de ejecución.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_ALLOWED_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY} \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN} \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID} \
    NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID} \
    NEXT_PUBLIC_ALLOWED_DOMAIN=${NEXT_PUBLIC_ALLOWED_DOMAIN} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

RUN npm run build

# ── 3) runner — solo lo necesario para servir ────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# server.js y el subconjunto de node_modules que el tracing determinó.
COPY --from=builder --chown=node:node /app/.next/standalone ./
# standalone NO incluye estas dos carpetas: hay que copiarlas aparte.
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000

# /login es una página estática prerenderizada: no toca Firebase ni Monday,
# así que sirve como sonda barata de "el proceso responde HTTP".
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
