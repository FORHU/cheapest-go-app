/**
 * The shipped translator, end to end, against live ChatWonder.
 *
 * Imports `translate()` itself rather than a copy of it, so this exercises the real prompt,
 * the real session handling and the real guard. The question it answers is not "does
 * ChatWonder translate" — that was measured — but "does the thing we ship ever store a
 * refusal as a customer's words". It must not, however often ChatWonder refuses.
 *
 *   npx tsx scratch/smoke-translation.ts
 */
import fs from 'fs';

// translation.ts reads its base URL from the environment.
const env = fs.readFileSync('.env', 'utf8');
process.env.CHAT_WONDER_API_URL = env.match(/^CHAT_WONDER_API_URL=(.*)$/m)![1].trim().replace(/^"|"$/g, '');

const { translate, planTranslation } = await import('../src/lib/server/support/translation');

const INBOUND = [
    '항공편 예약 내역을 찾을 수 없습니다.',
    '호텔에 도착했는데 제 예약이 없다고 합니다. 도와주세요.',
    '급해요! 공항인데 항공권이 취소되었어요. 도와주세요!',
    '예약 확인서를 받지 못했습니다. 결제는 완료되었습니다.',
    '카드에서 두 번 결제되었습니다.',
    '죄송하지만 날짜를 변경할 수 있을까요?',
];
const OUTBOUND: [string, 'ko' | 'ja' | 'zh'][] = [
    ['I have found your booking and resent the confirmation to your email.', 'ko'],
    ['Your refund has been sent and should arrive within five to ten working days.', 'ja'],
    ['Your refund has been sent and should arrive within five to ten working days.', 'zh'],
];

const LOOKS_LIKE_REFUSAL = /unable to assist|can(?:no|['’])t assist|cannot assist|with that\.?$/i;
let stored = 0, marked = 0, leaked = 0;

console.log('── inbound: customer (ko) → Agent (en), 3 runs each ──');
for (const text of INBOUND) {
    const target = planTranslation('guest', text, 'ko');
    for (let i = 0; i < 3; i++) {
        const out = await translate(text, target!);
        if (out === null) {
            marked++;
            console.log(`   [untranslated → original shown, flagged]  ${text.slice(0, 22)}…`);
        } else {
            stored++;
            // The failure this whole guard exists to prevent.
            if (LOOKS_LIKE_REFUSAL.test(out)) leaked++;
            console.log(`   ${LOOKS_LIKE_REFUSAL.test(out) ? '!!LEAK!! ' : ''}${out}`);
        }
    }
}

console.log('\n── outbound: Agent (en) → customer ──');
for (const [text, lang] of OUTBOUND) {
    const out = await translate(text, lang);
    if (out === null) marked++; else stored++;
    console.log(`   ${lang}: ${out ?? '[untranslated]'}`);
}

console.log(`\nstored ${stored}, shown as original ${marked}`);
console.log(leaked === 0
    ? 'OK — no refusal was ever stored as a customer’s words.'
    : `FAIL — ${leaked} refusal(s) reached the transcript.`);
process.exit(leaked ? 1 : 0);
