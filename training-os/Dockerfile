# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------
# TRAINING OS AI — image de production (Next.js standalone)
#   docker build -t trainingos:latest .
#   docker build --target tools -t trainingos-tools .   (migrations, seed, jobs)
# ---------------------------------------------------------------
# Miroir possible en cas de limite Docker Hub : --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Outils d'exploitation : migrations, création du super admin, tâches planifiées
FROM ${NODE_IMAGE} AS tools
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src ./src
# Même volume de fichiers que l'application (certificats générés par le seed / les scripts)
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
CMD ["npm", "run", "db:migrate"]

# Image d'exécution minimale, utilisateur non-root
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/storage && chown node:node /app/storage
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
