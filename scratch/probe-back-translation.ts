/**
 * Forward and back through live ChatWonder: what an Agent's reply became, and what it reads
 * as in English — the line the inbox now shows under a translated reply.
 *
 *   npx tsx scratch/probe-back-translation.ts
 */
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
process.env.CHAT_WONDER_API_URL = env.match(/^CHAT_WONDER_API_URL=(.*)$/m)![1].trim().replace(/^"|"$/g, '');

const { translate } = await import('../src/lib/server/support/translation');

const REPLIES = [
    'im handsome too',
    "I'm handsome too.",
    'I have found your booking and resent the confirmation to your email.',
    'Your refund of 10,453 won was sent today.',
];

for (const reply of REPLIES) {
    const ko = await translate(reply, 'ko');
    const back = ko ? await translate(ko, 'en') : null;
    console.log(`Agent wrote:   ${reply}`);
    console.log(`Customer read: ${ko ?? '[untranslated]'}`);
    console.log(`Reads back as: ${back ?? '[could not check]'}\n`);
}
