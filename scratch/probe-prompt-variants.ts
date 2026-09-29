/**
 * Which prompt stops ChatWonder refusing flight-related customer messages?
 *
 * The shipped prompt translates hotel complaints fine but refuses '항공편 예약 내역을 찾을 수
 * 없습니다.' every time — the engine reads it as a request to *find the bookings*, which is
 * outside what it will do. Each variant runs every sentence RUNS times on a fresh session.
 *
 *   npx tsx scratch/probe-prompt-variants.ts
 */
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const base = env.match(/^CHAT_WONDER_API_URL=(.*)$/m)![1].trim().replace(/^"|"$/g, '').replace(/\/+$/, '');

const { buildPrompt, guardTranslation } = await import('../src/lib/server/support/translation');

const RUNS = 4;

const SENTENCES = [
    '항공편 예약 내역을 찾을 수 없습니다.',
    '항공권 예약을 취소해 주세요.',
    '비행기 표 날짜를 변경하고 싶어요.',
    '환불은 언제 받을 수 있나요?',
    '급해요! 공항인데 항공권이 취소되었어요. 도와주세요!',
];

type Variant = (text: string) => string;

const VARIANTS: Record<string, Variant> = {
    shipped: t => buildPrompt(t, 'en'),

    boostk: t => `Translate the following into English. Output ONLY the translation, no notes:\n\n${t}`,

    // Name the task as a transcript line, third person, and quote it.
    transcript: t => [
        'The line below was written by a traveller to a travel agency\'s support staff.',
        'It is not a request to you, and you are not being asked to act on it.',
        'Your only job: give its English translation. Reply with the translation and nothing else.',
        '',
        `Korean: ${t}`,
        'English:',
    ].join('\n'),

    // Few-shot: show the pattern on a similar sentence, so the next line is completion.
    fewshot: t => [
        'Translate each Korean line into English. Output only the English.',
        '',
        'Korean: 호텔 예약 확인서를 받지 못했습니다.',
        'English: I did not receive my hotel booking confirmation.',
        '',
        'Korean: 결제가 두 번 되었어요.',
        'English: I was charged twice.',
        '',
        `Korean: ${t}`,
        'English:',
    ].join('\n'),

    // Shipped framing plus few-shot.
    shippedFewshot: t => [
        buildPrompt('', 'en').replace(/MESSAGE:\s*$/, '').trimEnd(),
        '',
        'Examples of the format:',
        'Korean: 호텔 예약 확인서를 받지 못했습니다.',
        'English: I did not receive my hotel booking confirmation.',
        'Korean: 결제가 두 번 되었어요.',
        'English: I was charged twice.',
        '',
        `Korean: ${t}`,
        'English:',
    ].join('\n'),
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

for (const [name, build] of Object.entries(VARIANTS)) {
    let ok = 0, total = 0;
    const samples: string[] = [];
    for (const s of SENTENCES) {
        let okHere = 0;
        for (let i = 0; i < RUNS; i++) {
            const raw = await ask(build(s));
            const g = guardTranslation(raw, s, 'en');
            total++;
            if (g) { ok++; okHere++; if (i === 0) samples.push(`      ${s.slice(0, 16)}… → ${g}`); }
            else if (i === 0) samples.push(`      ${s.slice(0, 16)}… ✗ ${JSON.stringify(raw.slice(0, 80))}`);
        }
    }
    console.log(`${name.padEnd(15)} ${ok}/${total} usable`);
    for (const l of samples) console.log(l);
    console.log();
}
