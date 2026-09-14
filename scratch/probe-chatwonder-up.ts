/** Is ChatWonder's /chat answering at all? Sends one plain request and prints status + body.  npx tsx scratch/probe-chatwonder-up.ts */
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const base = env.match(/^CHAT_WONDER_API_URL=(.*)$/m)![1].trim().replace(/^"|"$/g, '').replace(/\/+$/, '');
const { buildPrompt } = await import('../src/lib/server/support/translation');

for (const input of ['Hello', buildPrompt('호텔 예약 확인서를 받지 못했습니다.', 'en')]) {
    const s = await fetch(`${base}/session-id`);
    const { session_id } = await s.json() as { session_id: string };
    const res = await fetch(`${base}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ session_id, user_input: input }),
    });
    console.log(res.status, (await res.text()).slice(0, 160));
}
