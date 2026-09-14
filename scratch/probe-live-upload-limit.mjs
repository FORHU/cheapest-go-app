/**
 * BG-16: does something in front of production refuse uploads by size before the app sees
 * them? Posts multipart bodies of increasing size to the customer attachment route with NO
 * session. The app itself answers 401 JSON ("Sign in to send a file") without storing
 * anything; a proxy limit shows up as a different status and an HTML body instead.
 * Read-only in effect: unauthenticated, nothing can be written.
 *   node scratch/probe-live-upload-limit.mjs
 */
const URL = 'https://cheapestgo.com/api/support/conversation/attachments';

for (const [label, bytes] of [['200 KB', 200 * 1024], ['1.5 MB', 1.5 * 1024 * 1024], ['4 MB', 4 * 1024 * 1024], ['9 MB', 9 * 1024 * 1024]]) {
    const form = new FormData();
    form.append('file', new Blob([Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(Math.round(bytes))])], { type: 'application/pdf' }), 'probe.pdf');
    const t = Date.now();
    try {
        const res = await fetch(URL, { method: 'POST', headers: { 'X-Requested-By': 'cheapestgo-client', Origin: 'https://cheapestgo.com' }, body: form });
        const text = await res.text();
        const kind = text.trimStart().startsWith('{') ? 'JSON' : text.trimStart().startsWith('<') ? 'HTML' : 'text';
        console.log(`${label.padEnd(7)} → ${res.status} ${kind} in ${Date.now() - t} ms  server: ${res.headers.get('server')}  ${text.replace(/\s+/g, ' ').slice(0, 110)}`);
    } catch (e) {
        console.log(`${label.padEnd(7)} → network error: ${e.message}`);
    }
}
