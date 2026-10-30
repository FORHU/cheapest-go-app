import { duffelIdentityDocuments } from './duffel-identity-documents';

export type OrderPassengersResult =
    | { ok: true; passengers: any[] }
    | { ok: false; code: 'phone_number_invalid'; message: string };

export type E164Result = { ok: true; e164: string } | { ok: false };

/**
 * Normalise a contact phone to E.164, or say it cannot be.
 *
 * The country code is digits only ("+82", "82" and "0082" agree); the number has non-digits and
 * leading zeros removed (Korean "010-…" becomes "10…"). Duffel rejects an order over a bad
 * number, so callers run this before a card is authorised rather than after.
 *
 * Exported because the authorise-first path has to judge a number *before* it has an offer to
 * build passengers against, while the order-first path only learns of it here. Both read this
 * one function, so the two cannot come to different conclusions about the same number — which
 * is how a card got held for an order Duffel then refused.
 */
export function toE164Phone(
    contact: { countryCode?: unknown; phone?: unknown } | null | undefined,
    defaultCountryCode = '82',
): E164Result {
    const countryCode = String(contact?.countryCode ?? defaultCountryCode).replace(/\D/g, '') || defaultCountryCode;
    const subscriber = String(contact?.phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
    const e164 = `+${countryCode}${subscriber}`;
    if (subscriber.length < 4 || countryCode.length + subscriber.length < 7 || !/^\+\d{7,15}$/.test(e164)) {
        return { ok: false };
    }
    return { ok: true, e164 };
}

/** Duffel accepts mr | ms | mrs | miss | dr. Children and infants are mr/miss by gender. */
function duffelTitle(pax: any): string {
    const gender = (pax.gender ?? '').toUpperCase();
    const type = (pax.type ?? '').toUpperCase();
    if (type === 'CHD' || type === 'INF') return gender === 'M' ? 'mr' : 'miss';
    return gender === 'M' ? 'mr' : 'ms';
}

/**
 * Duffel order passengers from the form data stored on a booking session.
 *
 * Passenger N on the order maps to passenger N on the offer — Duffel ties each traveller to
 * a specific offer passenger id. The phone is built E.164: the country code keeps digits only
 * ("+82", "82" and "0082" agree) and the number loses its trunk zero ("010-…" -> "10…").
 */
export function buildDuffelOrderPassengers(rawOffer: any, passengers: any[], contact: any): OrderPassengersResult {
    const phone = toE164Phone(contact);
    if (!phone.ok) {
        return {
            ok: false,
            code: 'phone_number_invalid',
            message: 'Invalid phone number. Please enter a valid phone number with country code.',
        };
    }
    const e164 = phone.e164;

    const templates: any[] = rawOffer?.passengers ?? [];
    return {
        ok: true,
        passengers: passengers.map((pax: any, idx: number) => ({
            id: templates[idx]?.id,
            title: duffelTitle(pax),
            given_name: pax.firstName,
            family_name: pax.lastName,
            born_on: pax.birthDate,
            email: contact.email,
            phone_number: e164,
            gender: (pax.gender ?? '').toUpperCase() === 'M' ? 'm' : 'f',
            // Passport details for the airline's APIS feed — see duffelIdentityDocuments.
            ...duffelIdentityDocuments(rawOffer, pax),
        })),
    };
}
