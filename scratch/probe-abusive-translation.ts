/**
 * Does ChatWonder refuse to translate insults and profanity, and does a prompt telling it
 * that support staff need abusive messages rendered faithfully fix that without hurting the
 * ordinary hard sentences? Prints every raw reply so refusals are visible by eye.
 *
 *   npx tsx scratch/probe-abusive-translation.ts            (both)
 *   $env:ONLY='shipped'; npx tsx scratch/probe-abusive-translation.ts
 */
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const base = env.match(/^CHAT_WONDER_API_URL=(.*)$/m)![1].trim().replace(/^"|"$/g, '').replace(/\/+$/, '');

const { buildPrompt, guardTranslation } = await import('../src/lib/server/support/translation');

const RUNS = 4;

const ABUSIVE = [
    '진짜 더럽게 못생긴 새끼네.',
    '정말 못생겼네요.',
    '너 진짜 멍청하다.',
    '이 사기꾼들아, 내 돈 돌려줘!',
    '씨발 환불 언제 해줄 거야?',
];
const ORDINARY = [
    '항공편 예약 내역을 찾을 수 없습니다.',
    '죄송하지만 날짜를 변경할 수 있을까요?',
];

/*
 * The faithful-rendering instruction and rude example are now IN the shipped prompt, so
 * "shipped" measures them. "before" strips them back out, to compare against the old prompt.
 */
function beforePrompt(text: string): string {
    return buildPrompt(text, 'en')
        .replace(/\nCustomers are sometimes angry\.[^\n]*/, '')
        .replace(/Korean: 이 멍청한 사기꾼들아[^\n]*\nEnglish: [^\n]*\n/, '');
}

async function ask(input: string): Promise<string> {
    for (let attempt = 0; ; attempt++) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        try { return await askOnce(input); } catch (e) {
            // An engine error is not a translation; report it as a miss, never through the guard.
            if (attempt >= 3) return `I'm sorry, but I can't assist with that. (engine error: ${(e as Error).message.slice(0, 40)})`;
        }
    }
}

async function askOnce(input: string): Promise<string> {
    const { session_id } = await (await fetch(`${base}/session-id`)).json() as { session_id: string };
    const res = await fetch(`${base}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ session_id, user_input: input }),
    });
    return ((await res.json()) as { response?: string }).response ?? '';
}

// Refuse to measure an engine that is down: every miss would look like a refusal.
{
    const probe = await askOnce('Hello').then(() => null, (e: Error) => e.message);
    if (probe) {
        console.error(`ChatWonder is not answering (/chat → ${probe.slice(0, 60)}). Nothing measured; try again later.`);
        process.exit(1);
    }
}

const variants = [['shipped', (t: string) => buildPrompt(t, 'en')], ['before', beforePrompt]] as const;
for (const [label, build] of variants.filter(([l]) => !process.env.ONLY || l === process.env.ONLY)) {
    console.log(`══ ${label}`);
    let ok = 0, total = 0;
    for (const sentence of [...ABUSIVE, ...ORDINARY]) {
        let here = 0;
        const seen: string[] = [];
        for (let i = 0; i < RUNS; i++) {
            const raw = await ask(build(sentence));
            const g = guardTranslation(raw, sentence, 'en');
            total++;
            if (g) { ok++; here++; }
            seen.push(g ? `✓ ${g}` : `✗ ${raw.slice(0, 80)}`);
        }
        console.log(`   ${here}/${RUNS}  ${sentence}`);
        for (const l of [...new Set(seen)]) console.log(`      ${l}`);
    }
    console.log(`   total ${ok}/${total}\n`);
}
