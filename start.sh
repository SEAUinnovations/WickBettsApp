#!/usr/bin/env sh
set -eu

if [ -f artifacts/api-server/dist/index.mjs ]; then
	APP_DIR="."
elif [ -f WickBettsApp/artifacts/api-server/dist/index.mjs ]; then
	APP_DIR="WickBettsApp"
else
	echo "Could not find artifacts/api-server/dist/index.mjs in current directory or ./WickBettsApp" >&2
	exit 1
fi

cd "$APP_DIR"
exec node artifacts/api-server/dist/index.mjs
