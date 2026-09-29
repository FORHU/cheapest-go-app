import { getAirportByCode } from '@/lib/airports';

/**
 * An airport named in full with its code — "Clark International Airport (CRK)".
 *
 * A code the table does not carry is shown as itself: the three letters on the boarding
 * pass beat an invented name.
 */
export function airportLabel(code: string | undefined): string {
    if (!code) return '';
    const iata = code.toUpperCase();
    const name = getAirportByCode(iata)?.name;
    return name ? `${name} (${iata})` : iata;
}

/**
 * An airport named in full, without its code — "Clark International Airport" — for a
 * line that states the codes on their own beside it. Unknown codes read as themselves.
 */
export function airportName(code: string | undefined): string {
    if (!code) return '';
    const iata = code.toUpperCase();
    return getAirportByCode(iata)?.name ?? iata;
}
