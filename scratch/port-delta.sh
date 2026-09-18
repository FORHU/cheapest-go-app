#!/usr/bin/env bash
# How far v1 has moved past each slice's watermark, today (docs/port-status.md).
#   bash scratch/port-delta.sh          commit counts per slice
#   bash scratch/port-delta.sh -v       the commits themselves
set -u
cd "$(dirname "$0")/.." || exit 1
VERBOSE=${1:-}

slice() {
  local name=$1 watermark=$2; shift 2
  local commits
  commits=$(git log "${watermark}..HEAD" --oneline -- "$@" 2>/dev/null | wc -l | tr -d ' ')
  printf '%-34s %-10s %s commits\n' "$name" "$watermark" "$commits"
  if [ -n "$VERBOSE" ] && [ "$commits" != "0" ]; then
    git log "${watermark}..HEAD" --oneline -- "$@" | sed 's/^/      /'
    git diff --shortstat "${watermark}..HEAD" -- "$@" | sed 's/^/      /'
    echo
  fi
}

slice "C0a backend consolidation" 12f2af3 src/lib/server/ src/app/api/
slice "C0b locale + SEO" e79f354 src/middleware.ts src/i18n/ src/lib/seo/ src/app/robots.ts src/app/sitemap.ts src/locales/
slice "C1 hotel search" 8ef657b src/lib/server/stays/ src/lib/server/search.ts src/lib/search/ src/lib/constants/cityAliases.ts src/lib/geolocation.ts src/lib/property/ src/lib/room/ src/app/api/search/ src/app/api/autocomplete/ src/app/api/stays/ src/components/search/ src/components/property/ src/stores/searchStore.ts
slice "C2 hotel booking" 8bdd4a4 src/app/api/booking/ src/app/api/webhooks/ src/lib/server/bookings.ts src/lib/server/checkout.ts src/lib/server/policy-normalizer.ts src/lib/server/cancellation-engine.ts src/lib/server/refunds.ts src/lib/bookings/ src/lib/cancellation.ts src/lib/pricing.ts src/lib/currency.ts
slice "C3 flights" 8bdd4a4 src/lib/server/flights/ src/app/api/flights/ src/app/api/internal/ src/types/flights.ts src/utils/flight-utils.ts
slice "C4 account" 8bdd4a4 src/app/api/auth/ src/app/api/account/ src/app/api/preferences/ src/app/api/saved-trips/ src/app/api/price-alerts/ src/app/api/voucher/ src/lib/server/auth.ts src/stores/authStore.ts
slice "C5 admin" 6b0ced4 src/app/api/admin/ src/lib/server/admin/
slice "C6 ops" 8bdd4a4 src/app/api/cron/ src/app/api/fn/ scripts/ .github/workflows/
slice "C7 mobile and misc" 8bdd4a4 src/app/api/mobile/ src/app/api/invoice/ src/app/api/weather/ src/app/api/email/ src/app/api/google/ src/app/api/og/
echo
echo "Support (not in any slice):"
git log 6b0ced4..HEAD --oneline -- src/lib/server/support/ src/app/api/support/ src/components/support/ src/app/admin/\(dashboard\)/support/ 2>/dev/null | wc -l | sed 's/^/  /;s/$/ commits/'
