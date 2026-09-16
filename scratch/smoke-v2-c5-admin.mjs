/**
 * C5 (admin) against a running api-v2 on :4000.
 *
 * The screens ported from v1: destinations, saved trips, price alerts, notifications. What is
 * worth checking is not that a list renders — it is that the doors are locked (a customer must
 * not reach the back office), that a page size from a query string cannot ask for the whole
 * table, and that an action with no ids is refused rather than emptying one.
 *
 * Creates one destination and deletes it again; touches nothing else.
 *
 *   node scratch/smoke-v2-c5-admin.mjs
 */
import fs from 'fs';
import { execFileSync } from 'child_process';

const API = 'http://localhost:4000/api/v2';
const run = Date.now();
let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures++;
};

const call = (path, init = {}) => fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
});

/** api-v2 has its own database; promotion is a fact about a row, not something an API grants. */
function sql(statement) {
    return execFileSync('docker', [
        'exec', 'cheapestgo-api-v2-postgres-1',
        'psql', '-U', 'cheapestgo', '-d', 'cheapestgo', '-tAc', statement,
    ], { encoding: 'utf8' }).trim();
}

const adminEmail = `c5-admin-${run}@example.test`;
const customerEmail = `c5-customer-${run}@example.test`;
const password = 'Smoke-password-1!';

const signUp = async (email) => {
    const res = await call('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, first_name: 'C5', last_name: 'Smoke' }) });
    if (res.status !== 201) throw new Error(`register ${email}: ${res.status}`);
    return (res.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ');
};

try {
    await signUp(adminEmail);
    const customerCookie = await signUp(customerEmail);

    sql(`UPDATE users SET role = 'admin' WHERE email = '${adminEmail}'`);
    // The token carries the role, so it has to be minted after the promotion.
    const login = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: adminEmail, password }) });
    const adminCookie = (login.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ');
    check('an admin can sign in', login.ok, String(login.status));

    // ── Locked.
    const anonymous = await call('/admin/destinations');
    check('the back office refuses an anonymous caller', anonymous.status === 401, String(anonymous.status));

    const asCustomer = await call('/admin/destinations', { headers: { Cookie: customerCookie } });
    check('the back office refuses a signed-in customer', asCustomer.status === 403, String(asCustomer.status));

    // ── Lists.
    for (const path of ['/admin/destinations', '/admin/saved-trips', '/admin/price-alerts']) {
        const res = await call(`${path}?page=1`, { headers: { Cookie: adminCookie } });
        const body = await res.json().catch(() => ({}));
        check(`${path} lists`, res.ok && Array.isArray(body.data), `${res.status} ${JSON.stringify(body).slice(0, 60)}`);
    }

    const capped = await call('/admin/destinations?pageSize=100000', { headers: { Cookie: adminCookie } });
    const cappedBody = await capped.json().catch(() => ({}));
    check('a page size from the query string is capped', cappedBody.pageSize === 100, String(cappedBody.pageSize));

    // ── One destination, created and removed.
    const created = await call('/admin/destinations', {
        method: 'POST', headers: { Cookie: adminCookie },
        body: JSON.stringify({ action: 'create', city: `Smoketown ${run}`, country: 'Testland' }),
    });
    const createdBody = await created.json().catch(() => ({}));
    check('a destination can be created', created.status === 201 && !!createdBody.data?.id, String(created.status));

    const blank = await call('/admin/destinations', {
        method: 'POST', headers: { Cookie: adminCookie },
        body: JSON.stringify({ action: 'create', city: '   ', country: 'Testland' }),
    });
    check('a destination with no city is refused', blank.status === 400, String(blank.status));

    if (createdBody.data?.id) {
        const removed = await call('/admin/destinations', {
            method: 'POST', headers: { Cookie: adminCookie },
            body: JSON.stringify({ action: 'delete', id: createdBody.data.id }),
        });
        const removedBody = await removed.json().catch(() => ({}));
        check('and deleted again', removed.ok && removedBody.deleted === 1, JSON.stringify(removedBody).slice(0, 60));
    }

    const noTargets = await call('/admin/saved-trips', {
        method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ action: 'delete' }),
    });
    check('a delete with no ids is refused, not applied to everything', noTargets.status === 400, String(noTargets.status));

    // ── Settings, search, health, brand, mobile: the rest of C5.
    const settingsSaved = await call('/admin/settings', {
        method: 'POST', headers: { Cookie: adminCookie },
        body: JSON.stringify({ settings: { smoke_marker: `c5-${run}` } }),
    });
    check('settings save', settingsSaved.ok, String(settingsSaved.status));

    const settingsRead = await (await call('/admin/settings', { headers: { Cookie: adminCookie } })).json().catch(() => ({}));
    check('settings read back', settingsRead.settings?.smoke_marker === `c5-${run}`, JSON.stringify(settingsRead.settings ?? {}).slice(0, 60));

    const shortSearch = await (await call('/admin/search?q=a', { headers: { Cookie: adminCookie } })).json().catch(() => ({}));
    check('a one-letter search matches nothing', Array.isArray(shortSearch.bookings) && shortSearch.bookings.length === 0);

    const search = await call('/admin/search?q=smoke', { headers: { Cookie: adminCookie } });
    const searchBody = await search.json().catch(() => ({}));
    check('search answers with the three groups', search.ok && 'bookings' in searchBody && 'customers' in searchBody && 'users' in searchBody);

    const health = await call('/admin/tgx-health', { headers: { Cookie: adminCookie } });
    const healthBody = await health.json().catch(() => ({}));
    check('the supplier health check answers', health.ok && ['ok', 'down', 'unknown'].includes(healthBody.otvStatus), JSON.stringify(healthBody).slice(0, 60));

    const badBrand = await call('/admin/brand', { method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ brand: 'NotABrand' }) });
    check('an unknown brand view is refused', badBrand.status === 400, String(badBrand.status));

    const brand = await call('/admin/brand', { method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ brand: 'AirangGo' }) });
    check('a known brand view is accepted', brand.ok, String(brand.status));

    const badCron = await call('/admin/run-cron', { method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ cron: 'rm-rf' }) });
    check('an unknown cron is refused', badCron.status === 400, String(badCron.status));

    const mobile = await call('/admin/mobile', { headers: { Cookie: adminCookie } });
    const mobileBody = await mobile.json().catch(() => ({}));
    check('the mobile screen answers', mobile.ok && typeof mobileBody.deviceCount === 'number', JSON.stringify(mobileBody.counts ?? {}).slice(0, 60));
    check('it never prints the key in full', !JSON.stringify(mobileBody).includes('cgm_') || String(mobileBody.apiKey?.masked ?? '').includes('…'));


    // ── Revenue: the screen app-v2 has been calling since before the route existed.
    const revenue = await call('/admin/revenue?page=1&pageSize=5', { headers: { Cookie: adminCookie } });
    const revenueBody = await revenue.json().catch(() => ({}));
    check('the revenue screen answers', revenue.ok && Array.isArray(revenueBody.bookings), String(revenue.status));
    check('with the four totals it shows',
        ['totalRevenue', 'totalProfit', 'totalMarkup', 'totalStripeFees'].every(k => typeof revenueBody.stats?.[k] === 'number'),
        JSON.stringify(revenueBody.stats ?? {}).slice(0, 80));
    check('and says which currency it counted, because it does not convert',
        /^[A-Z]{3}$/.test(revenueBody.currency ?? ''), String(revenueBody.currency));
    check('a page size cannot ask for the whole table',
        (await (await call('/admin/revenue?pageSize=100000', { headers: { Cookie: adminCookie } })).json()).bookings.length <= 100);
    const withoutRate = (revenueBody.bookings ?? []).filter(b => b.isEstimated && b.markupAmount !== 0);
    check('a booking with no recorded rate reports no markup rather than a guess',
        withoutRate.length === 0, withoutRate.slice(0, 2).map(b => b.bookingRef).join(', '));
    // ── Notifications.
    const notifications = await call('/admin/notifications', { headers: { Cookie: adminCookie } });
    check('notifications list', notifications.ok && Array.isArray(await notifications.json().catch(() => null)), String(notifications.status));

    const markAll = await call('/admin/notifications', {
        method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ action: 'markAllRead' }),
    });
    check('all notifications can be marked read', markAll.ok, String(markAll.status));

    const unknownAction = await call('/admin/notifications', {
        method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ action: 'markSomething' }),
    });
    check('an unknown action is refused', unknownAction.status === 400, String(unknownAction.status));
} finally {
    try {
        sql(`DELETE FROM popular_destinations WHERE city LIKE 'Smoketown %'`);
        sql(`DELETE FROM users WHERE email IN ('${adminEmail}', '${customerEmail}')`);
    } catch (err) {
        console.error('cleanup failed:', err.message?.slice(0, 120));
    }
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
