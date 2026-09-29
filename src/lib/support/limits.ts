/**
 * Support Chat limits shared by the server and the two chat boxes.
 *
 * Here rather than in `lib/server/support` so the customer's widget and the Agent's inbox can
 * import the same number the server enforces. A box that lets someone type past the server's
 * limit only finds out at send, as a failed message with no reason given.
 */

/**
 * Longest message accepted. Support questions are prose, not documents, and the ceiling
 * is what stops one paste filling a row, a stream frame and an AI context window at once.
 *
 * In characters as JavaScript counts them (UTF-16 code units), which is also what an input's
 * `maxLength` counts — so the box and the server agree to the character. About 1,000–1,300
 * words of Korean, or 650–800 of English; translated as four or five pieces.
 */
export const MAX_MESSAGE_LENGTH = 4000;

/** How close to the limit before the box starts showing a count. */
export const MESSAGE_COUNTER_FROM = 3500;

/**
 * Largest attachment accepted. The server enforces it on the bytes (lib/server/support/
 * attachments.ts re-exports this); both chat boxes check it before uploading, so a file too
 * big never spends a phone's data only to be refused.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** What the file pickers offer: the server's allowlist, as MIME types. */
export const ATTACHMENT_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,application/pdf';

const ACCEPTED_MIME = new Set(ATTACHMENT_ACCEPT.split(','));
// A picker's MIME type is often empty for HEIC, and on Android for anything from a file
// manager, so the extension counts too. The server still identifies the file by its bytes.
const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp|gif|heic|heif|pdf)$/i;

export type AttachmentRefusal = 'empty' | 'tooLarge' | 'unsupported';

/**
 * Why a picked file will be refused, before it is uploaded — or null to send it.
 *
 * A first answer, not the rule: the server sniffs the bytes and has the last word. What this
 * buys is a clear reason on the spot. Found with QA BG-16, where files never reached the
 * server at all and people were told nothing useful.
 */
export function checkAttachment(file: { size: number; type: string; name: string }): AttachmentRefusal | null {
    if (file.size === 0) return 'empty';
    if (file.size > MAX_ATTACHMENT_BYTES) return 'tooLarge';
    if (!ACCEPTED_MIME.has(file.type) && !ACCEPTED_EXTENSIONS.test(file.name)) return 'unsupported';
    return null;
}

export type UploadFailure = 'tooLarge' | 'tooMany' | 'unavailable' | 'failed';

/**
 * Read a failed upload response into something a person can be told.
 *
 * The body is not always the app's JSON. A 413 from the proxy in front of production is an
 * HTML page — and the customer's widget used to parse it, throw, and show no message at all.
 * The server's own words win when there are any; the status answers otherwise.
 */
export function describeUploadFailure(status: number, serverMessage?: string | null): { message: string } | { reason: UploadFailure } {
    if (serverMessage && status !== 413) return { message: serverMessage };
    if (status === 413) return { reason: 'tooLarge' };
    if (status === 429) return { reason: 'tooMany' };
    if (status === 503) return { reason: 'unavailable' };
    return { reason: 'failed' };
}
