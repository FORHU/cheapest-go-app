export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
    checkEnv();
    // Deploy workflow only runs docker run — no migration step. Ensure the
    // cache/stats tables exist so cache writes don't fail silently with
    // "relation does not exist" on fresh or reset databases.
    ensureTables().catch((e) =>
      console.error('[startup] ensureTables failed:', e.message)
    );
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

async function ensureTables() {
  // Use a computed specifier so webpack's static import resolver doesn't try
  // to bundle postgres (which needs Node.js native modules net/tls/crypto).
  // At runtime this resolves correctly in the Node.js process.
  const dbModule = '@/lib/db/postgres';
  const { getSqlAdmin } = await import(/* webpackIgnore: true */ dbModule as any);
  const sql = getSqlAdmin();
  await sql`
    CREATE TABLE IF NOT EXISTS public.hotel_search_cache (
      cache_key  text PRIMARY KEY,
      result     jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_hotel_search_cache_expires
      ON public.hotel_search_cache (expires_at)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS public.tgx_destination_cache (
      city_key         text PRIMARY KEY,
      destination_code text NOT NULL,
      created_at       timestamptz DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS public.hotel_search_stats (
      city_key         text PRIMARY KEY,
      country_code     text NOT NULL DEFAULT '',
      search_count     int  NOT NULL DEFAULT 1,
      last_searched_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  console.log('[startup] ensureTables: cache/stats tables OK');
}

function checkEnv() {
  // Keys that will cause a hard crash or total feature failure if absent
  const required: [string, string][] = [
    ['DATABASE_URL',                    'PostgreSQL — entire app non-functional'],
    ['DUFFEL_ACCESS_TOKEN',             'Duffel — flight search and booking disabled'],
    ['STRIPE_SECRET_KEY',               'Stripe — all payments will fail'],
    ['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'Stripe — checkout UI will not load'],
    ['TRAVELGATEX_API_KEY',             'TravelgateX/OTV — hotel search disabled'],
    ['GOOGLE_PLACES_API_KEY',           'Google Places — destination autocomplete disabled'],
    ['NEXT_PUBLIC_MAPBOX_TOKEN',        'Mapbox — map view will not load'],
  ];

  // Keys whose absence causes silent failure on a specific feature
  const optional: [string, string][] = [
    ['RESEND_API_KEY',          'Resend — booking confirmation emails will not send'],
    ['STRIPE_WEBHOOK_SECRET',   'Stripe — webhook signatures unverified, replay attacks possible'],
    ['FUNCTIONS_SECRET',        'Internal — /api/fn/* endpoints exposed without auth'],
    ['CRON_SECRET',             'Cron — /api/cron/* endpoints exposed without auth'],
    ['ETG_KEY_ID',              'ETG/RateHawk — hotel review sync cron will fail'],
    ['ETG_API_KEY',             'ETG/RateHawk — hotel review sync cron will fail'],
    ['SENTRY_DSN',              'Sentry — errors not tracked in production'],
    ['MYSTIFLY_USERNAME',       'Mystifly — flight provider onboarding incomplete'],
  ];

  const missing  = required.filter(([k]) => !process.env[k]);
  const warnings = optional.filter(([k]) => !process.env[k]);

  if (missing.length) {
    console.error('\n╔══════════════════════════════════════════════════════╗');
    console.error('║  [startup] MISSING REQUIRED ENVIRONMENT VARIABLES   ║');
    console.error('╚══════════════════════════════════════════════════════╝');
    for (const [key, impact] of missing) {
      console.error(`  ✗ ${key}\n    → ${impact}`);
    }
    console.error('');
  }

  if (warnings.length) {
    console.warn('\n[startup] Optional env vars not set (features affected):');
    for (const [key, impact] of warnings) {
      console.warn(`  ⚠  ${key}: ${impact}`);
    }
    console.warn('');
  }

  if (!missing.length && !warnings.length) {
    console.log('[startup] Environment OK — all variables present.');
  }
}
