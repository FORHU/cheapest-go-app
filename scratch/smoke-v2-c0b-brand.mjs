/**
 * C0b (locale and SEO shell): the second brand is actually servable.
 *
 * Started with the *pre-rebrand* NEXT_PUBLIC_BRAND_NAME=GeomeeGo, the way the Korean
 * instance still runs until it is rebuilt. Everything on screen must read AirangGo —
 * including the privacy and cookie policies, which state which site collects the
 * reader's data, and the share card, which is the one surface a visitor sees before
 * they ever reach the site.
 *
 *   NEXT_PUBLIC_BRAND_NAME=GeomeeGo npx next dev --turbo --port 3210   # in app-v2
 *   node scratch/smoke-v2-c0b-brand.mjs
 */
const BASE = process.env.BASE ?? 'http://localhost:3210';

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures++;
};

const get = async (path) => {
    const res = await fetch(`${BASE}${path}`, { headers: { 'Accept-Language': 'en' } });
    return { status: res.status, html: await res.text() };
};

/** The old name must not survive anywhere — it is the spelling the rebrand replaced. */
const names = (html) => ({
    airang: html.includes('AirangGo'),
    legacy:  html.includes('GeomeeGo'),
    primary: html.includes('CheapestGo'),
});

for (const [path, what] of [
    ['/privacy', 'the privacy policy'],
    ['/cookies', 'the cookie policy'],
    ['/terms',   'the terms'],
    ['/refund',  'the refund policy'],
    ['/login',   'the sign-in page'],
]) {
    const { status, html } = await get(path);
    const n = names(html);
    check(`${what} loads`, status === 200, String(status));
    check(`${what} names AirangGo`, n.airang);
    check(`${what} never names CheapestGo`, !n.primary);
    check(`${what} never shows the pre-rebrand name`, !n.legacy);
}

// The share card and the tab title come from the root layout, not from the page.
const home = await get('/');
check('the home page loads', home.status === 200, String(home.status));
check('the tab title is the brand', /<title>[^<]*AirangGo/.test(home.html), (home.html.match(/<title>[^<]*<\/title>/) ?? [''])[0]);
check('the share card names the brand', /og:site_name" content="AirangGo"/.test(home.html)
    || /property="og:site_name"[^>]*AirangGo/.test(home.html));
check('no CheapestGo anywhere on the home page', !home.html.includes('CheapestGo'));

// A Korean reader gets Korean copy, branded the same way.
const ko = await get('/ko/privacy');
check('/ko/privacy loads', ko.status === 200, String(ko.status));
check('and is still branded AirangGo', ko.html.includes('AirangGo'));

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
