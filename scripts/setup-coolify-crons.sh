#!/usr/bin/env bash
# setup-coolify-crons.sh
#
# Creates all scheduled tasks for cheapest-go-app in Coolify via the API.
#
# Usage:
#   1. Fill in the three variables below
#   2. chmod +x scripts/setup-coolify-crons.sh
#   3. ./scripts/setup-coolify-crons.sh
#
# Find your values in Coolify:
#   COOLIFY_URL     — the URL you access Coolify at (e.g. https://coolify.yourdomain.com)
#   COOLIFY_TOKEN   — Settings → API Tokens → Create Token
#   APP_UUID        — your app page URL contains it: /applications/<APP_UUID>

COOLIFY_URL="https://your-coolify-domain.com"
COOLIFY_TOKEN="your-coolify-api-token"
APP_UUID="your-app-uuid"

# The domain your app is deployed at (used in the curl commands)
APP_DOMAIN="https://your-app-domain.com"

# ─────────────────────────────────────────────────────────────────────────────

API="$COOLIFY_URL/api/v1/applications/$APP_UUID/scheduled-tasks"

create_task() {
    local name="$1"
    local schedule="$2"
    local command="$3"

    echo "Creating: $name ($schedule)"

    response=$(curl -s -w "\n%{http_code}" -X POST "$API" \
        -H "Authorization: Bearer $COOLIFY_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"$name\",
            \"command\": \"$command\",
            \"frequency\": \"$schedule\",
            \"enabled\": true
        }")

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -n -1)

    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo "  ✓ Created ($http_code)"
    else
        echo "  ✗ Failed ($http_code): $body"
    fi
}

CRON_HEADER="-H 'Authorization: Bearer \$CRON_SECRET'"

create_task "poll-pending-tickets"    "*/5 * * * *"   "curl -s -X GET $APP_DOMAIN/api/cron/poll-pending-tickets -H \"Authorization: Bearer \$CRON_SECRET\""
create_task "auto-recover"            "*/10 * * * *"  "curl -s -X GET $APP_DOMAIN/api/internal/auto-recover -H \"Authorization: Bearer \$CRON_SECRET\""
create_task "retry-emails"            "*/15 * * * *"  "curl -s -X POST $APP_DOMAIN/api/internal/retry-emails -H \"Authorization: Bearer \$CRON_SECRET\""
create_task "refresh-popular-flights" "*/30 * * * *"  "curl -s -X GET $APP_DOMAIN/api/cron/refresh-popular-flights -H \"Authorization: Bearer \$CRON_SECRET\""
create_task "warm-hotel-cache"        "0 1 * * *"     "curl -s -X GET $APP_DOMAIN/api/cron/warm-hotel-cache -H \"Authorization: Bearer \$CRON_SECRET\""
create_task "etg-reviews-sync"        "0 2 * * *"     "curl -s -X GET $APP_DOMAIN/api/cron/etg-reviews-sync -H \"Authorization: Bearer \$CRON_SECRET\""
create_task "cache-cleanup"           "0 3 * * *"     "curl -s -X GET $APP_DOMAIN/api/cron/cache-cleanup -H \"Authorization: Bearer \$CRON_SECRET\""
create_task "cleanup-sessions"        "0 4 * * *"     "curl -s -X GET $APP_DOMAIN/api/cron/cleanup-sessions -H \"Authorization: Bearer \$CRON_SECRET\""
create_task "sync-hotel-deals"        "0 5 * * *"     "curl -s -X GET $APP_DOMAIN/api/cron/sync-hotel-deals -H \"Authorization: Bearer \$CRON_SECRET\""
create_task "check-price-alerts"      "0 6 * * *"     "curl -s -X GET $APP_DOMAIN/api/cron/check-price-alerts -H \"Authorization: Bearer \$CRON_SECRET\""
create_task "duffel-balance-check"    "0 */6 * * *"   "curl -s -X GET $APP_DOMAIN/api/cron/duffel-balance-check -H \"Authorization: Bearer \$CRON_SECRET\""
create_task "sync-flight-deals"       "0 */6 * * *"   "curl -s -X GET $APP_DOMAIN/api/cron/sync-flight-deals -H \"Authorization: Bearer \$CRON_SECRET\""
create_task "otv-credit-check"        "0 */12 * * *"  "curl -s -X GET $APP_DOMAIN/api/cron/otv-credit-check -H \"Authorization: Bearer \$CRON_SECRET\""

echo ""
echo "Done. Check Coolify → your app → Scheduled Tasks to verify."
