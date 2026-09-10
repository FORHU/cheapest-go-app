import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { toAttachmentView, ATTACHMENT_RETENTION_DAYS } from './attachments';
import type { SupportAttachment } from './attachments';

/**
 * An attachment's bytes expire; its row does not.
 *
 * ADR-0040 left retention as its open item, and the reason it needed deciding before the
 * bucket filled is that the two halves have different answers: a transcript is evidence in
 * a chargeback and is kept, a passport page proved one thing once and afterwards is only
 * liability. What is easy to get wrong is the tombstone — delete the row with the object
 * and the transcript starts misrepresenting itself.
 */

const attachment = (over: Partial<SupportAttachment> = {}): SupportAttachment => ({
    id: 'att-1',
    conversationId: 'conv-1',
    messageId: 'msg-1',
    storageKey: 'support/conv-1/att-1',
    fileName: 'passport.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 240_000,
    uploadedByType: 'guest',
    uploadedByAdminId: null,
    createdAt: '2026-06-01T10:00:00.000Z',
    bytesDeletedAt: null,
    ...over,
});

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('attachment retention', () => {
    it('keeps the name and size after the bytes are gone', () => {
        // What an Agent needs when a customer asks "did you get the document I sent in
        // March". Dropping the row would leave nobody able to answer that.
        const view = toAttachmentView(attachment({ bytesDeletedAt: '2026-09-01T00:00:00.000Z' }));

        expect(view.bytesDeleted).toBe(true);
        expect(view.fileName).toBe('passport.jpg');
        expect(view.sizeBytes).toBe(240_000);
    });

    it('says nothing is deleted while the file is still there', () => {
        expect(toAttachmentView(attachment()).bytesDeleted).toBe(false);
    });

    it('never exposes the storage key, expired or not', () => {
        // ADR-0040's first consequence. A tombstoned row is still a row that gets
        // serialised into a transcript.
        for (const row of [attachment(), attachment({ bytesDeletedAt: '2026-09-01T00:00:00.000Z' })]) {
            expect(Object.keys(toAttachmentView(row))).not.toContain('storageKey');
        }
    });

    it('measures the 90 days from the conversation, not from the upload', () => {
        // The clock starts when the chat is Resolved and restarts if it reopens — a customer
        // still talking has not finished with the evidence. An S3 lifecycle rule keyed on
        // object age cannot express that, which is why this is a job.
        const source = read('src/lib/server/support/attachments.ts');
        expect(ATTACHMENT_RETENTION_DAYS).toBe(90);
        expect(source).toMatch(/c\.status = 'resolved'/);
        expect(source).toMatch(/c\.last_message_at < now\(\)/);
    });

    it('deletes the object before marking the row', () => {
        // Marking first would strand an object with nothing pointing at it — the one
        // failure this cannot recover from on its own. Ordering is load-bearing.
        const source = read('src/lib/server/support/attachments.ts');
        const purge = source.slice(source.indexOf('export async function purgeExpiredAttachments'));
        expect(purge.indexOf('deleteObject(')).toBeLessThan(purge.indexOf('bytes_deleted_at = now()'));
    });

    it('leaves a row unmarked when the delete fails, so the next run retries', () => {
        const source = read('src/lib/server/support/attachments.ts');
        const purge = source.slice(source.indexOf('export async function purgeExpiredAttachments'));
        expect(purge).toMatch(/failed\+\+/);
        // No marking inside the catch: a briefly unreachable bucket must not record a row
        // as purged when it is not.
        const catchBlock = purge.slice(purge.indexOf('} catch'));
        expect(catchBlock).not.toMatch(/bytes_deleted_at/);
    });

    it('refuses an expired download with 410 rather than 404 on both sides', () => {
        // The distinction is real and worth telling: this file existed, you sent it, and it
        // is not coming back.
        for (const route of [
            'src/app/api/support/conversation/attachments/[id]/route.ts',
            'src/app/api/admin/support/conversations/[id]/attachments/[attachmentId]/route.ts',
        ]) {
            const source = read(route);
            expect(source, route).toMatch(/attachment\.bytesDeletedAt/);
            expect(source, route).toMatch(/status: 410/);
        }
    });

    it('keeps the two SupportAttachmentView declarations in step', () => {
        // There are two, deliberately: the client one is declared apart so a browser bundle
        // never imports a module that opens database connections. The cost is that they
        // drift, and adding `bytesDeleted` to one and not the other is exactly how — the
        // server would send a field the client's type says does not exist, and the transcript
        // would show every expired file as still present.
        const fields = (source: string) => {
            const start = source.indexOf('export interface SupportAttachmentView {');
            const body = source.slice(start, source.indexOf('}', start));
            return [...body.matchAll(/^\s{4}(\w+)[?]?:/gm)].map(m => m[1]).sort();
        };

        expect(fields(read('src/lib/server/support/attachments.ts')))
            .toEqual(fields(read('src/components/support/types.ts')));
    });

    it('reads the flag in the query the transcript is built from', () => {
        // VIEW_COLUMNS, not just the row type. A field the type promises and the SELECT
        // omits arrives as undefined, which is falsy — so every expired file would read as
        // present and nobody would see a type error.
        const source = read('src/lib/server/support/attachments.ts');
        const viewColumns = source.slice(
            source.indexOf('const VIEW_COLUMNS'),
            source.indexOf('const COLUMNS'),
        );
        expect(viewColumns).toMatch(/bytes_deleted_at IS NOT NULL/);
        expect(viewColumns).toMatch(/"bytesDeleted"/);
        // And still no storage key, which is the thing this view exists to withhold.
        expect(viewColumns).not.toMatch(/storage_key/);
    });

    it('is actually scheduled, not merely written', () => {
        // A retention rule nothing runs is a comment. Three routes in this repo's history
        // were scheduled but never built; this is the same mistake in reverse.
        expect(read('docker/cron/crontab')).toMatch(/purge-support-attachments/);
    });
});
