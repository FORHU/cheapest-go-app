---
name: run-cheapest-go-app
description: Run, start, build, screenshot, verify, or smoke-test the cheapest-go-app Next.js web application. Use when asked to launch the app, check a page, test a feature, confirm a change works, or take a screenshot.
---

# run-cheapest-go-app

CheapestGo is a Next.js 15 travel booking app (hotels + flights). It runs as a standard dev server (`next dev --turbo`) on port 3099. The primary agent path is `smoke.sh` for route verification, and `chromium-cli` for interactive page inspection and screenshots.

All paths below are relative to the repo root (`cheapest-go-app/`).

---

## Prerequisites

```bash
node --version   # verified: v24.14.0
npm --version    # verified: 11.9.0
```

No additional OS packages needed for the dev server or curl-based smoke tests.

For `chromium-cli` (screenshots / interactive): needs Chromium installed on the agent's system.

---

## Setup

The app reads from `.env` at startup. A `.env` already exists in the repo with real Supabase URLs and placeholder tokens. The dev server starts without all tokens — pages that call external APIs will fail at runtime but the app boots fine.

**No extra env setup needed for smoke testing.** The server starts with the existing `.env`.

---

## Run — agent path (smoke test)

```bash
bash .claude/skills/run-cheapest-go-app/smoke.sh
```

This starts the dev server on port 3099, probes the key routes, prints HTTP codes and page titles, then shuts down. Exit code 0 = all routes OK.

Verified output (run in this session):

```
✓  200  /
✓  200  /search
✓  200  /trips
→  / title:      CheapestGo | Discover and Book Your Next Global Journey
→  /search title: Search Hotels & Stays | CheapestGo
Results: 4 passed, 0 failed
```

---

## Run — agent path (interactive / screenshot with chromium-cli)

Start the server in the background, then drive it with `chromium-cli`:

```bash
npm run dev -- --port 3099 &
sleep 10   # wait for Turbopack compile

# Navigate to the home page and take a screenshot
chromium-cli navigate http://localhost:3099
chromium-cli screenshot /tmp/cheapestgo-home.png

# Navigate to search
chromium-cli navigate http://localhost:3099/search
chromium-cli screenshot /tmp/cheapestgo-search.png

# Read page content
chromium-cli evaluate 'document.title'
chromium-cli evaluate 'document.querySelector("h1")?.textContent'

# Stop server when done
pkill -f "next dev"
```

Screenshots land at the path you specify (e.g. `/tmp/cheapestgo-home.png`).

---

## Run — human path

```bash
npm run dev
# Opens http://localhost:3000 in browser. Ctrl-C to stop.
# Not useful in headless environments.
```

---

## Build

```bash
npm run build
```

Requires all env vars to be valid (Supabase keys, Stripe keys, etc.) — the build does type-checking and may fail on missing values. For agent work, prefer the dev server.

---

## Key routes

| Route | What it is |
|---|---|
| `/` | Home / hero page |
| `/search` | Hotel + flight search |
| `/trips` | Booked trips (requires auth) — redirects to `/login` if unauthenticated |
| `/login` | Auth page |
| `/properties/[id]` | Hotel detail + booking flow |

---

## Gotchas

- **Port 3000 vs 3099**: `npm run dev` defaults to 3000. This skill always uses 3099 to avoid conflicts. Pass a different port as first arg to `smoke.sh` if needed.
- **`/trips` requires auth**: Returns 200 with a page shell but redirects to `/login` client-side if not authenticated. The smoke test counts 200 as passing.
- **`/api/health` does not exist**: Returns 404. Don't probe it — there's no health endpoint.
- **Turbopack compile delay**: First request after `npm run dev` triggers compilation (~4–6 s). The smoke script waits up to 30 s for the server to be ready before probing routes.
- **`pkill -f "next dev"` on Linux**: Works. On Windows use `taskkill /F /IM node.exe` (careful — kills all Node processes).
- **`lsof` not available in some containers**: Use `pkill -f "next dev"` instead to stop the server.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `EADDRINUSE` on port 3099 | `pkill -f "next dev"` then retry |
| Page loads but shows auth redirect | Expected for `/trips` without a session cookie — not a bug |
| `curl` returns 000 | Server not up yet; increase the wait loop in `smoke.sh` |
| Build fails with missing env var | Dev server (`npm run dev`) doesn't require all vars; use it instead of `npm run build` |
