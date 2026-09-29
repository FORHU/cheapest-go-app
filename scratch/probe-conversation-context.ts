/**
 * Does each message still make sense translated on its own, deep into a conversation?
 *
 * Production translates every message on a fresh session with no history (ADR-0034). Korean
 * drops subjects and objects freely and leans on "그거" / "아까 말한" ("that", "the one I
 * mentioned"), so later messages are the ones that depend on earlier ones.
 *
 *   npx tsx scratch/probe-conversation-context.ts
 */
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
process.env.CHAT_WONDER_API_URL = env.match(/^CHAT_WONDER_API_URL=(.*)$/m)![1].trim().replace(/^"|"$/g, '');

const { translate } = await import('../src/lib/server/support/translation');

const CONVERSATION = [
    '지난주에 제주도 가는 항공편을 예약했어요.',
    '근데 확인 메일이 안 왔어요.',
    '그거 언제 와요?',
    '아까 말한 그 항공편이요, 날짜 바꿀 수 있어요?',
    '다음 주 금요일로요.',
    '네 그걸로 해주세요.',
    '추가 요금 있어요?',
    '카드로 결제했는데 그 카드로 환불되나요?',
    '알겠습니다. 감사합니다!',
];

for (const [i, msg] of CONVERSATION.entries()) {
    const out = await translate(msg, 'en');
    console.log(`${String(i + 1).padStart(2)}. ${msg}\n    → ${out ?? '[untranslated]'}\n`);
}
