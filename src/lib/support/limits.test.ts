import { describe, it, expect } from 'vitest';
import { checkAttachment, describeUploadFailure, MAX_ATTACHMENT_BYTES } from './limits';

/**
 * QA BG-16: attachments failed on both sides with no useful message. On production anything
 * over 1 MB was refused by the proxy with an HTML 413 page, which the customer's widget could
 * not parse — it showed nothing at all.
 */

describe('checkAttachment — a clear answer before uploading', () => {
    const file = (name: string, type: string, size = 50_000) => ({ name, type, size });

    it.each([
        ['booking.pdf', 'application/pdf'],
        ['photo.jpg', 'image/jpeg'],
        ['screen.png', 'image/png'],
        ['IMG_1234.HEIC', ''],            // HEIC often has no MIME type in a picker
        ['scan.pdf', ''],                 // Android file managers often send none
    ])('sends %s', (name, type) => {
        expect(checkAttachment(file(name, type))).toBeNull();
    });

    it('refuses a Word document, a spreadsheet and a zip', () => {
        expect(checkAttachment(file('itinerary.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBe('unsupported');
        expect(checkAttachment(file('costs.xlsx', ''))).toBe('unsupported');
        expect(checkAttachment(file('docs.zip', 'application/zip'))).toBe('unsupported');
    });

    it('refuses anything over 10 MB, and an empty file', () => {
        expect(checkAttachment(file('photo.jpg', 'image/jpeg', MAX_ATTACHMENT_BYTES + 1))).toBe('tooLarge');
        expect(checkAttachment(file('photo.jpg', 'image/jpeg', MAX_ATTACHMENT_BYTES))).toBeNull();
        expect(checkAttachment(file('blank.pdf', 'application/pdf', 0))).toBe('empty');
    });
});

describe('describeUploadFailure — never a failure with nothing to say', () => {
    it('uses the server\'s own words when it has any', () => {
        expect(describeUploadFailure(400, 'A message can carry at most 5 files.')).toEqual({ message: 'A message can carry at most 5 files.' });
    });

    it('reads a proxy\'s HTML 413 — no JSON, no message — as too large', () => {
        expect(describeUploadFailure(413, undefined)).toEqual({ reason: 'tooLarge' });
        expect(describeUploadFailure(413, 'That file is too large.')).toEqual({ reason: 'tooLarge' });
    });

    it('explains rate limits, a missing bucket, and anything else', () => {
        expect(describeUploadFailure(429)).toEqual({ reason: 'tooMany' });
        expect(describeUploadFailure(503)).toEqual({ reason: 'unavailable' });
        expect(describeUploadFailure(502)).toEqual({ reason: 'failed' });
        expect(describeUploadFailure(500, null)).toEqual({ reason: 'failed' });
    });
});
