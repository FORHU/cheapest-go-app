/**
 * How long a message can the translator take before it fails — by timeout, truncation, or
 * refusal? The send path caps a message at 4,000 characters (MAX_MESSAGE_LENGTH).
 *
 * Times one attempt per size with the raw prompt (so the timeout is visible rather than
 * swallowed), then runs the shipped translate() on the full 4,000.
 *
 *   npx tsx scratch/probe-long-messages.ts
 */
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const base = env.match(/^CHAT_WONDER_API_URL=(.*)$/m)![1].trim().replace(/^"|"$/g, '').replace(/\/+$/, '');
process.env.CHAT_WONDER_API_URL = base;

const { buildPrompt, guardTranslation, translate } = await import('../src/lib/server/support/translation');

// A realistic complaint, repeated with numbered paragraphs so truncation is detectable.
const PARA = '호텔에 도착했는데 제 예약이 없다고 합니다. 결제는 이미 완료되었고 확인 메일도 받았습니다. 프론트 직원은 시스템에 기록이 없다고 하고 다른 방도 없다고 합니다. ';
const build = (chars: number) => {
    let s = '', n = 1;
    while (s.length < chars) s += `(${n++}) ${PARA}`;
    return s.slice(0, chars);
};

async function once(text: string) {
    const t0 = Date.now();
    const { session_id } = await (await fetch(`${base}/session-id`)).json() as { session_id: string };
    const res = await fetch(`${base}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ session_id, user_input: buildPrompt(text, 'en') }),
        signal: AbortSignal.timeout(120_000),
    });
    const body = await res.json().catch(() => ({})) as { response?: string; detail?: unknown };
    return { ms: Date.now() - t0, status: res.status, raw: body.response ?? JSON.stringify(body).slice(0, 200) };
}

for (const chars of [500, 1000, 2000, 3000, 4000]) {
    const text = build(chars);
    const paras = (text.match(/\(\d+\)/g) ?? []).length;
    try {
        const r = await once(text);
        const g = guardTranslation(r.raw, text, 'en');
        const outParas = (g?.match(/\(\d+\)/g) ?? []).length;
        console.log(
            `${String(chars).padStart(5)} chars (${paras} paras): HTTP ${r.status}, ${(r.ms / 1000).toFixed(1)}s, ` +
            `reply ${r.raw.length} chars, ${g ? `usable, ${outParas}/${paras} paras kept` : 'REJECTED'}`,
        );
        if (!g) console.log(`      raw: ${JSON.stringify(r.raw.slice(0, 160))}`);
    } catch (e) {
        console.log(`${String(chars).padStart(5)} chars: FAILED ${(e as Error).name}: ${(e as Error).message}`);
    }
}

console.log('\nshipped translate() on 4,000 chars (15s timeout, 3 attempts):');
const t0 = Date.now();
const out = await translate(build(4000), 'en');
console.log(`   ${out ? `translated, ${out.length} chars` : 'null → original shown, marked untranslated'} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
