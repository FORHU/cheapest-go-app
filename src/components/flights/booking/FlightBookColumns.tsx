import React from 'react';

/**
 * The flight book page's frame, as the design lays it out (Figma "Version 1",
 * the flight book frame — 883 + 41 + 883 across a 1924 artboard): the trip
 * heading, then two equal columns. The flight sits on the left and stays in
 * view while the passenger, contact and payment cards on the right scroll past
 * it. Below lg the columns stack, flight first.
 */
export function FlightBookColumns({
    heading, flight, top, children,
}: {
    heading:  React.ReactNode;
    flight:   React.ReactNode;
    /** Anything above the heading — the back button. */
    top?:     React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="max-w-7xl mx-auto">
            <div className="mb-3 lg:mb-4">
                {top}
                <h1 className="text-sm lg:text-2xl font-normal text-[#1c1b1f] dark:text-white">{heading}</h1>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-10 items-start">
                <aside className="lg:sticky lg:top-6 space-y-3 lg:space-y-5 min-w-0">{flight}</aside>
                <div className="min-w-0">{children}</div>
            </div>
        </div>
    );
}
