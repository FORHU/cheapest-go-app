/**
 * Which pieces of a long message lose paragraphs, and how? Prints each piece's raw reply.
 *
 *   npx tsx scratch/probe-long-pieces.ts
 */
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const base = env.match(/^CHAT_WONDER_API_URL=(.*)$/m)![1].trim().replace(/^"|"$/g, '').replace(/\/+$/, '');

const { buildPrompt, guardTranslation, chunkForTranslation } = await import('../src/lib/server/support/translation');

const PLACES = ['서울', '부산', '제주', '도쿄', '오사카', '방콕', '마닐라', '세부', '다낭', '파리', '로마', '발리'];
const THINGS = ['호텔 예약', '항공권', '공항 픽업', '렌터카', '투어 상품', '여행자 보험', '좌석 업그레이드', '수하물 추가'];
const ISSUES = [
    '확인 메일을 받지 못했습니다', '결제가 두 번 청구되었습니다', '예약 내역이 앱에 보이지 않습니다',
    '현장에서 예약이 없다고 했습니다', '날짜가 잘못 입력되어 있었습니다', '환불이 아직 들어오지 않았습니다',
    '영수증 금액이 다르게 표시됩니다', '취소했는데 수수료가 부과되었습니다',
];
function build(maxChars: number, oneLine: boolean): string {
    const parts: string[] = [];
    for (let n = 1; ; n++) {
        const p = `[${n}] ${PLACES[n % 12]}의 ${THINGS[(n * 3) % 8]} 건입니다. ${ISSUES[(n * 5) % 8]}. 금액은 ${(n * 137 + 1000).toLocaleString('en')}원이었습니다.`;
        if ([...parts, p].join(oneLine ? ' ' : '\n').length > maxChars) break;
        parts.push(p);
    }
    return parts.join(oneLine ? ' ' : '\n');
}

async function ask(input: string): Promise<string> {
    const { session_id } = await (await fetch(`${base}/session-id`)).json() as { session_id: string };
    const res = await fetch(`${base}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ session_id, user_input: input }),
    });
    return ((await res.json()) as { response?: string }).response ?? '';
}

const markers = (s: string) => (s.match(/\d{1,3}(?:,\d{3})+/g) ?? []);

for (const oneLine of [false, false, false]) {
    console.log(`══ 4000 chars, ${oneLine ? 'one line' : 'one paragraph per line'}`);
    const chunks = chunkForTranslation(build(4000, oneLine));
    const replies = await Promise.all(chunks.map(c => ask(buildPrompt(c.text, 'en'))));
    chunks.forEach((c, i) => {
        const raw = replies[i];
        const g = guardTranslation(raw, c.text, 'en');
        const inM = markers(c.text), outM = markers(g ?? '');
        console.log(`  piece ${i + 1}: ${c.text.length} chars, ${inM[0]}…${inM[inM.length - 1]} (${inM.length})`);
        console.log(`     reply ${raw.length} chars (×${(raw.length / c.text.length).toFixed(2)}), guard ${g ? 'PASS' : 'REJECT'}, markers ${outM.length}/${inM.length}`);
        if (outM.length !== inM.length) {
            console.log(`     head: ${JSON.stringify(raw.slice(0, 200))}`);
            console.log(`     tail: ${JSON.stringify(raw.slice(-200))}`);
        }
    });
    console.log();
}
