FROM node:22.14.0-bookworm-slim AS build
WORKDIR /app

RUN npm install -g pnpm@11.21.0

COPY . .

RUN pnpm install --frozen-lockfile
RUN PORT=3000 BASE_PATH=/ pnpm run railway:build

FROM node:22.14.0-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# pnpm itself is only installed in the `build` stage above and is NOT
# preserved by any of the COPY --from=build lines below, so without this the
# preDeployCommand ("pnpm --filter @workspace/db push-force", configured in
# Railway's service settings, not in this file) fails immediately with
# "pnpm: No such file or directory" before the app ever starts.
RUN npm install -g pnpm@11.21.0

COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build /app/artifacts/wick-betts/dist/public ./artifacts/wick-betts/dist/public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# lib/db's own source is required at runtime too: the preDeployCommand runs
# `pnpm --filter @workspace/db push-force`, which needs this workspace
# package's package.json (to resolve the filter + the "push-force" script)
# and drizzle.config.ts + src/schema (drizzle-kit reads these from disk, not
# from node_modules) to actually diff/push the schema against DATABASE_URL.
COPY --from=build /app/lib/db/package.json ./lib/db/package.json
COPY --from=build /app/lib/db/drizzle.config.ts ./lib/db/drizzle.config.ts
COPY --from=build /app/lib/db/src ./lib/db/src

EXPOSE 8080

CMD ["node", "artifacts/api-server/dist/index.mjs"]
