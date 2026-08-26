import { Decompress } from 'fzstd';

// The feed URL is a presigned S3 link: it carries an AWS credential scope and a
// signature, expires an hour after it is issued, and so is passed in rather than
// committed. A previous hard-coded one sat in this public repo until it expired.
//   PARTNER_FEED_URL='<presigned url>' node scripts/peek-dump.mjs
const URL = process.env.PARTNER_FEED_URL;
if (!URL) {
    console.error('Set PARTNER_FEED_URL to a presigned feed URL.');
    process.exit(1);
}

const res = await fetch(URL);
if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

const dec = new TextDecoder();
let tail = '', count = 0;
const d = new Decompress(c => { tail += dec.decode(c, { stream: true }); });
const reader = res.body.getReader();

outer: while (true) {
    const { value, done } = await reader.read();
    if (value) d.push(value, done);
    let nl;
    while ((nl = tail.indexOf('\n')) !== -1) {
        const line = tail.slice(0, nl).trim();
        tail = tail.slice(nl + 1);
        if (!line) continue;
        console.log(JSON.stringify(JSON.parse(line), null, 2));
        console.log('\n---\n');
        if (++count >= 3) { reader.cancel(); break outer; }
    }
    if (done) break;
}
