import React from 'react';

/**
 * A passenger reclining in an airline seat — Material Symbols' airline_seat_recline_extra,
 * which the trips card design uses to count travellers.
 *
 * Inlined rather than imported: the icon set this app draws from (lucide) has no seated
 * passenger, and its nearest glyphs — a person's bust, an armchair — say something else.
 * Takes its colour from `currentColor`, so it is styled like every other icon here.
 */
export function AirlineSeatReclineIcon({ className }: { className?: string }) {
    return (
        <svg
            aria-hidden="true"
            className={className}
            viewBox="0 0 14 14"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path d="M4.77883 3.66819C4.48415 3.66819 4.23099 3.56236 4.01933 3.35071C3.80778 3.13905 3.702 2.88589 3.702 2.59121C3.702 2.29662 3.80778 2.04351 4.01933 1.83185C4.23099 1.6202 4.48415 1.51437 4.77883 1.51437C5.07351 1.51437 5.32668 1.6202 5.53833 1.83185C5.74999 2.04351 5.85581 2.29662 5.85581 2.59121C5.85581 2.88589 5.74999 3.13905 5.53833 3.35071C5.32668 3.56236 5.07351 3.66819 4.77883 3.66819ZM8.16669 11.3749H4.55002C4.25534 11.3749 3.98745 11.2747 3.74633 11.0742C3.50513 10.8738 3.35424 10.6263 3.29367 10.3316L2.05292 4.08323H2.94585L4.1955 10.3204C4.20678 10.3653 4.2339 10.4064 4.27688 10.4437C4.31985 10.4812 4.36379 10.4999 4.40871 10.4999H8.16669V11.3749ZM11.2516 12.6537L9.6609 9.91656H5.52827C5.27997 9.91656 5.06627 9.8418 4.88719 9.69227C4.70801 9.54264 4.59115 9.34742 4.5366 9.1066L3.87248 5.90731C3.77672 5.47428 3.87676 5.09755 4.1726 4.7771C4.46835 4.45666 4.82151 4.29644 5.23208 4.29644C5.53872 4.29644 5.81843 4.38821 6.07121 4.57177C6.32399 4.75542 6.48552 5.00538 6.55581 5.32164L7.23102 8.45823H9.2616C9.43952 8.45823 9.6048 8.50421 9.75744 8.59619C9.90998 8.68816 10.0341 8.81421 10.1298 8.97433L12.0144 12.2162L11.2516 12.6537Z" />
        </svg>
    );
}
