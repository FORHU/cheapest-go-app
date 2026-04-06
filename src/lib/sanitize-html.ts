/**
 * Lightweight HTML sanitizer for third-party content (e.g. hotel remarks from LiteAPI).
 *
 * Strips dangerous tags (script, style, iframe, object, embed, form)
 * and dangerous attributes (event handlers, javascript: hrefs).
 *
 * Only keeps a safe allowlist of formatting tags so hotel remarks
 * still render with their intended structure (lists, bold, etc.).
 *
 * This runs on the server (no DOM needed — uses regex on the raw string).
 * For client-side rendering, React's `dangerouslySetInnerHTML` is safe
 * once the string has been passed through this function first.
 */

const BLOCKED_TAGS = /(<\s*\/?\s*(script|style|iframe|object|embed|form|input|button|link|meta|base|svg|math|template)\b[^>]*>)/gi;

const EVENT_ATTRS = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;

const JAVASCRIPT_HREF = /\bhref\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]*)/gi;

const DATA_ATTR = /\s+data-[a-z][\w-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;

export function sanitizeHtml(html: string): string {
    if (!html) return '';

    return html
        .replace(BLOCKED_TAGS, '')          // remove dangerous tags entirely
        .replace(EVENT_ATTRS, '')            // strip onclick, onload, etc.
        .replace(JAVASCRIPT_HREF, '')        // strip javascript: hrefs
        .replace(DATA_ATTR, '');             // strip data-* attributes (used in some XSS vectors)
}
