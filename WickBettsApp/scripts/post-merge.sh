#!/bin/bash
set -e

# Install / sync dependencies
pnpm install --frozen-lockfile

# Rebuild lib/db type declarations so api-server typecheck
# picks up any new schema tables added by merged tasks.
# The API server applies Drizzle migrations automatically on startup,
# so no separate schema-push step is needed here.
cd lib/db && npx tsc -p tsconfig.json --noEmit false
cd - > /dev/null
