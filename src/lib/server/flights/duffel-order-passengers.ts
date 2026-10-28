import { duffelIdentityDocuments } from './duffel-identity-documents';

export type OrderPassengersResult =
    | { ok: true; passengers: any[] }
    | { ok: false; code: 'phone_number_invalid'; message: string };

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
    const countryCode = String(contact?.countryCode ?? '82').replace(/\D/g, '') || '82';
    const phone = String(contact?.phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
    const e164 = `+${countryCode}${phone}`;

    if (phone.length < 4 || countryCode.length + phone.length < 7 || !/^\+\d{7,15}$/.test(e164)) {
        return {
            ok: false,
            code: 'phone_number_invalid',
            message: 'Invalid phone number. Please enter a valid phone number with country code.',
        };
    }

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
