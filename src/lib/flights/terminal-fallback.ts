import type { FlightSegmentDetail } from '@/types/flights';

/**
 * Standing terminal assignments for the airports this app sends the most traffic
 * through, keyed by the operating carrier.
 *
 * Duffel returns a terminal only for a handful of carriers — IAG (BA/AA/IB),
 * Lufthansa Group, Singapore Airlines. Every other airline, Korean Air and Asiana
 * and every low-cost carrier included, reaches a flight card with no terminal at
 * all, even though the flight plainly leaves from a real one. This table fills
 * that gap for the routes that matter here.
 *
 * These are operational facts that airlines change. Last checked: 2026-02. Treat a
 * wrong entry as a bug — delete it rather than let a card state a terminal the
 * traveller will not find. An airport with no safe catch-all has no `default`, and
 * an unlisted carrier there gets nothing rather than a guess.
 */
const TERMINALS: Record<string, { byAirline: Record<string, string>; default?: string }> = {
    // Incheon — T2 is the Korean Air / SkyTeam building; T1 is Asiana, Star
    // Alliance, oneworld, and every Korean low-cost carrier.
    ICN: {
        byAirline: {
            KE: '2', DL: '2', AF: '2', KL: '2', MU: '2', CZ: '2', CI: '2', GA: '2',
            AZ: '2', VN: '2', KQ: '2', ME: '2', SV: '2', AM: '2', OK: '2', RO: '2',
        },
        default: '1',
    },
    // Manila (NAIA) — Philippine Airlines owns T2 outright; the domestic low-cost
    // carriers sit in T3. T1 and the rest of T3 are too mixed for a default.
    MNL: {
        byAirline: {
            PR: '2', '2P': '2',
            '5J': '3', DG: '3', Z2: '3', PQ: '3',
        },
    },
    // Narita — T1 for ANA/Star and the SkyTeam carriers, T2 for JAL/oneworld,
    // T3 for the low-cost carriers. No default — the three are genuinely split.
    NRT: {
        byAirline: {
            NH: '1', OZ: '1', UA: '1', AC: '1', LH: '1', SQ: '1', TG: '1',
            KE: '1', DL: '1', AF: '1', KL: '1', MU: '1', CI: '1',
            JL: '2', AA: '2', BA: '2', CX: '2', QF: '2', MH: '2', QR: '2', AY: '2',
            '7C': '3', TW: '3', GK: '3', IJ: '3', JW: '3',
        },
    },
    // Kansai — T2 is Peach's standalone low-cost building; everything else is T1.
    KIX: {
        byAirline: { MM: '2' },
        default: '1',
    },
};

/**
 * The terminal `airlineCode` uses at `airport`, from the standing-assignment table.
 * Undefined when the airport is not one we track, or when it is but the carrier
 * has no entry and the airport has no safe default.
 */
export function fallbackTerminal(airport: string, airlineCode: string | undefined): string | undefined {
    const entry = TERMINALS[(airport ?? '').toUpperCase()];
    if (!entry) return undefined;
    return entry.byAirline[(airlineCode ?? '').toUpperCase()] ?? entry.default;
}

/**
 * The terminal a segment uses at one end: the provider's value if it gave one,
 * otherwise the standing assignment for the carrier actually operating the flight
 * (a codeshare sits where the metal sits, not where the marketing brand does).
 */
export function segmentTerminal(seg: FlightSegmentDetail, end: 'departure' | 'arrival'): string | undefined {
    const point = seg[end];
    if (point.terminal) return point.terminal;
    const carrier = seg.operatingAirline?.code || seg.airline?.code;
    return fallbackTerminal(point.airport, carrier);
}
