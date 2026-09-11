/**
 * Long messages where no paragraph repeats, so the engine has nothing to collapse — the
 * honest test of whether it translates all of a long message, and how long it takes.
 *
 * Each paragraph carries a unique marker number and a unique amount, so a dropped or
 * merged paragraph shows up as a missing number.
 *
 *   npx tsx scratch/probe-long-varied.ts
 */
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const base = env.match(/^CHAT_WONDER_API_URL=(.*)$/m)![1].trim().replace(/^"|"$/g, '').replace(/\/+$/, '');

const { buildPrompt, guardTranslation } = await import('../src/lib/server/support/translation');

const PLACES = ['서울', '부산', '제주', '도쿄', '오사카', '방콕', '마닐라', '세부', '다낭', '파리', '로마', '발리'];
const THINGS = ['호텔 예약', '항공권', '공항 픽업', '렌터카', '투어 상품', '여행자 보험', '좌석 업그레이드', '수하물 추가'];
const ISSUES = [
    '확인 메일을 받지 못했습니다',
    '결제가 두 번 청구되었습니다',
    '예약 내역이 앱에 보이지 않습니다',
    '현장에서 예약이 없다고 했습니다',
    '날짜가 잘못 입력되어 있었습니다',
    '환불이 아직 들어오지 않았습니다',
    '영수증 금액이 다르게 표시됩니다',
    '취소했는데 수수료가 부과되었습니다',
];

function build(chars: number): string {
    const parts: string[] = [];
    let n = 1;
    while (parts.join(' ').length < chars) {
        const place = PLACES[n % PLACES.length];
        const thing = THINGS[(n * 3) % THINGS.length];
        const issue = ISSUES[(n * 5) % ISSUES.length];
        parts.push(`[${n}] ${place}의 ${thing} 건입니다. ${issue}. 금액은 ${(n * 137 + 1000).toLocaleString('en')}원이었습니다.`);
        n++;
    }
    return parts.join('\n').slice(0, chars);
}

async function once(text: string) {
    const t0 = Date.now();
    const { session_id } = await (await fetch(`${base}/session-id`)).json() as { session_id: string };
    const res = await fetch(`${base}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ session_id, user_input: buildPrompt(text, 'en') }),
        signal: AbortSignal.timeout(180_000),
    });
    const body = await res.json() as { response?: string };
    return { ms: Date.now() - t0, raw: body.response ?? '' };
}

const markers = (s: string) => new Set((s.match(/\[(\d+)\]/g) ?? []));

for (const chars of [800, 1500, 2500, 4000]) {
    const text = build(chars);
    const want = markers(text);
    const r = await once(text);
    const g = guardTranslation(r.raw, text, 'en') ?? '';
    const got = markers(g);
    const missing = [...want].filter(m => !got.has(m));
    console.log(
        `${String(chars).padStart(5)} chars, ${want.size} paras: ${(r.ms / 1000).toFixed(1)}s, ` +
        `reply ${r.raw.length} chars (×${(r.raw.length / text.length).toFixed(2)}), ` +
        `${g ? `${want.size - missing.length}/${want.size} paras present` : 'REJECTED'}` +
        (missing.length ? `, missing ${missing.slice(0, 8).join(' ')}${missing.length > 8 ? '…' : ''}` : ''),
    );
    if (!g || missing.length) console.log(`      tail: ${JSON.stringify(r.raw.slice(-160))}`);
}
