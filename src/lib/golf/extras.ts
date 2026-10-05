/**
 * Golf extras (CONTEXT.md, "Golf Booking"): what a customer can add to a tee time, priced per
 * item by the course. The codes are amenity codes, so storefront names come from the existing
 * `golf.amenities.*` labels. Client-safe and pure: the checkout page and the hold both price
 * extras through here, so the total shown is the total held.
 */

export const GOLF_EXTRAS = ['club_rental', 'caddie', 'cart'] as const;
export type GolfExtraCode = (typeof GOLF_EXTRAS)[number];

/** English names, for the emails and the back office. */
export const EXTRA_NAMES_EN: Record<GolfExtraCode, string> = {
    club_rental: 'Club rental', caddie: 'Caddie', cart: 'Golf cart',
};

/** What one item is, for the back office. */
export const EXTRA_UNITS_EN: Record<GolfExtraCode, string> = {
    club_rental: 'per set', caddie: 'per caddie', cart: 'per cart',
};

/** What the customer asked for. */
export interface ExtraChoice {
    code: GolfExtraCode;
    quantity: number;
}

/** What the course offers, at its price per item. */
export interface ExtraOffer {
    code: GolfExtraCode;
    price: number;
}

/** A priced line on a booking. */
export interface ExtraLine {
    code: GolfExtraCode;
    quantity: number;
    unitPrice: number;
    total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const isExtra = (code: string): code is GolfExtraCode => (GOLF_EXTRAS as readonly string[]).includes(code);
const byListOrder = (a: { code: GolfExtraCode }, b: { code: GolfExtraCode }) =>
    GOLF_EXTRAS.indexOf(a.code) - GOLF_EXTRAS.indexOf(b.code);

/** `club_rental:2,cart:1` → choices. Unknown codes, bad numbers, zeros and repeats are dropped. */
export function parseExtrasParam(value: string | null | undefined): ExtraChoice[] {
    if (!value) return [];
    const seen = new Set<string>();
    const out: ExtraChoice[] = [];
    for (const part of value.split(',')) {
        const [code, count] = part.split(':');
        const quantity = Number(count);
        if (!isExtra(code) || seen.has(code) || !Number.isInteger(quantity) || quantity < 1) continue;
        seen.add(code);
        out.push({ code, quantity });
    }
    return out.sort(byListOrder);
}

/** The reverse of parseExtrasParam; zero quantities are left out. */
export function formatExtrasParam(choices: ExtraChoice[]): string {
    return choices
        .filter(c => c.quantity > 0)
        .sort(byListOrder)
        .map(c => `${c.code}:${c.quantity}`)
        .join(',');
}

/** Choices a page can show: only extras on offer, at most one per player, none at zero. */
export function sanitizeExtras(choices: ExtraChoice[], offers: ExtraOffer[], players: number): ExtraChoice[] {
    const offered = new Set(offers.map(o => o.code));
    return choices
        .filter(c => offered.has(c.code) && c.quantity > 0)
        .map(c => ({ code: c.code, quantity: Math.min(c.quantity, players) }))
        .sort(byListOrder);
}

export type PricedExtras =
    | { ok: true; lines: ExtraLine[]; total: number }
    | { ok: false; reason: 'not_offered' | 'too_many'; code: GolfExtraCode };

/** Prices choices against the course's offer. Refuses, rather than corrects, anything invalid. */
export function priceExtras(choices: ExtraChoice[], offers: ExtraOffer[], players: number): PricedExtras {
    const lines: ExtraLine[] = [];
    for (const choice of [...choices].sort(byListOrder)) {
        if (choice.quantity < 1) continue;
        const offer = offers.find(o => o.code === choice.code);
        if (!offer) return { ok: false, reason: 'not_offered', code: choice.code };
        if (choice.quantity > players) return { ok: false, reason: 'too_many', code: choice.code };
        lines.push({ code: choice.code, quantity: choice.quantity, unitPrice: offer.price, total: round2(offer.price * choice.quantity) });
    }
    return { ok: true, lines, total: round2(lines.reduce((sum, line) => sum + line.total, 0)) };
}

/** Whether two sets of choices ask for the same thing. */
export function sameExtras(a: ExtraChoice[], b: ExtraChoice[]): boolean {
    return formatExtrasParam(a) === formatExtrasParam(b);
}
