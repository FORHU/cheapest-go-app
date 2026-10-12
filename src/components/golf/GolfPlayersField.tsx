'use client';

import { useId } from 'react';
import { fieldLabelClass } from './field';

/**
 * Party size as a joined strip of 1–4: four choices are quicker to scan than a dropdown, and the
 * native radios keep it working inside a plain GET form with no script. Controlled with `value`
 * and `onChange`, or uncontrolled with `defaultValue` and `name`.
 */
export function GolfPlayersField({ label, name, value, defaultValue, onChange, options = [1, 2, 3, 4] }: {
    label: string;
    name?: string;
    value?: number;
    defaultValue?: number;
    onChange?: (players: number) => void;
    options?: number[];
}) {
    const group = useId();
    const controlled = value !== undefined;

    return (
        <fieldset className="golf-theme min-w-0">
            <legend className={fieldLabelClass}>{label}</legend>
            <div className="mt-1 inline-flex overflow-hidden rounded-sm border border-g-rule">
                {options.map((n, i) => (
                    <label key={n} className={`relative cursor-pointer ${i > 0 ? 'border-l border-g-rule' : ''}`}>
                        <input type="radio" name={name ?? group} value={n} className="peer sr-only"
                            {...(controlled ? { checked: value === n } : { defaultChecked: defaultValue === n })}
                            onChange={() => onChange?.(n)} />
                        <span className="flex h-9 w-10 items-center justify-center text-sm tabular-nums text-g-ink transition-colors duration-150 hover:bg-g-sunk peer-checked:bg-g-accent peer-checked:font-semibold peer-checked:text-g-accent-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 peer-focus-visible:outline-g-accent">
                            {n}
                        </span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
}
