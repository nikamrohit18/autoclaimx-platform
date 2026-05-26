FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/claims-service/package.json ./apps/claims-service/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/config/package.json ./packages/config/
COPY packages/db-client/package.json ./packages/db-client/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @autoclaimx/db-client generate
RUN pnpm --filter @autoclaimx/claims-service build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/claims-service/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/db-client/prisma ./prisma
EXPOSE 3001
CMD ["node", "dist/main"]
