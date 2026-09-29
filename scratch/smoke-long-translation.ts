/**
 * The shipped translate() on long messages, up to the 4,000-character cap: does all of it
 * come back, and how long does it take? Paragraph markers catch anything dropped.
 *
 *   npx tsx scratch/smoke-long-translation.ts
 */
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
process.env.CHAT_WONDER_API_URL = env.match(/^CHAT_WONDER_API_URL=(.*)$/m)![1].trim().replace(/^"|"$/g, '');

const { translate, chunkForTranslation } = await import('../src/lib/server/support/translation');

const PLACES = ['서울', '부산', '제주', '도쿄', '오사카', '방콕', '마닐라', '세부', '다낭', '파리', '로마', '발리'];
const THINGS = ['호텔 예약', '항공권', '공항 픽업', '렌터카', '투어 상품', '여행자 보험', '좌석 업그레이드', '수하물 추가'];
const ISSUES = [
    '확인 메일을 받지 못했습니다', '결제가 두 번 청구되었습니다', '예약 내역이 앱에 보이지 않습니다',
    '현장에서 예약이 없다고 했습니다', '날짜가 잘못 입력되어 있었습니다', '환불이 아직 들어오지 않았습니다',
    '영수증 금액이 다르게 표시됩니다', '취소했는데 수수료가 부과되었습니다',
];

/** Whole paragraphs only, so no marker belongs to a half-sentence cut off at the end. */
function build(maxChars: number, oneLine: boolean): string {
    const parts: string[] = [];
    for (let n = 1; ; n++) {
        const p = `[${n}] ${PLACES[n % 12]}의 ${THINGS[(n * 3) % 8]} 건입니다. ${ISSUES[(n * 5) % 8]}. 금액은 ${(n * 137 + 1000).toLocaleString('en')}원이었습니다.`;
        if ([...parts, p].join(oneLine ? ' ' : '\n').length > maxChars) break;
        parts.push(p);
    }
    return parts.join(oneLine ? ' ' : '\n');
}

// The amounts, not the [n] labels: each paragraph's amount is unique, and an amount is what
// an Agent needs verbatim. A missing amount is a dropped paragraph or a spelled-out figure.
const markers = (s: string) => new Set(s.match(/\d{1,3}(?:,\d{3})+/g) ?? []);
let failed = 0;

for (const [chars, oneLine] of [[1500, false], [4000, false], [4000, true]] as const) {
    const text = build(chars, oneLine);
    const want = markers(text);
    const t0 = Date.now();
    const out = await translate(text, 'en');
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const pieces = chunkForTranslation(text).length;
    const label = `${text.length} chars${oneLine ? ', one line' : ''}, ${pieces} piece(s)`;
    if (!out) {
        console.log(`${label}: untranslated (original shown, flagged) in ${secs}s`);
        continue;
    }
    const got = markers(out);
    const missing = [...want].filter(m => !got.has(m));
    if (missing.length) failed++;
    console.log(`${label}: ${secs}s, ${want.size - missing.length}/${want.size} paragraphs${missing.length ? ` — MISSING ${missing.join(' ')}` : ''}`);
}

console.log(failed ? `\nFAIL — ${failed} stored translation(s) were missing paragraphs.` : '\nOK — every stored translation had every paragraph.');
process.exit(failed ? 1 : 0);
