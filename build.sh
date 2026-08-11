#!/usr/bin/env sh
set -eu

cd WickBettsApp

if ! command -v pnpm >/dev/null 2>&1; then
	corepack enable
	corepack prepare pnpm@11.1.1 --activate
fi

pnpm run railway:build
