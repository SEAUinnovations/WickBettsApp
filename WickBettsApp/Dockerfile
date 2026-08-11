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

COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build /app/artifacts/wick-betts/dist/public ./artifacts/wick-betts/dist/public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 8080

CMD ["node", "artifacts/api-server/dist/index.mjs"]
