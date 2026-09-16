'use client';

import React, { useId } from 'react';

/**
 * A two-knob range, built from two native range inputs stacked on one track.
 *
 * Native inputs rather than pointer handlers on a div: they arrive keyboard-operable and
 * announced to a screen reader, which a div rebuilt from mousedown never quite is. The
 * cost is that both inputs cover the whole track, so only the knobs may take the pointer —
 * see the pointer-events rules below.
 */
export interface RangeSliderProps {
    min: number;
    max: number;
    value: [number, number];
    onChange: (value: [number, number]) => void;
    step?: number;
    /** Named for a screen reader, which hears two sliders and needs to tell them apart. */
    label: string;
    /** Turns a raw number into what the knob announces, e.g. 480 into "08:00". */
    formatValue?: (value: number) => string;
    disabled?: boolean;
    className?: string;
}

export function RangeSlider({
    min,
    max,
    value,
    onChange,
    step = 1,
    label,
    formatValue,
    disabled = false,
    className,
}: RangeSliderProps) {
    const id = useId();
    const [low, high] = value;

    // A range of zero width would divide by zero below; it also cannot be dragged, so the
    // track simply renders full.
    const span = max - min;
    const toPercent = (v: number) => (span <= 0 ? 0 : ((v - min) / span) * 100);

    const announce = (v: number) => (formatValue ? formatValue(v) : String(v));

    /** Knobs never cross: each end pushes against the other rather than past it. */
    const setLow = (next: number) => onChange([Math.min(next, high), high]);
    const setHigh = (next: number) => onChange([low, Math.max(next, low)]);

    const fillLeft = toPercent(low);
    const fillRight = 100 - toPercent(high);

    return (
        <div className={`relative h-4 w-full ${disabled ? 'opacity-40' : ''} ${className ?? ''}`}>
            {/* Track */}
            <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-200 dark:bg-slate-700" />
            {/* The selected span of it */}
            <div
                className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-blue-600"
                style={{ left: `${fillLeft}%`, right: `${fillRight}%` }}
            />

            {[
                { end: 'low' as const, v: low, set: setLow },
                { end: 'high' as const, v: high, set: setHigh },
            ].map(({ end, v, set }) => (
                <input
                    key={end}
                    id={`${id}-${end}`}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={v}
                    disabled={disabled}
                    onChange={e => set(Number(e.target.value))}
                    aria-label={`${label} — ${end === 'low' ? 'minimum' : 'maximum'}`}
                    aria-valuetext={announce(v)}
                    // The input spans the whole track so its knob can reach either end, which
                    // would leave the upper one swallowing every click. Only the knobs take
                    // the pointer; the track itself is inert.
                    className="pointer-events-none absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent focus:outline-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-blue-600"
                />
            ))}
        </div>
    );
}

export default RangeSlider;
