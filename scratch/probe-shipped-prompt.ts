/**
 * The shipped prompt and guard, single attempts, every reply printed so leaks are visible by
 * eye rather than trusted to the guard's own count.
 *
 *   npx tsx scratch/probe-shipped-prompt.ts
 */
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const base = env.match(/^CHAT_WONDER_API_URL=(.*)$/m)![1].trim().replace(/^"|"$/g, '').replace(/\/+$/, '');

const { buildPrompt, guardTranslation } = await import('../src/lib/server/support/translation');
type Lang = 'en' | 'ko' | 'ja' | 'zh';

const RUNS = 6;

const CASES: [string, Lang][] = [
    ['항공편 예약 내역을 찾을 수 없습니다.', 'en'],
    ['항공권 예약을 취소해 주세요.', 'en'],
    ['급해요! 공항인데 항공권이 취소되었어요. 도와주세요!', 'en'],
    ['호텔에 도착했는데 제 예약이 없다고 합니다. 도와주세요.', 'en'],
    ['죄송하지만 날짜를 변경할 수 있을까요?', 'en'],
    ['안녕하세요.\n어제 결제했는데 확인 메일이 안 왔어요.\n예약번호는 CS-7K2M9Q 입니다.', 'en'],
    ['予約が見つかりません。助けてください。', 'en'],
    ['我找不到我的航班预订。', 'en'],
    ['I have found your booking and resent the confirmation to your email.', 'ko'],
    ['Your refund has been sent and should arrive within five to ten working days.', 'ja'],
    ['Your refund has been sent and should arrive within five to ten working days.', 'zh'],
];

async function ask(input: string): Promise<string> {
    const { session_id } = await (await fetch(`${base}/session-id`)).json() as { session_id: string };
    const res = await fetch(`${base}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ session_id, user_input: input }),
    });
    const { response } = await res.json() as { response?: string };
    return response ?? '';
}

let ok = 0, total = 0;
for (const [text, target] of CASES) {
    console.log(`── ${JSON.stringify(text.slice(0, 40))} → ${target}`);
    let here = 0;
    for (let i = 0; i < RUNS; i++) {
        const raw = await ask(buildPrompt(text, target));
        const g = guardTranslation(raw, text, target);
        total++;
        if (g) { ok++; here++; console.log(`   ✓ ${JSON.stringify(g)}`); }
        else console.log(`   ✗ ${JSON.stringify(raw.slice(0, 140))}`);
    }
    console.log(`   ${here}/${RUNS}\n`);
}
console.log(`single-attempt usable: ${ok}/${total} (${Math.round(100 * ok / total)}%)`);
