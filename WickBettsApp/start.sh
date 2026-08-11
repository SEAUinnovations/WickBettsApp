#!/usr/bin/env sh
set -eu

exec node artifacts/api-server/dist/index.mjs
