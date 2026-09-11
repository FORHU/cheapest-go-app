import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A Support Chat requires an account (ADR-0032), and this checks the code says so.
 *
 * The ADR was decided, the data migration ran — every guest conversation was resolved with
 * a notice telling them to sign in — and the code that *creates* one was left open. For two
 * days a signed-out visitor could still mint a guest token and start typing, and the only
 * reason nobody did was that the launcher had been removed. A decision enforced by the
 * absence of a button is not enforced.
 *
 * These read the source rather than exercising the routes because what went wrong was not a
 * wrong branch but a missing one, and a test of behaviour that nothing calls proves nothing.
 * The behaviour tests live beside the routes; this is the ratchet that stops the guard being
 * dropped again.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('a Support Chat requires an account', () => {
    it('does not mint a guest token anywhere', () => {
        // The one function that issued them. If this comes back, so has anonymous support.
        const callers = ['src/lib/server/support/conversations.ts']
            .map(read)
            .filter(source => /\bmintGuestToken\s*\(/.test(source));
        expect(callers).toHaveLength(0);
    });

    it('refuses to open a conversation for a signed-out caller', () => {
        const source = read('src/lib/server/support/conversations.ts');
        // The guest INSERT is gone, not merely unreachable.
        expect(source).not.toMatch(/INSERT INTO support_conversations \(guest_token_hash/);
        expect(source).toMatch(/Sign in to start a Support Chat/);
    });

    it('turns every customer-side write away without a session', () => {
        // Open, write, ask-for-a-person, and upload. Reading is deliberately absent.
        //
        // The upload routes were added by a later feature and arrived without the guard —
        // which is how this rule gets lost: not by anyone removing it, but by a new write
        // path not knowing it existed. Uploads matter most of the four, because what lands
        // in the bucket is identity documents.
        const writes = [
            'src/app/api/support/conversation/route.ts',
            'src/app/api/support/conversation/messages/route.ts',
            'src/app/api/support/conversation/escalate/route.ts',
            'src/app/api/support/conversation/attachments/route.ts',
            'src/app/api/support/conversation/attachments/[id]/route.ts',
        ];
        for (const file of writes) {
            const source = read(file);
            expect(source, file).toMatch(/if \(!caller\.userId\)/);
            expect(source, file).toMatch(/authRequired: true/);
            expect(source, file).toMatch(/status: 401/);
        }
    });

    it('leaves the guest read path open, which is the way back', () => {
        // A returning guest must still see their transcript and the notice that tells them
        // to sign in and write again. Closing this would strand them with no explanation.
        const source = read('src/lib/server/support/conversations.ts');
        expect(source).toMatch(/hashGuestToken/);
        expect(source).toMatch(/WHERE guest_token_hash = \$1/);
    });
});
