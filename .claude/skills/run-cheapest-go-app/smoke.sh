#!/usr/bin/env bash
# Smoke driver for cheapest-go-app.
# Starts the Next.js dev server, probes key routes, prints results, then stops.
# Usage: bash .claude/skills/run-cheapest-go-app/smoke.sh [port]

set -euo pipefail

PORT=${1:-3099}
BASE="http://localhost:$PORT"

echo "▶ Starting Next.js dev server on port $PORT …"
npm run dev -- --port "$PORT" &
SERVER_PID=$!

cleanup() {
  echo "▶ Stopping server (PID $SERVER_PID) …"
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Wait up to 30 s for the server to become ready
echo "▶ Waiting for server …"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/" 2>/dev/null || echo "000")
  if [ "$code" = "200" ]; then
    echo "  ✓ Server ready after ${i}s"
    break
  fi
  sleep 1
done

echo ""
echo "▶ Route smoke test:"
PASS=0; FAIL=0
for path in "/" "/search" "/trips" "/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path" 2>/dev/null || echo "000")
  if [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "302" ]; then
    echo "  ✓  $code  $path"
    PASS=$((PASS+1))
  else
    echo "  ✗  $code  $path"
    FAIL=$((FAIL+1))
  fi
done

echo ""
echo "▶ Title checks:"
for path in "/" "/search"; do
  title=$(curl -s "$BASE$path" | grep -o '<title>[^<]*</title>' | head -1 || echo "(no title)")
  echo "  $path → $title"
done

echo ""
echo "▶ Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "  All routes OK." && exit 0 || exit 1
