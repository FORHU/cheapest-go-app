/**
 * Which supplier destination a searched name resolves to — one rule, for every caller.
 *
 * Two places used to decide this and they decided it oppositely. The live resolver preferred
 * ZONE over CITY when a country was known; the nightly catalog sync preferred CITY over ZONE
 * and, among equals, whichever the supplier happened to page first. Both write the same
 * `tgx_destination_cache` row with `ON CONFLICT DO UPDATE`, so a destination meant whatever
 * the last writer thought and changed meaning when the other one ran.
 *
 * Preferring one type over the other cannot be the rule, because each preference has already
 * produced a wrong answer in production:
 *
 *   - ZONE-first sent "Paris, France" to Alpine-Casparis Municipal Airport, and would send
 *     "Jeju" to Jeju International Airport — the only zone the searcher returns for it.
 *   - CITY-first is decided, among equals, by the order the supplier paged its catalog in.
 *
 * Both failures share one cause: a candidate was chosen that the query did not name. So the
 * rule is about the name, and nothing else:
 *
 *   1. A candidate whose name is unrelated to the query is never selected. Not as a fallback,
 *      not as a last resort — an unrelated place is a wrong answer wearing a right one's
 *      clothes, and returning nothing lets the caller fall back to the hotel-code path
 *      honestly.
 *   2. Then an exact name match, then the lowest code: a total order, so the answer never
 *      depends on the order the supplier happened to return things in.
 *
 * What this deliberately does *not* do is prefer a broader destination to a narrower one.
 * That was tried, and the supplier's own catalog refuted it: for Jeju, TGX lists an island
 * zone (6049718) with Jeju City (6052863) and Seogwipo City (6052864) beneath it, which reads
 * exactly like the hierarchy you would want to climb — and all three return a single hotel on
 * this access, while the flat city code 850 returns four hundred spanning the whole island.
 * A place's position in the supplier's hierarchy says nothing about the inventory behind it.
 *
 * Coverage is the only sound arbiter of that, and it is already measured where it can be:
 * `isThinDestinationAnswer` compares what a code answered against what the catalog holds, at
 * search time, when a real count exists. Selection cannot know it without asking, so selection
 * does not guess.
 *
 * See CONTEXT.md, "Multi-City Destination".
 */

export interface DestinationCandidate {
    code:       string;
    /** The supplier's own label (CITY, ZONE, …). Carried for storage, never for selection. */
    type:       string;
    /** The English name the supplier gives this destination. */
    name:       string;
    /** Carried so callers can store it; the hierarchy is recorded, not trusted. */
    parentCode: string | null;
}

/** Lowercased and trimmed, with runs of whitespace collapsed. Spaces are kept, because word
 *  boundaries are what separate "Paris" from "Alpine-Casparis". */
function norm(value: string): string {
    return value.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Whether a candidate names the place that was asked for.
 *
 * Equal, or the query followed by a word boundary — "jeju" relates to "Jeju Island" and "Jeju
 * City". The boundary is the whole point: without it "paris" relates to "Alpine-Casparis
 * Municipal Airport", which is how that bug happened.
 */
export function isRelatedName(candidateName: string, query: string): boolean {
    const c = norm(candidateName);
    const q = norm(query);
    if (!c || !q) return false;
    return c === q || c.startsWith(`${q} `);
}

/**
 * The destination a query resolves to, or undefined when nothing in the list names it.
 *
 * Undefined is a real answer and callers must keep treating it as one: it means the supplier
 * has nothing by this name, which is different from having something unsuitable.
 */
export function selectDestination(
    candidates: DestinationCandidate[],
    query: string,
): DestinationCandidate | undefined {
    const related = candidates.filter(c => c.code && isRelatedName(c.name, query));
    if (related.length === 0) return undefined;
    if (related.length === 1) return related[0];

    // The name that was asked for beats one that merely begins with it, so "Jeju" is the
    // place called Jeju rather than its airport.
    const rank = (c: DestinationCandidate): number => (norm(c.name) === norm(query) ? 0 : 1);

    return [...related].sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code))[0];
}
