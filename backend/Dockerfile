# syntax=docker/dockerfile:1.7
# ------------------------------------------------------------------
# Etapa 1: dependencias completas + compilacion TypeScript
# ------------------------------------------------------------------
FROM node:22.21.1-alpine AS build
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json jest.config.js ./
COPY src ./src
COPY test ./test
RUN npm run build

# ------------------------------------------------------------------
# Etapa 2: solo dependencias de produccion
# ------------------------------------------------------------------
FROM node:22.21.1-alpine AS deps
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ------------------------------------------------------------------
# Etapa 3: imagen final minima, usuario sin privilegios, manejo de senales
# ------------------------------------------------------------------
FROM node:22.21.1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    BACKEND_PORT=3000
# dumb-init reenvia SIGTERM a Node para un apagado limpio (enableShutdownHooks)
RUN apk add --no-cache dumb-init wget
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:${BACKEND_PORT}/api/v1/health/ready || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
