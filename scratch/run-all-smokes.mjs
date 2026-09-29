/**
 * Every browser/API smoke check from this session, run one after another against the LOCAL dev
 * server (:3000) and database, with a pass/fail summary. Each script cleans up after itself.
 *   node scratch/run-all-smokes.mjs
 */
import { spawnSync } from 'child_process';

const SMOKES = [
    ['support: mobile widget not covered by nav', 'node', ['scratch/shots-support-mobile.mjs']],
    ['support: assignment rules (ADR-0041)', 'npx', ['tsx', 'scratch/smoke-assignment.ts']],
    ['support: long messages both sides (BG-14)', 'node', ['scratch/probe-bg14-both-sides.mjs']],
    ['support: attachments answer (BG-16, no bucket locally)', 'node', ['scratch/probe-bg16-attachments.mjs']],
    ['support: resolve refreshes widget (BG-17)', 'node', ['scratch/smoke-bg17-resolve-refresh.mjs']],
    ['BG-1 booking handoff between accounts', 'node', ['scratch/smoke-bg1-booking-handoff.mjs']],
    ['BG-6 nearby-place requests once each', 'node', ['scratch/trace-poi-photos.mjs']],
    ['BG-7 wishlist sign-in return', 'node', ['scratch/smoke-bg7-wishlist-login.mjs'], { FROM: '/flights/search?origin=MNL&destination=SIN&cabin=economy' }],
    ['BG-8 Hong Kong search (no Shenzhen)', 'node', ['scratch/smoke-country-search.mjs']],
    ['BG-9 name limit', 'node', ['scratch/smoke-bg9-name-limit.mjs']],
    ['BG-10 no lookup on selection, search works', 'node', ['scratch/smoke-bg10-no-prefetch.mjs']],
    ['BG-12 search history per account', 'node', ['scratch/smoke-bg12-search-history.mjs']],
    ['BG-15 reset password on a phone', 'node', ['scratch/repro-bg15-reset-password.mjs']],
    ['BG-18 checkout follows navbar currency', 'node', ['scratch/smoke-bg18-checkout-currency.mjs']],
    ['BG-19 proceed to payment twice (Stripe test)', 'node', ['scratch/repro-bg19-create-payment-twice.mjs']],
];

/** Scripts that print ✓/✗ fail on any ✗; the rest are judged by exit code plus a named expectation. */
const EXPECT = {
    'support: long messages both sides (BG-14)': (out) => /customer 4,000 Korean chars → 201/.test(out) && /admin 4,000-char reply → 201/.test(out) && /admin 5,000-char reply → 400/.test(out),
    'support: attachments answer (BG-16, no bucket locally)': (out) => (out.match(/→ 503/g) ?? []).length === 8,
    'BG-6 nearby-place requests once each': (out) => /(\d+) distinct URLs, \1 requests/.test(out) && /failing: 0/.test(out),
    'BG-8 Hong Kong search (no Shenzhen)': (out) => /matching \/shenzhen\/: 0/.test(out) && /"HK"/.test(out),
    'BG-15 reset password on a phone': (out) => !/inputsDisabled: true/.test(out) && /PUT \/api\/auth\/reset-password → 200/.test(out) && /sign in with the new password → 200/.test(out),
    'BG-19 proceed to payment twice (Stripe test)': (out) => {
        const ids = [...out.matchAll(/"paymentIntentId":"(pi_[^"]+)"/g)].map(m => m[1]);
        return ids.length === 2 && ids[0] === ids[1];
    },
    'support: mobile widget not covered by nav': (out) => /message box on top: true/.test(out) && /nav visible after close: true/.test(out),
};

const results = [];
for (const [label, cmd, args, extraEnv] of SMOKES) {
    const t = Date.now();
    process.stdout.write(`… ${label}\n`);
    const run = spawnSync(cmd, args, { encoding: 'utf8', shell: true, timeout: 10 * 60_000, env: { ...process.env, ...(extraEnv ?? {}) } });
    const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    const crosses = (out.match(/^✗.*$/gm) ?? []);
    const expectation = EXPECT[label];
    const ok = run.status === 0 && crosses.length === 0 && (!expectation || expectation(out));
    results.push({ label, ok, secs: Math.round((Date.now() - t) / 1000), crosses, tail: out.trim().split('\n').slice(-4).join('\n') });
    console.log(`${ok ? '✓' : '✗'} ${label} (${Math.round((Date.now() - t) / 1000)} s)`);
    if (!ok) console.log(out.trim().split('\n').slice(-12).map(l => `    ${l}`).join('\n'));
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} smoke checks passed`);
if (failed.length) console.log('failed:', failed.map(f => f.label).join(' | '));
process.exitCode = failed.length ? 1 : 0;
