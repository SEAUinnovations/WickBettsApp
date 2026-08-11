#!/usr/bin/env sh
set -eu

cd WickBettsApp

if command -v pnpm >/dev/null 2>&1; then
	pnpm run railway:build
	exit 0
fi

if command -v corepack >/dev/null 2>&1; then
	corepack enable || true
	corepack prepare pnpm@11.1.1 --activate
	corepack pnpm run railway:build
	exit 0
fi

echo "pnpm is not available and corepack is missing" >&2
exit 127
