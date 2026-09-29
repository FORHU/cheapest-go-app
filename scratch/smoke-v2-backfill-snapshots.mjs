/**
 * The policy-snapshot backfill, against synthetic bookings in api-v2's local database.
 *
 * Inserts four bookings that have a stored `cancellation_policy` but no snapshot — one of each
 * shape the backfill has to handle — then runs the script as a dry run, for real, and again.
 * Everything it inserts is removed afterwards. Never pointed at anything but the local
 * container.
 *
 *   node scratch/smoke-v2-backfill-snapshots.mjs
 */
import { execFileSync } from 'child_process';

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures++;
};

const sql = (statement) => execFileSync('docker', [
    'exec', 'cheapestgo-api-v2-postgres-1',
    'psql', '-U', 'cheapestgo', '-d', 'cheapestgo', '-tAc', statement,
], { encoding: 'utf8' }).trim();

const API_V2 = 'C:/Users/USER/Documents/GitHub/cheapestgo-api-v2';
const runBackfill = (...args) => execFileSync('npm', ['run', 'backfill-policy-snapshots', '--', ...args], {
    cwd: API_V2, encoding: 'utf8', shell: true,
    // The local container, whatever .env says — this smoke must never reach a remote database.
    env: { ...process.env, DATABASE_URL: 'postgresql://cheapestgo:cheapestgo@localhost:5434/cheapestgo' },
});

const run = Date.now();
const ref = (n) => `BF-SMOKE-${run}-${n}`;
const future = (days) => new Date(Date.now() + days * 86_400_000).toISOString();

const fixtures = [
    [ref('free'),   { refundableTag: 'RFN', cancelPolicyInfos: [] }],
    [ref('tiered'), { refundableTag: 'RFN', cancelPolicyInfos: [
        { cancelTime: future(20), amount: 50,  currency: 'PHP', type: 'PERCENT' },
        { cancelTime: future(10), amount: 100, currency: 'PHP', type: 'PERCENT' },
    ] }],
    [ref('nrfn'),   { refundableTag: 'NRFN', cancelPolicyInfos: [] }],
    [ref('none'),   null],
];

try {
    const userId = sql(`SELECT id FROM users LIMIT 1`);
    check('there is a user to own the fixtures', /^[0-9a-f-]{36}$/.test(userId), userId);

    for (const [bookingId, policy] of fixtures) {
        sql(`INSERT INTO bookings (booking_id, user_id, property_name, room_name, check_in, check_out, total_price,
                                   holder_first_name, holder_last_name, holder_email, currency, status, cancellation_policy)
             VALUES ('${bookingId}', '${userId}', 'Backfill Smoke Hotel', 'Room', current_date + 30, current_date + 32, 1000,
                     'Back', 'Fill', 'backfill@example.test', 'PHP', 'confirmed',
                     ${policy ? `'${JSON.stringify(policy)}'::jsonb` : 'NULL'})`);
    }
    const snapshotsFor = () => Number(sql(`SELECT count(*) FROM booking_policy_snapshots WHERE booking_id LIKE 'BF-SMOKE-${run}-%'`));

    // ── Dry run: says what it would do, writes nothing.
    const dry = runBackfill();
    check('a dry run names the database it is pointed at', /database: localhost:5434/.test(dry));
    check('a dry run writes nothing', snapshotsFor() === 0, `${snapshotsFor()} snapshots`);
    check('and lists the bookings it would give terms to', fixtures.slice(0, 3).every(([id]) => dry.includes(`would ${id}`)));
    check('and skips the one with nothing to derive terms from', dry.includes(`skip  ${ref('none')}`));

    // ── Apply.
    const applied = runBackfill('--apply');
    check('applied, it writes a snapshot for each readable booking', snapshotsFor() === 3, `${snapshotsFor()} snapshots`);
    check('and none for the unreadable one',
        sql(`SELECT count(*) FROM booking_policy_snapshots WHERE booking_id = '${ref('none')}'`) === '0');

    const typeOf = (id) => sql(`SELECT policy_type FROM booking_policy_snapshots WHERE booking_id = '${id}'`);
    check('a refundable rate with no steps is free cancellation', typeOf(ref('free')) === 'free_cancellation', typeOf(ref('free')));
    check('a refundable rate with steps is tiered, not free', typeOf(ref('tiered')) === 'tiered', typeOf(ref('tiered')));
    check('a non-refundable rate stays non-refundable', typeOf(ref('nrfn')) === 'non_refundable', typeOf(ref('nrfn')));

    const tiers = sql(`SELECT string_agg(penalty_amount::text || '@' || tier_order, ',' ORDER BY tier_order)
                         FROM policy_tiers t JOIN booking_policy_snapshots s ON s.id = t.snapshot_id
                        WHERE s.booking_id = '${ref('tiered')}'`);
    check('its steps are stored earliest deadline first', tiers === '100.00@0,50.00@1', tiers);

    const freeUntil = sql(`SELECT free_cancel_deadline IS NOT NULL FROM booking_policy_snapshots WHERE booking_id = '${ref('tiered')}'`);
    check('and it records when the rate stops being free', freeUntil === 't');

    check('the apply run reports no failures', /failed: 0/.test(applied), (applied.match(/done: .*/) ?? [''])[0]);

    // ── Again: nothing changes.
    const before = sql(`SELECT string_agg(id::text, ',' ORDER BY booking_id) FROM booking_policy_snapshots WHERE booking_id LIKE 'BF-SMOKE-${run}-%'`);
    runBackfill('--apply');
    const after = sql(`SELECT string_agg(id::text, ',' ORDER BY booking_id) FROM booking_policy_snapshots WHERE booking_id LIKE 'BF-SMOKE-${run}-%'`);
    check('running it again rewrites nothing that exists', before === after && snapshotsFor() === 3);
} finally {
    try {
        sql(`DELETE FROM policy_tiers WHERE snapshot_id IN (SELECT id FROM booking_policy_snapshots WHERE booking_id LIKE 'BF-SMOKE-%')`);
        sql(`UPDATE bookings SET policy_snapshot_id = NULL WHERE booking_id LIKE 'BF-SMOKE-%'`);
        sql(`DELETE FROM booking_policy_snapshots WHERE booking_id LIKE 'BF-SMOKE-%'`);
        sql(`DELETE FROM bookings WHERE booking_id LIKE 'BF-SMOKE-%'`);
    } catch (err) {
        console.error('cleanup failed:', err.message?.slice(0, 160));
    }
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
