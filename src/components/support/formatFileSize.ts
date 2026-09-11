/**
 * A file size a person can read at a glance.
 *
 * Rounded hard on purpose: the customer is deciding whether the thing they attached is the
 * thing they meant to attach, and "1.4 MB" answers that where "1,468,006 bytes" does not.
 * Binary units, because that is what the ceiling in `attachments.ts` is expressed in - a
 * 10 MB limit that rejected a file the UI called "10 MB" would be indefensible.
 */
export function formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '';
    if (bytes < 1024) return `${bytes} B`;

    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;

    const mb = kb / 1024;
    // One decimal below 10 MB, none above: the difference between 1.4 and 1.5 MB is worth
    // seeing next to a limit, the difference between 14 and 15 is not.
    return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}
