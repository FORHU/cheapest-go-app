/**
 * What does ChatWonder return for a 4,000-character message? The size probe got a 260-char
 * reply that passed the guard — print it, and find where the collapse starts.
 *
 *   npx tsx scratch/probe-long-4000.ts
 */
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const base = env.match(/^CHAT_WONDER_API_URL=(.*)$/m)![1].trim().replace(/^"|"$/g, '').replace(/\/+$/, '');

const { buildPrompt } = await import('../src/lib/server/support/translation');

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
    const body = await res.json() as { response?: string };
    return { ms: Date.now() - t0, raw: body.response ?? '' };
}

for (const chars of [3200, 3500, 3800, 4000, 4000]) {
    const r = await once(build(chars));
    console.log(`${chars} chars, ${(r.ms / 1000).toFixed(1)}s, reply ${r.raw.length} chars:`);
    console.log(`   ${JSON.stringify(r.raw.slice(0, 300))}\n`);
}
