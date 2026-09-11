/**
 * Why does '항공편 예약 내역을 찾을 수 없습니다.' never translate? Print ChatWonder's raw reply
 * and what the guard makes of it.
 *
 *   npx tsx scratch/probe-flight-sentence.ts
 */
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const base = env.match(/^CHAT_WONDER_API_URL=(.*)$/m)![1].trim().replace(/^"|"$/g, '').replace(/\/+$/, '');

const { buildPrompt, guardTranslation } = await import('../src/lib/server/support/translation');

const TEXT = '항공편 예약 내역을 찾을 수 없습니다.';

for (let i = 0; i < 4; i++) {
    const { session_id } = await (await fetch(`${base}/session-id`)).json() as { session_id: string };
    const res = await fetch(`${base}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ session_id, user_input: buildPrompt(TEXT, 'en') }),
    });
    const { response } = await res.json() as { response?: string };
    console.log(`raw   ${JSON.stringify(response)}`);
    console.log(`guard ${JSON.stringify(guardTranslation(response ?? '', TEXT, 'en'))}\n`);
}
