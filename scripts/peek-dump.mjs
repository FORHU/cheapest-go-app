import { Decompress } from 'fzstd';

const URL = 'https://int-partner-feedora.s3.eu-central-1.amazonaws.com/feed/partner_feed_en_v3.jsonl.zst?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA4ONZC7PJGJAEYGMK%2F20260821%2Feu-central-1%2Fs3%2Faws4_request&X-Amz-Date=20260821T064337Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=b979a7d472f43e33f6db5eaded252f01f9175bfa61cb8d9cee679e885f4568f5';

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
