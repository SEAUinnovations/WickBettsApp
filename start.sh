#!/usr/bin/env sh
set -eu

cd WickBettsApp
exec node artifacts/api-server/dist/index.mjs
