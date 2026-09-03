#!/usr/bin/env bash
# Lanza toda la batería de pruebas: levanta un servidor estático, ejecuta las
# suites y lo apaga al terminar.
#
#   ./tests/run.sh
#
# Necesita Node y Playwright (npm i -g playwright && playwright install chromium).
set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8123}"
export BASE_URL="${BASE_URL:-http://127.0.0.1:$PORT}"
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"

echo "▸ Lógica (sin navegador)"
node tests/store.test.js || FAILED=1

npx --yes http-server -p "$PORT" -c-1 . >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT

for _ in $(seq 1 30); do
  curl -sf "$BASE_URL/index.html" >/dev/null && break
  sleep 0.3
done

for suite in app features ios; do
  echo
  echo "▸ ${suite}"
  node "tests/${suite}.test.js" || FAILED=1
done

echo
if [ "${FAILED:-0}" = "1" ]; then echo "✗ Hay pruebas en rojo"; exit 1; fi
echo "✓ Todo en verde"
