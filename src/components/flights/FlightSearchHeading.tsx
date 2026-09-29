import React from 'react';

/*
 * The search page's heading, as the design draws it:
 *
 *   Clark International Airport to Heathrow Airport  CRK → LHR
 *   • October 1, 2026 ← October 3, 2026   • 1 adult   • Economy
 */

/** The airports named in full in the regular weight, then the codes in bold. */
export function FlightRouteTitle({ names, origin, destination }: {
    /** The translated "<origin> to <destination>" line, airports named in full. */
    names:       string;
    origin:      string;
    destination: string;
}) {
    return (
        <>
            <span className="font-normal">{names}</span>{' '}
            <span className="ml-1 font-bold whitespace-nowrap">{origin.toUpperCase()} → {destination.toUpperCase()}</span>
        </>
    );
}

/** The trip's facts under the title, each behind a bullet; empty ones are left out. */
export function FlightSearchMeta({ items }: { items: string[] }) {
    return (
        // Spans with list roles, not ul/li: the heading sets this inside a <p>.
        <span role="list" className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
            {items.filter(Boolean).map((item, i) => (
                <span role="listitem" key={i} className="whitespace-nowrap">
                    <span aria-hidden className="mr-0.5">•</span>{' '}{item}
                </span>
            ))}
        </span>
    );
}
