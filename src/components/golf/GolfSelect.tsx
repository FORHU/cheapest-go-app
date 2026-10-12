'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useDismiss } from './useDismiss';
import { fieldLabelClass, fieldTriggerClass, popoverClass } from './field';

export interface GolfSelectOption {
    value: string;
    label: string;
}

export interface GolfSelectProps {
    /** A visible label above the field. Without one, pass `ariaLabel`. */
    label?: string;
    ariaLabel?: string;
    /** Submitted with the surrounding form as a hidden input. */
    name?: string;
    value?: string;
    defaultValue?: string;
    onChange?: (value: string) => void;
    options: GolfSelectOption[];
    disabled?: boolean;
    /** Set the options' values (times, figures) in the mono face; the empty "any" option stays in words. */
    mono?: boolean;
    /** A small inline control (a quantity), not a full-width field. */
    compact?: boolean;
    /** Which edge of the field the list lines up with. */
    align?: 'left' | 'right';
}

/**
 * The golf dropdown: a select-only combobox (WAI-ARIA 1.2) styled as a ruled field with a
 * surface list. Focus stays on the button; arrows, Home/End, Enter/Space, Escape and type-ahead
 * work as in a native select, and the value reaches a plain form through a hidden input.
 */
export function GolfSelect({
    label, ariaLabel, name, value, defaultValue, onChange, options, disabled, mono, compact, align = 'left',
}: GolfSelectProps) {
    const id = useId();
    const labelId = `${id}-label`;
    const listId = `${id}-list`;
    const rootRef = useRef<HTMLDivElement>(null);
    const typed = useRef({ text: '', at: 0 });

    const [internal, setInternal] = useState(defaultValue ?? options[0]?.value ?? '');
    const current = value !== undefined ? value : internal;
    const selectedIndex = Math.max(0, options.findIndex(o => o.value === current));
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(selectedIndex);

    const close = useCallback(() => setOpen(false), []);
    useDismiss(rootRef, open, close);

    const openList = () => {
        setActive(selectedIndex);
        setOpen(true);
    };

    const commit = (index: number) => {
        const option = options[index];
        if (!option) return;
        if (value === undefined) setInternal(option.value);
        onChange?.(option.value);
        setOpen(false);
    };

    useEffect(() => {
        if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView?.({ block: 'nearest' });
    }, [open, active, id]);

    const onKeyDown = (event: React.KeyboardEvent) => {
        const last = options.length - 1;
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowUp': {
                event.preventDefault();
                if (!open) return openList();
                setActive(i => Math.min(last, Math.max(0, i + (event.key === 'ArrowDown' ? 1 : -1))));
                return;
            }
            case 'Home':
                if (open) { event.preventDefault(); setActive(0); }
                return;
            case 'End':
                if (open) { event.preventDefault(); setActive(last); }
                return;
            case 'Enter':
            case ' ':
                event.preventDefault();
                if (open) commit(active); else openList();
                return;
            case 'Escape':
                if (open) { event.preventDefault(); setOpen(false); }
                return;
            case 'Tab':
                setOpen(false);
                return;
            default: {
                if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
                // Type-ahead: letters typed in quick succession narrow to the next matching label.
                const now = Date.now();
                const buffer = now - typed.current.at > 600 ? event.key : typed.current.text + event.key;
                typed.current = { text: buffer, at: now };
                const from = open ? active + (buffer.length === 1 ? 1 : 0) : selectedIndex + 1;
                const order = [...options.keys()].map(i => (i + from) % options.length);
                const hit = order.find(i => options[i].label.toLowerCase().startsWith(buffer.toLowerCase()));
                if (hit === undefined) return;
                if (open) setActive(hit); else commit(hit);
            }
        }
    };

    const selectedLabel = options[selectedIndex]?.label ?? '';
    const trigger = compact
        ? 'flex h-9 w-16 items-center justify-between gap-1 rounded-sm border border-g-rule bg-g-surface px-2.5 text-left text-sm tabular-nums text-g-ink transition-colors hover:border-g-ink focus-visible:border-g-accent disabled:cursor-not-allowed disabled:opacity-50'
        : fieldTriggerClass;

    return (
        <div ref={rootRef} className={`golf-theme relative ${compact ? 'shrink-0' : 'min-w-0'}`}>
            {label && <span id={labelId} className={fieldLabelClass}>{label}</span>}
            <button type="button" role="combobox" disabled={disabled}
                aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
                aria-labelledby={label ? labelId : undefined} aria-label={label ? undefined : ariaLabel}
                aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
                onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKeyDown}
                className={trigger}>
                <span className={`truncate ${mono && current !== '' ? 'font-mono tabular-nums' : ''}`}>{selectedLabel}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-g-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {name && <input type="hidden" name={name} value={current} />}

            {open && (
                <ul id={listId} role="listbox" aria-label={label ?? ariaLabel}
                    className={`${popoverClass} max-h-64 min-w-full w-max overflow-auto py-1 ${align === 'right' ? 'left-auto right-0' : ''}`}>
                    {options.map((option, i) => {
                        const selected = option.value === current;
                        return (
                            <li key={option.value} id={`${id}-opt-${i}`} role="option" aria-selected={selected}
                                onPointerDown={e => e.preventDefault()}
                                onClick={() => commit(i)}
                                onPointerEnter={() => setActive(i)}
                                className={`flex cursor-pointer items-center justify-between gap-6 px-3 py-2 text-sm ${mono && option.value !== '' ? 'font-mono' : ''} tabular-nums ${i === active ? 'bg-g-sunk' : ''} ${selected ? 'font-semibold text-g-accent' : 'text-g-ink'}`}>
                                {option.label}
                                {selected && <Check className="h-4 w-4" aria-hidden />}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
