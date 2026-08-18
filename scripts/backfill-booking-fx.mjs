/**
 * Backfill locked FX rates onto bookings taken before the rate was recorded.
 *
 * See docs/adr/0008-fx-locked-at-booking-in-usd.md. Revenue is reported in USD at
 * the rate in force when the payment was taken; rows predating that rule have no
 * rate, so they are excluded from the blended totals until this runs.
 *
 * Rates come from the ECB via Frankfurter, which serves exact historical rates by
 * date for free. VND, TWD and AED are not ECB currencies and have no historical
 * source — those rows are marked 'estimated' at today's rate rather than being
 * silently guessed, so the dashboard can show how much of the total is soft.
 *
 * Idempotent: only touches rows where usd_amount IS NULL.
 *
 *   node scripts/backfill-booking-fx.mjs            # report only, writes nothing
 *   node scripts/backfill-booking-fx.mjs --apply    # perform the backfill
 */

import postgres from 'postgres';

const DB_URL = process.env.DATABASE_URL
    || 'postgresql://cheapestgo:cheapestgo@localhost:5433/cheapestgo?sslmode=disable';
const APPLY = process.argv.includes('--apply');

/** Currencies the ECB publishes. Anything else cannot be backfilled accurately. */
const ECB_CURRENCIES = new Set([
    'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD',
    'HUF', 'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD',
    'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
]);

const TABLES = [
    { name: 'unified_bookings', amount: 'total_price' },
    { name: 'bookings', amount: 'total_price' },
    { name: 'flight_bookings', amount: 'COALESCE(charged_price, total_price)' },
];

const rateCache = new Map();

/**
 * USD per 1 unit of `currency` on `date` (YYYY-MM-DD).
 * Returns null when the ECB has no series for that currency.
 */
async function historicalRate(currency, date) {
    const key = `${currency}:${date}`;
    if (rateCache.has(key)) return rateCache.get(key);

    let value = null;
    try {
        const res = await fetch(
            `https://api.frankfurter.dev/v1/${date}?base=USD&symbols=${currency}`,
            { signal: AbortSignal.timeout(10000) }
        );
        if (res.ok) {
            const json = await res.json();
            const perUsd = json?.rates?.[currency];
            // Frankfurter answers a weekend/holiday with the prior business day, which
            // is the rate that actually applied — json.date shows which was used.
            if (typeof perUsd === 'number' && perUsd > 0) value = 1 / perUsd;
        }
    } catch (err) {
        console.warn(`  ! rate lookup failed for ${currency} on ${date}: ${err.message}`);
    }

    rateCache.set(key, value);
    return value;
}

/** Today's rate, for currencies with no ECB history. */
async function fallbackRate(currency) {
    const key = `${currency}:today`;
    if (rateCache.has(key)) return rateCache.get(key);

    let value = null;
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
            const json = await res.json();
            const perUsd = json?.rates?.[currency];
            if (typeof perUsd === 'number' && perUsd > 0) value = 1 / perUsd;
        }
    } catch (err) {
        console.warn(`  ! fallback rate failed for ${currency}: ${err.message}`);
    }

    rateCache.set(key, value);
    return value;
}

const sql = postgres(DB_URL);

let totalPending = 0, totalWritten = 0, totalEstimated = 0, totalSkipped = 0;

console.log(APPLY ? 'Backfilling booking FX rates…\n' : 'DRY RUN — nothing will be written. Pass --apply to commit.\n');

for (const { name, amount } of TABLES) {
    const rows = await sql.unsafe(`
        SELECT id, ${amount} AS amt, COALESCE(currency, 'USD') AS currency,
               created_at::date AS booked_on
        FROM ${name}
        WHERE usd_amount IS NULL AND ${amount} IS NOT NULL
        ORDER BY created_at
    `);

    if (!rows.length) {
        console.log(`${name}: nothing to backfill`);
        continue;
    }

    console.log(`${name}: ${rows.length} row(s) pending`);
    totalPending += rows.length;

    for (const row of rows) {
        const currency = String(row.currency).toUpperCase();
        const date = row.booked_on instanceof Date
            ? row.booked_on.toISOString().slice(0, 10)
            : String(row.booked_on).slice(0, 10);

        let rate, source;
        if (currency === 'USD') {
            rate = 1;
            source = 'identity';
        } else if (ECB_CURRENCIES.has(currency)) {
            rate = await historicalRate(currency, date);
            source = 'ecb-historical';
        } else {
            rate = await fallbackRate(currency);
            source = 'estimated';
        }

        if (!rate) {
            console.warn(`  - ${row.id}: no rate for ${currency} on ${date}, leaving unconverted`);
            totalSkipped++;
            continue;
        }

        const usd = Number(row.amt) * rate;

        if (APPLY) {
            await sql.unsafe(
                `UPDATE ${name} SET usd_amount = $1, fx_rate = $2, fx_captured_at = $3, fx_source = $4 WHERE id = $5`,
                [usd.toFixed(4), rate.toFixed(10), `${date}T00:00:00Z`, source, row.id]
            );
        }

        if (source === 'estimated') totalEstimated++;
        totalWritten++;
        console.log(`  ${APPLY ? '✓' : '·'} ${date}  ${String(row.amt).padStart(12)} ${currency} → $${usd.toFixed(2).padStart(10)}  [${source}]`);
    }
}

console.log('\n─────────────────────────────────────────');
console.log(`pending:    ${totalPending}`);
console.log(`${APPLY ? 'written' : 'would write'}:    ${totalWritten}`);
console.log(`estimated:  ${totalEstimated}${totalEstimated ? '  ← no ECB history; shown as soft in the dashboard' : ''}`);
console.log(`skipped:    ${totalSkipped}${totalSkipped ? '  ← still excluded from blended totals' : ''}`);
if (!APPLY && totalWritten) console.log('\nRe-run with --apply to commit.');

await sql.end();
