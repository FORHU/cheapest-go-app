'use client';

import { useId } from 'react';
import { boxedLabelClass, fieldLabelClass, type FieldAppearance } from './field';

/**
 * Party size as a joined strip of 1–4: four choices are quicker to scan than a dropdown, and the
 * native radios keep it working inside a plain GET form with no script. Controlled with `value`
 * and `onChange`, or uncontrolled with `defaultValue` and `name`.
 */
export function GolfPlayersField({ label, name, value, defaultValue, onChange, options = [1, 2, 3, 4], appearance = 'ruled' }: {
    label: string;
    name?: string;
    value?: number;
    defaultValue?: number;
    onChange?: (players: number) => void;
    options?: number[];
    /** `ruled` (the storefront) or `boxed`, to sit among the admin's boxed inputs. */
    appearance?: FieldAppearance;
}) {
    const group = useId();
    const controlled = value !== undefined;
    const boxed = appearance === 'boxed';

    return (
        <fieldset className="golf-theme min-w-0">
            <legend className={boxed ? boxedLabelClass : fieldLabelClass}>{label}</legend>
            <div className={`mt-1 inline-flex overflow-hidden border ${boxed ? 'rounded-lg border-slate-200 dark:border-white/10' : 'rounded-sm border-g-rule'}`}>
                {options.map((n, i) => (
                    <label key={n} className={`relative cursor-pointer ${i > 0 ? `border-l ${boxed ? 'border-slate-200 dark:border-white/10' : 'border-g-rule'}` : ''}`}>
                        <input type="radio" name={name ?? group} value={n} className="peer sr-only"
                            {...(controlled ? { checked: value === n } : { defaultChecked: defaultValue === n })}
                            onChange={() => onChange?.(n)} />
                        <span className={`flex h-9 w-10 items-center justify-center text-sm tabular-nums transition-colors duration-150 peer-checked:font-semibold peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 ${boxed
                            ? 'text-slate-900 hover:bg-slate-50 peer-checked:bg-blue-600 peer-checked:text-white peer-focus-visible:outline-blue-600 dark:text-slate-100 dark:hover:bg-white/5'
                            : 'text-g-ink hover:bg-g-sunk peer-checked:bg-g-accent peer-checked:text-g-accent-ink peer-focus-visible:outline-g-accent'}`}>
                            {n}
                        </span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
}
