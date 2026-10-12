'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { addDays } from '@/lib/golf/time';
import { clampDate, isSelectable, monthGrid, monthOf, shiftMonth, shiftMonthKeepingDay } from '@/lib/golf/calendar';
import { useDismiss } from './useDismiss';
import { fieldLabelClass, fieldTriggerClass, popoverClass } from './field';

/** First day of the week for a locale: 0 = Sunday … 6 = Saturday. Sunday when the engine cannot say. */
function weekStartFor(locale: string): number {
    try {
        const l = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
        const first = l.getWeekInfo?.().firstDay ?? l.weekInfo?.firstDay;
        return typeof first === 'number' ? first % 7 : 0;
    } catch {
        return 0;
    }
}

const clientToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface GolfDatePickerProps {
    label: string;
    /** Submitted with the surrounding form as a hidden input. */
    name?: string;
    /** Controlled value ("YYYY-MM-DD", or '' for none). */
    value?: string;
    defaultValue?: string;
    onChange?: (date: string) => void;
    /** Inclusive bounds. */
    min?: string;
    max?: string;
    /** Marks this day on the grid (the course-local "today"). */
    today?: string;
    /** Shown while no date is chosen. */
    placeholder?: string;
    /** When set, a footer action with this text clears the date. */
    clearLabel?: string;
}

/**
 * A single-date picker in the golf theme: a ruled field that opens a month grid. The value is a
 * plain "YYYY-MM-DD" string, so it works inside a server-rendered GET form (hidden input) and as
 * controlled state alike. Arrow keys move by day and week, PageUp/PageDown by month, Escape closes.
 */
export function GolfDatePicker({ label, name, value, defaultValue = '', onChange, min, max, today, placeholder, clearLabel }: GolfDatePickerProps) {
    const t = useTranslations('golf.search');
    const locale = useLocale();
    const id = useId();
    const labelId = `${id}-label`;
    const buttonId = `${id}-button`;
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    // Keyboard focus follows the anchored day only after opening or a key move, never a click on a nav button.
    const focusDay = useRef(false);

    const [internal, setInternal] = useState(defaultValue);
    const current = value !== undefined ? value : internal;
    const [open, setOpen] = useState(false);
    const [view, setView] = useState(() => monthOf(current || min || today || '2000-01-01'));
    const [focus, setFocus] = useState(current || min || today || '');

    const weekStart = useMemo(() => weekStartFor(locale), [locale]);
    const formats = useMemo(() => ({
        long: new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }),
        medium: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }),
        month: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
        narrow: new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }),
    }), [locale]);
    const at = (date: string) => new Date(`${date}T00:00:00Z`);

    const close = useCallback((refocus = false) => {
        setOpen(false);
        if (refocus) triggerRef.current?.focus();
    }, []);
    useDismiss(rootRef, open, () => close());

    const commit = (date: string) => {
        if (value === undefined) setInternal(date);
        onChange?.(date);
        close(true);
    };

    const openCalendar = () => {
        const start = clampDate(current || today || clientToday(), min, max);
        setView(monthOf(start));
        setFocus(start);
        focusDay.current = true;
        setOpen(true);
    };

    // Put keyboard focus on the day the grid is anchored to whenever it opens or moves.
    useEffect(() => {
        if (!open || !focusDay.current) return;
        focusDay.current = false;
        dialogRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus();
    }, [open, focus, view]);

    const move = (next: string) => {
        const clamped = clampDate(next, min, max);
        focusDay.current = true;
        setFocus(clamped);
        setView(monthOf(clamped));
    };

    const onGridKeyDown = (event: React.KeyboardEvent) => {
        const key = event.key;
        const onDay = Boolean((event.target as HTMLElement).dataset?.date);
        const col = (new Date(`${focus}T00:00:00Z`).getUTCDay() - weekStart + 7) % 7;
        const next: Record<string, string> = {
            ArrowLeft: addDays(focus, -1),
            ArrowRight: addDays(focus, 1),
            ArrowUp: addDays(focus, -7),
            ArrowDown: addDays(focus, 7),
            PageUp: shiftMonthKeepingDay(focus, event.shiftKey ? -12 : -1),
            PageDown: shiftMonthKeepingDay(focus, event.shiftKey ? 12 : 1),
            Home: addDays(focus, -col),
            End: addDays(focus, 6 - col),
        };
        if (key === 'Escape') {
            event.preventDefault();
            close(true);
        } else if (onDay && next[key]) {
            event.preventDefault();
            move(next[key]);
        }
    };

    const days = monthGrid(view, weekStart);
    const weekdays = Array.from({ length: 7 }, (_, i) => addDays('2023-01-01', weekStart + i));
    const canGoBack = !min || monthOf(min) < view;
    const canGoForward = !max || monthOf(max) > view;
    const shown = current ? formats.medium.format(at(current)) : (placeholder ?? t('chooseDate'));

    return (
        <div ref={rootRef} className="golf-theme relative min-w-0">
            <span id={labelId} className={fieldLabelClass}>{label}</span>
            <button ref={triggerRef} id={buttonId} type="button" aria-haspopup="dialog" aria-expanded={open}
                aria-labelledby={`${labelId} ${buttonId}`}
                onClick={() => (open ? close() : openCalendar())}
                className={fieldTriggerClass}>
                <span className={`truncate tabular-nums ${current ? 'text-g-ink' : 'text-g-muted'}`}>{shown}</span>
                <CalendarDays className="h-4 w-4 shrink-0 text-g-muted" aria-hidden />
            </button>
            {name && <input type="hidden" name={name} value={current} />}

            {open && (
                <div ref={dialogRef} role="dialog" aria-label={label} onKeyDown={onGridKeyDown}
                    className={`${popoverClass} w-[max(100%,18rem)] max-w-[calc(100vw-2rem)] p-3`}>
                    <div className="mb-3 flex items-center justify-between">
                        <button type="button" aria-label={t('prevMonth')} disabled={!canGoBack}
                            onClick={() => { setView(shiftMonth(view, -1)); setFocus(clampDate(shiftMonthKeepingDay(focus, -1), min, max)); }}
                            className="flex h-9 w-9 items-center justify-center rounded-sm text-g-ink transition-colors hover:bg-g-sunk disabled:opacity-30 disabled:hover:bg-transparent">
                            <ChevronLeft className="h-4 w-4" aria-hidden />
                        </button>
                        <p className="font-golf text-lg font-bold tracking-tight text-g-ink" aria-live="polite">{formats.month.format(at(`${view}-01`))}</p>
                        <button type="button" aria-label={t('nextMonth')} disabled={!canGoForward}
                            onClick={() => { setView(shiftMonth(view, 1)); setFocus(clampDate(shiftMonthKeepingDay(focus, 1), min, max)); }}
                            className="flex h-9 w-9 items-center justify-center rounded-sm text-g-ink transition-colors hover:bg-g-sunk disabled:opacity-30 disabled:hover:bg-transparent">
                            <ChevronRight className="h-4 w-4" aria-hidden />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 border-b border-g-rule pb-1.5" aria-hidden>
                        {weekdays.map(d => (
                            <span key={d} className="text-center text-xs text-g-muted">{formats.narrow.format(at(d))}</span>
                        ))}
                    </div>

                    <div className="mt-1.5 grid grid-cols-7 gap-y-0.5" role="group" aria-label={formats.month.format(at(`${view}-01`))}>
                        {days.map(({ date, inMonth }) => {
                            const selectable = isSelectable(date, min, max);
                            const selected = date === current;
                            const state = selected
                                ? 'bg-g-accent font-semibold text-g-accent-ink after:bg-g-accent-ink'
                                : !selectable ? 'cursor-not-allowed text-g-muted/40'
                                    : inMonth ? 'text-g-ink hover:bg-g-sunk' : 'text-g-muted hover:bg-g-sunk';
                            return (
                                <button key={date} type="button" data-date={date} disabled={!selectable}
                                    tabIndex={date === focus ? 0 : -1}
                                    aria-label={formats.long.format(at(date))} aria-pressed={selected}
                                    onClick={() => commit(date)}
                                    className={`relative flex h-9 items-center justify-center rounded-sm text-sm tabular-nums transition-colors motion-safe:active:scale-95 ${state} ${date === today ? 'after:absolute after:bottom-1.5 after:h-0.5 after:w-3 after:bg-g-accent' : ''}`}>
                                    {Number(date.slice(8, 10))}
                                </button>
                            );
                        })}
                    </div>

                    {clearLabel && (
                        <div className="mt-3 flex justify-end border-t border-g-rule pt-3">
                            <button type="button" onClick={() => commit('')} disabled={!current}
                                className="text-sm font-medium text-g-accent underline-offset-4 hover:underline disabled:opacity-40 disabled:hover:no-underline">
                                {clearLabel}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
