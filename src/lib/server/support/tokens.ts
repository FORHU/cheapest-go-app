import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * The credential an anonymous guest holds for their support conversation.
 *
 * The guest routes take no conversation id (see ADR-0027): a conversation is reached
 * only by proving you own it, and for someone with no account the proof is this token.
 * That means the token is the whole of the authorisation, so it is minted from the CSPRNG
 * at a width where guessing is not a strategy, and only its hash is stored — the table
 * can say who contacted support without also being a set of working keys.
 */

/** Cookie the guest token travels in. httpOnly, so page scripts cannot read it. */
export const SUPPORT_COOKIE = 'cg-support';

/**
 * How long a guest can resume a conversation. Long enough to come back to an unanswered
 * question the next day or after a weekend, short enough that a shared or public browser
 * is not a permanent way in.
 */
export const SUPPORT_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, in seconds

export interface SupportCookieOptions {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: string;
    maxAge: number;
}

export function supportCookieOptions(): SupportCookieOptions {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SUPPORT_COOKIE_MAX_AGE,
    };
}

/** A fresh guest token. 32 bytes of CSPRNG output, base64url so it survives a cookie. */
export function mintGuestToken(): string {
    return randomBytes(32).toString('base64url');
}

/** What gets stored. Never store the token itself. */
export function hashGuestToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/**
 * Compare two token hashes without leaking, through timing, how much of a prefix matched.
 *
 * The lookup is normally an indexed equality on the hash, which is not a comparison this
 * process performs — but where code does compare hashes directly it should not be the one
 * place an attacker can measure.
 */
export function guestTokenHashEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}
