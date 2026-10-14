import { duffelIdentityDocuments } from './duffel-identity-documents';

export type E164Result = { ok: true; e164: string } | { ok: false };

/**
 * Normalise a contact phone to E.164, or say it cannot be.
 *
 * The country code is digits only ("+82", "82" and "0082" agree); the number has non-digits and
 * leading zeros removed (Korean "010-…" becomes "10…"). Duffel rejects an order over a bad
 * number, so this runs before a card is authorised, not after.
 */
export function toE164Phone(
    contact: { countryCode?: unknown; phone?: unknown },
    defaultCountryCode = '82',
): E164Result {
    const countryCode = String(contact.countryCode ?? defaultCountryCode).replace(/\D/g, '') || defaultCountryCode;
    const subscriber = String(contact.phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
    const e164 = `+${countryCode}${subscriber}`;
    const digits = countryCode.length + subscriber.length;
    if (subscriber.length < 4 || digits < 7 || !/^\+\d{7,15}$/.test(e164)) return { ok: false };
    return { ok: true, e164 };
}

/** Duffel's title vocabulary is mr | ms | mrs | miss | dr. */
export function duffelTitle(pax: { gender?: string; type?: string }): string {
    const g = (pax.gender ?? '').toUpperCase();
    const t = (pax.type ?? '').toUpperCase();
    if (t === 'CHD' || t === 'INF') return g === 'M' ? 'mr' : 'miss';
    return g === 'M' ? 'mr' : 'ms';
}

/** The `passengers` array of an order body: submitted details on the offer's passenger ids. */
export function buildDuffelOrderPassengers({ passengers, contact, rawOffer, e164 }: {
    passengers: any[];
    contact: { email?: string };
    rawOffer: any;
    e164: string;
}): any[] {
    const templates: any[] = rawOffer?.passengers ?? [];
    return passengers.map((pax, idx) => ({
        id: templates[idx]?.id,
        title: duffelTitle(pax),
        given_name: pax.firstName,
        family_name: pax.lastName,
        born_on: pax.birthDate,
        email: contact.email,
        phone_number: e164,
        gender: (pax.gender ?? '').toUpperCase() === 'M' ? 'm' : 'f',
        // Passport details for the airline's APIS feed, when the offer asks for them.
        ...duffelIdentityDocuments(rawOffer, pax),
    }));
}
