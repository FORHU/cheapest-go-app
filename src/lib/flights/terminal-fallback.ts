import type { FlightSegmentDetail } from '@/types/flights';
import { getAirportByCode } from '@/lib/airports';

/**
 * A carrier's terminal at one airport: either fixed, or split by whether the
 * flight is domestic or international — needed where an airline's own schedule
 * uses two different buildings depending on the route, not just the airport.
 */
type TerminalAssignment = string | { domestic?: string; international?: string };

/**
 * Standing terminal assignments for the airports this app sends the most traffic
 * through, keyed by the operating carrier.
 *
 * Duffel returns a terminal only for a handful of carriers — IAG (BA/AA/IB),
 * Lufthansa Group, Singapore Airlines. Every other airline, Korean Air Group and
 * every low-cost carrier included, reaches a flight card with no terminal at all,
 * even though the flight plainly leaves from a real one. This table fills that
 * gap for the routes that matter here.
 *
 * These are operational facts that airlines change. Last checked: 2026-09.
 * Treat a wrong entry as a bug — delete it rather than let a card state a
 * terminal the traveller will not find. An airport with no safe catch-all has no
 * `default`, and an unlisted carrier there gets nothing rather than a guess. The
 * same goes for a split carrier queried without knowing domestic vs
 * international — see `fallbackTerminal` below.
 */
const TERMINALS: Record<string, { byAirline: Record<string, TerminalAssignment>; default?: string }> = {
    // Incheon — T2 is Korean Air Group's building: Korean Air, Asiana, Asiana's
    // regional units (Jin Air, Air Busan, Air Seoul), and SkyTeam partners. T1 is
    // Star Alliance, oneworld, and the independent Korean low-cost carriers.
    ICN: {
        byAirline: {
            KE: '2', OZ: '2', LJ: '2', BX: '2', RS: '2',
            DL: '2', AF: '2', KL: '2', MU: '2', CZ: '2', CI: '2', GA: '2',
            AZ: '2', VN: '2', KQ: '2', ME: '2', SV: '2', AM: '2', OK: '2', RO: '2',
        },
        default: '1',
    },
    // Manila (NAIA) — Philippine Airlines and AirAsia Philippines both split by
    // flight type: domestic on Terminal 2, international on Terminal 1. Cebu
    // Pacific stays in Terminal 3 either way. Everything else is too mixed
    // for a default.
    MNL: {
        byAirline: {
            PR: { domestic: '2', international: '1' },
            '2P': { domestic: '2', international: '1' },
            Z2: { domestic: '2', international: '1' },
            '5J': '3', DG: '3', PQ: '3',
        },
    },
    // Narita — T1 for ANA/Star and the SkyTeam carriers, T2 for JAL/oneworld,
    // T3 for the low-cost carriers. No default — the three are genuinely split.
    // (Asiana's T1 seat here is Narita's own building, unrelated to its Incheon
    // move — the two airports assign terminals independently.)
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
 * Airports confirmed to have exactly one passenger terminal, so every carrier
 * there uses it — there is nothing to split by airline or by domestic vs.
 * international. Only ever consulted for an airport with no entry in
 * `TERMINALS` above; an airport genuinely has one building or it does not,
 * so the two tables never need to agree on the same code.
 *
 * Curated the same way as `TERMINALS`: confirmed per-airport, checked
 * 2026-09. Treat a wrong entry as a bug — a terminal count is an operational
 * fact that changes when an airport expands, so delete an entry rather than
 * let a card state a terminal that no longer exists.
 */
const SINGLE_TERMINAL_AIRPORTS = new Set<string>([
    // ── Philippines ──
    'DVO', // Davao — 1 passenger terminal
    'ILO', // Iloilo Intl — 1 passenger terminal
    'KLO', // Kalibo Intl — 1 passenger terminal (expansion planned, not yet built)
    'PPS', // Puerto Princesa Intl — 1 passenger terminal since the old one closed 2017
    'TAG', // Bohol-Panglao Intl — 1 passenger terminal

    // ── South Korea ──
    'CJU', // Jeju Intl — 1 combined domestic + international terminal

    // ── Japan ──
    'ITM', // Osaka Itami — 1 terminal building (North/Central/South are sections of it, not separate terminals)

    // ── China ──
    'PKX', // Beijing Daxing — 1 "starfish" terminal building
    'SZX', // Shenzhen Bao'an — 1 terminal (T3); its 2021 addition is a satellite concourse of T3, not a second terminal

    // ── Hong Kong / Macau ──
    'MFM', // Macau Intl — 1 passenger terminal building

    // ── Southeast Asia ──
    'PEN', // Penang Intl — 1 terminal building (expansion not opening until 2027-2028)
    'LGK', // Langkawi Intl — 1 terminal
    'REP', // Siem Reap Angkor Intl — 1 terminal (new airport, opened Oct 2023)

    // ── South Asia ──
    'HYD', // Hyderabad Rajiv Gandhi Intl — 1 integrated terminal (Western intl / Eastern domestic wings)
    'ISB', // Islamabad Intl — 1 Y-shaped terminal building
    'KHI', // Karachi Jinnah Intl — 1 active terminal (Jinnah Terminal, East/West concourses); old T1-T3 defunct

    // ── Middle East ──
    'DOH', // Doha Hamad Intl — 1 terminal (Concourses D/E are within it)
    'BAH', // Bahrain Intl — 1 terminal (New Passenger Terminal, opened Jan 2021)
    'MCT', // Muscat Intl — 1 crescent-shaped terminal
    'AMM', // Amman Queen Alia Intl — 1 terminal, two connected concourses
    'IST', // Istanbul Airport — 1 terminal building (future phases add more, none open yet)

    // ── United States ──
    // (Denver, Miami and Dulles are also 1-terminal airports, but none of
    // them names its terminal "1" — see the exclusion test for why they are
    // deliberately left out here rather than mislabeled.)

    // ── Canada ──
    'YUL', // Montreal-Trudeau — 1 integrated terminal (domestic/transborder/international are zones within it)

    // ── Europe ──
    'STN', // London Stansted — 1 terminal (three connected pier sections)
    'EDI', // Edinburgh — 1 terminal
    'AMS', // Amsterdam Schiphol — 1 terminal, divided into 3 interconnected departure halls
    'PMI', // Palma de Mallorca — 1 terminal building (modules A-D, formerly separate, now merged)
    'VCE', // Venice Marco Polo — 1 terminal
    'BRU', // Brussels — 1 passenger terminal (Piers A/B; Pier C is cargo-only)
    'OSL', // Oslo Gardermoen — 1 terminal building, four piers
    'HEL', // Helsinki-Vantaa — merged into 1 terminal with centralized check-in, June 2022
    'LED', // St. Petersburg Pulkovo — 1 terminal (opened 2013-2014, replaced the old Pulkovo-1/Pulkovo-2)

    // ── Africa ──
    'CPT', // Cape Town Intl — 1 Central Terminal Building (international wing north, domestic wing south)
    'DSS', // Dakar Blaise Diagne — 1 terminal

    // ── Oceania ──
    'CHC', // Christchurch — 1 integrated terminal (international/domestic are zones within it)

    // ── Central & South America ──
    'LIM', // Lima Jorge Chávez — 1 terminal (new terminal fully replaced the old one, opened June 2025)
    'UIO', // Quito Mariscal Sucre — 1 terminal
]);

/**
 * The terminal `airlineCode` uses at `airport`, from the standing-assignment table.
 * Undefined when the airport is not one we track, when the carrier has no entry
 * and the airport has no safe default, or when the carrier's assignment is split
 * by flight type and `isDomestic` was not supplied — handing back either half
 * would be a guess half the time.
 */
export function fallbackTerminal(airport: string, airlineCode: string | undefined, isDomestic?: boolean): string | undefined {
    const code = (airport ?? '').toUpperCase();
    const entry = TERMINALS[code];
    if (!entry) return SINGLE_TERMINAL_AIRPORTS.has(code) ? '1' : undefined;
    const assignment = entry.byAirline[(airlineCode ?? '').toUpperCase()];
    if (typeof assignment === 'string') return assignment;
    if (assignment) {
        return isDomestic === true ? assignment.domestic : isDomestic === false ? assignment.international : undefined;
    }
    return entry.default;
}

/**
 * Whether a segment stays within one country — the same question for both of its
 * ends, since a flight does not change nationality mid-air. Undefined when either
 * airport is outside the curated list, so a split assignment is left unguessed
 * rather than resolved against a country we do not actually know.
 */
function isDomesticSegment(seg: FlightSegmentDetail): boolean | undefined {
    const originCountry = getAirportByCode(seg.origin)?.countryCode;
    const destinationCountry = getAirportByCode(seg.destination)?.countryCode;
    if (!originCountry || !destinationCountry) return undefined;
    return originCountry === destinationCountry;
}

/**
 * The terminal a segment uses at one end: the provider's value if it gave one,
 * otherwise the standing assignment for the carrier actually operating the flight
 * (a codeshare sits where the metal sits, not where the marketing brand does),
 * resolved against whether this particular segment is domestic or international.
 */
export function segmentTerminal(seg: FlightSegmentDetail, end: 'departure' | 'arrival'): string | undefined {
    const point = seg[end];
    if (point.terminal) return point.terminal;
    const carrier = seg.operatingAirline?.code || seg.airline?.code;
    return fallbackTerminal(point.airport, carrier, isDomesticSegment(seg));
}
