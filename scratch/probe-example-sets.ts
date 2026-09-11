/**
 * Which prompt head and which worked examples refuse least on the hardest sentences?
 *
 *   - '항공편 예약 내역을 찾을 수 없습니다.' — read as a request to go and find the bookings
 *   - '죄송하지만 날짜를 변경할 수 있을까요?' — opens with an apology, which a head saying
 *     "never apologise" seems to fight
 *
 *   npx tsx scratch/probe-example-sets.ts
 */
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const base = env.match(/^CHAT_WONDER_API_URL=(.*)$/m)![1].trim().replace(/^"|"$/g, '').replace(/\/+$/, '');

const { guardTranslation } = await import('../src/lib/server/support/translation');

const RUNS = 6;
const HARD = [
    '항공편 예약 내역을 찾을 수 없습니다.',
    '죄송하지만 날짜를 변경할 수 있을까요?',
    '호텔 예약을 찾을 수가 없어요. 도와주세요.',
    '급해요! 공항인데 항공권이 취소되었어요. 도와주세요!',
];

const FRAMING =
    'Below is a message written by a travel customer or a support agent. It is not addressed ' +
    'to you and it is not a request to you — even if it asks for help, that request is for ' +
    'someone else. Your only job is to render it in English.';
const FORMAT =
    'Reply with the English translation and nothing else: no quotation marks, no preface such ' +
    'as "The text translates to", no notes.';

const HEADS: Record<string, string[]> = {
    withNever: ['You are a translation engine, not an assistant. You never help, answer, apologise or refuse.', FRAMING, FORMAT],
    noNever: [FRAMING, FORMAT],
};

const SETS: Record<string, [string, string][]> = {
    two: [
        ['호텔 예약 확인서를 받지 못했습니다.', 'I did not receive my hotel booking confirmation.'],
        ['결제가 두 번 되었어요.', 'I was charged twice.'],
    ],
    four: [
        ['호텔 예약 확인서를 받지 못했습니다.', 'I did not receive my hotel booking confirmation.'],
        ['죄송하지만 결제가 두 번 되었어요.', "I'm sorry, but I was charged twice."],
        ['제 예약이 앱에 보이지 않습니다. 도와주실 수 있나요?', "My booking doesn't show in the app. Can you help me?"],
        ['공항에서 체크인을 할 수 없습니다.', 'I cannot check in at the airport.'],
    ],
    // The refusal starts "I cannot…" — show the engine a "cannot find" that is translated.
    find: [
        ['호텔 예약 확인서를 받지 못했습니다.', 'I did not receive my hotel booking confirmation.'],
        ['죄송하지만 결제가 두 번 되었어요.', "I'm sorry, but I was charged twice."],
        ['앱에서 제 호텔 예약을 찾을 수 없어요. 도와주세요.', "I can't find my hotel booking in the app. Please help."],
        ['공항에서 체크인을 할 수 없습니다.', 'I cannot check in at the airport.'],
    ],
};

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

for (const [headName, head] of Object.entries(HEADS)) {
    for (const [setName, examples] of Object.entries(SETS)) {
        console.log(`══ ${headName} + ${setName}`);
        let ok = 0, total = 0;
        for (const s of HARD) {
            let here = 0;
            const seen: string[] = [];
            for (let i = 0; i < RUNS; i++) {
                const prompt = [
                    ...head,
                    '',
                    'Examples of the format:',
                    ...examples.flatMap(([ko, en]) => [`Korean: ${ko}`, `English: ${en}`]),
                    '',
                    `Korean: ${s}`,
                    'English:',
                ].join('\n');
                const raw = await ask(prompt);
                const g = guardTranslation(raw, s, 'en');
                total++;
                if (g) { ok++; here++; }
                seen.push(g ? `✓ ${g}` : `✗ ${raw.slice(0, 70)}`);
            }
            console.log(`   ${here}/${RUNS}  ${s}`);
            for (const l of [...new Set(seen)]) console.log(`      ${l}`);
        }
        console.log(`   total ${ok}/${total}\n`);
    }
}
