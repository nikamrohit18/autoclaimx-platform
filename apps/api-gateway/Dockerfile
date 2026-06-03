FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app

FROM base AS build
# Copy manifests first — this layer is cached until lockfile/package.json changes
COPY .npmrc package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api-gateway/package.json ./apps/api-gateway/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/config/package.json ./packages/config/
COPY packages/db-client/package.json ./packages/db-client/
RUN pnpm install --frozen-lockfile
# Copy source and build workspace packages in dependency order
COPY . .
RUN pnpm --filter @autoclaimx/shared-types build
RUN pnpm --filter @autoclaimx/config build
RUN DATABASE_URL=postgresql://placeholder/placeholder pnpm --filter @autoclaimx/db-client generate
RUN pnpm --filter @autoclaimx/db-client build
RUN pnpm --filter @autoclaimx/api-gateway build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api-gateway/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=build /app/packages/config/dist ./packages/config/dist
COPY --from=build /app/packages/config/package.json ./packages/config/package.json
COPY --from=build /app/packages/db-client/dist ./packages/db-client/dist
COPY --from=build /app/packages/db-client/package.json ./packages/db-client/package.json
EXPOSE 3000
CMD ["node", "dist/main"]
