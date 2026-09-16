/**
 * C4 (account) against a running api-v2 on :4000 and its own database.
 *
 * What v1 learned the expensive way and v2 now enforces: a name has a maximum length, at every
 * door that writes one — register, and the profile update (v1 QA BG-9). Also checks the rules
 * that were already there did not move: a partial update, a rejected empty name, a password
 * change that proves the current one.
 *
 *   node scratch/smoke-v2-c4-account.mjs
 */
const BASE = 'http://localhost:4000/api/v2';
const run = Date.now();
let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures++;
};

const call = (path, init = {}) => fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
});

const email = `c4-smoke-${run}@example.test`;
const password = 'Smoke-password-1!';

// ── Register refuses a name past the cap, before the account exists.
const tooLong = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: `long-${run}@example.test`, password, first_name: 'a'.repeat(13_708) }),
});
check('register refuses a 13,708-character name', tooLong.status === 400, String(tooLong.status));

// ── An ordinary registration still works.
const registered = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, first_name: 'Ana', last_name: 'Reyes' }),
});
check('register accepts an ordinary name', registered.status === 201, String(registered.status));

const cookies = registered.headers.getSetCookie?.() ?? [];
const cookie = cookies.map(c => c.split(';')[0]).join('; ');
check('registration returns a session', cookie.includes('access_token'));

// ── The profile update is the door v1's long name came through.
const patchLong = await call('/users/profile', {
    method: 'PATCH',
    headers: { Cookie: cookie },
    body: JSON.stringify({ firstName: 'b'.repeat(200) }),
});
const patchLongBody = await patchLong.json().catch(() => ({}));
check('profile update refuses a long name', patchLong.status === 400, JSON.stringify(patchLongBody).slice(0, 80));

// ── And still accepts a real one, changing only what was sent.
const patchOne = await call('/users/profile', {
    method: 'PATCH',
    headers: { Cookie: cookie },
    body: JSON.stringify({ lastName: 'Reyes-Santos' }),
});
const patched = await patchOne.json().catch(() => ({}));
check('one field updates without blanking the other',
    patchOne.ok && patched.user?.lastName === 'Reyes-Santos' && patched.user?.firstName === 'Ana',
    JSON.stringify(patched.user ?? patched).slice(0, 80));

const nothing = await call('/users/profile', { method: 'PATCH', headers: { Cookie: cookie }, body: '{}' });
check('a request that changes nothing is refused', nothing.status === 400, String(nothing.status));

const empty = await call('/users/profile', {
    method: 'PATCH', headers: { Cookie: cookie }, body: JSON.stringify({ firstName: '   ' }),
});
check('an empty name is refused', empty.status === 400, String(empty.status));

// ── Password change proves the current one.
const wrongPassword = await call('/users/password', {
    method: 'PATCH', headers: { Cookie: cookie },
    body: JSON.stringify({ currentPassword: 'not-the-password', newPassword: 'Another-password-1!' }),
});
check('a password change with the wrong current password is refused', wrongPassword.status === 400, String(wrongPassword.status));

const changed = await call('/users/password', {
    method: 'PATCH', headers: { Cookie: cookie },
    body: JSON.stringify({ currentPassword: password, newPassword: 'Another-password-1!' }),
});
check('a password change with the right one is accepted', changed.ok, String(changed.status));

// ── Preferences round-trip.
const saved = await call('/users/preferences', {
    method: 'PATCH', headers: { Cookie: cookie }, body: JSON.stringify({ currency: 'KRW', locale: 'ko' }),
});
const read = await (await call('/users/preferences', { headers: { Cookie: cookie } })).json().catch(() => ({}));
check('preferences save and read back', saved.ok && read.preferences?.currency === 'KRW', JSON.stringify(read).slice(0, 60));

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
