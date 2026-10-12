'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { GolfDatePicker } from '@/components/golf/GolfDatePicker';
import { GolfSelect } from '@/components/golf/GolfSelect';
import type { CourseBlock } from '@/lib/schemas/golfTeeSheet';
import { inputClass, labelClass, primaryButton, secondaryButton, timeOptions, withValue, type Review } from './shared';

const WEEK = [1, 2, 3, 4, 5, 6, 0];

function BlockForm({ initialDate, review, onCancel }: { initialDate: string; review: Review; onCancel: () => void }) {
    const t = useTranslations('golf.staff.sheet');
    const locale = useLocale();
    const [from, setFrom] = useState(initialDate);
    const [to, setTo] = useState(initialDate);
    const [weekdays, setWeekdays] = useState<number[]>([]);
    const [windowed, setWindowed] = useState(false);
    const [first, setFirst] = useState('07:00');
    const [last, setLast] = useState('10:00');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});

    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    const options = timeOptions(10);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        setFieldErrors({});
        const result = await review({
            action: 'block_add',
            block: {
                startsOn: from, endsOn: to, weekdays, note,
                fromTime: windowed ? first : null, toTime: windowed ? last : null,
            },
        });
        setBusy(false);
        if (result.error) setError(result.error);
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
    };
    const err = (...fields: string[]) => {
        const message = fields.map(f => fieldErrors[f]?.[0]).find(Boolean);
        return message ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{message}</p> : null;
    };

    return (
        <form onSubmit={submit} className="grid gap-6 border-t border-g-ink pt-6 sm:grid-cols-2">
            <div>
                <GolfDatePicker label={t('blockFrom')} value={from} onChange={next => { if (next) { setFrom(next); if (to < next) setTo(next); } }} />
                {err('startsOn')}
            </div>
            <div>
                <GolfDatePicker label={t('blockTo')} value={to} min={from} onChange={next => { if (next) setTo(next); }} />
                {err('endsOn')}
            </div>

            <fieldset className="sm:col-span-2">
                <legend className={labelClass}>{t('blockWeekdays')}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                    {WEEK.map(d => {
                        const on = weekdays.includes(d);
                        return (
                            <button key={d} type="button" aria-pressed={on}
                                onClick={() => setWeekdays(current => on ? current.filter(x => x !== d) : [...current, d])}
                                className={`rounded-sm border px-3 py-1.5 text-sm transition-colors ${on
                                    ? 'border-g-accent bg-g-accent text-g-accent-ink'
                                    : 'border-g-rule text-g-ink hover:border-g-ink'}`}>
                                {weekday.format(new Date(Date.UTC(2023, 0, 1 + d)))}
                            </button>
                        );
                    })}
                </div>
            </fieldset>

            <fieldset className="sm:col-span-2">
                <div className="flex flex-wrap gap-6 text-sm text-g-ink">
                    <label className="flex items-center gap-2">
                        <input type="radio" name="block-window" checked={!windowed} onChange={() => setWindowed(false)} className="accent-[var(--g-accent)]" />
                        {t('blockAllDay')}
                    </label>
                    <label className="flex items-center gap-2">
                        <input type="radio" name="block-window" checked={windowed} onChange={() => setWindowed(true)} className="accent-[var(--g-accent)]" />
                        {t('blockBetween')}
                    </label>
                </div>
            </fieldset>

            {windowed && (
                <>
                    <div>
                        <GolfSelect label={t('blockFirst')} value={first} onChange={setFirst} options={withValue(options, first)} mono />
                        {err('fromTime')}
                    </div>
                    <div>
                        <GolfSelect label={t('blockLast')} value={last} onChange={setLast} options={withValue(options, last)} mono />
                        {err('toTime')}
                    </div>
                </>
            )}

            <label className={`${labelClass} sm:col-span-2`}>
                {t('blockNote')}
                <input className={inputClass} value={note} maxLength={300} placeholder={t('blockNotePlaceholder')}
                    onChange={e => setNote(e.target.value)} />
                {err('note')}
            </label>

            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400 sm:col-span-2">{error}</p>}

            <div className="flex gap-3 sm:col-span-2">
                <button type="submit" disabled={busy} className={primaryButton}>{t('review')}</button>
                <button type="button" onClick={onCancel} className={secondaryButton}>{t('cancel')}</button>
            </div>
        </form>
    );
}

export function BlockSection({ blocks, hasTimeZone, startDate, openRequest, review }: {
    blocks: CourseBlock[];
    hasTimeZone: boolean;
    /** The date a new block starts on: the day currently shown. */
    startDate: string;
    /** Bumped by the day view's "Block this day" to open the form. */
    openRequest: number;
    review: Review;
}) {
    const t = useTranslations('golf.staff.sheet');
    const locale = useLocale();
    const [open, setOpen] = useState(false);
    const [formDate, setFormDate] = useState(startDate);

    useEffect(() => {
        if (openRequest > 0) { setFormDate(startDate); setOpen(true); }
        // Opening is triggered by the counter alone; the date is read at that moment.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openRequest]);

    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
    const day = (iso: string) => date.format(new Date(`${iso}T00:00:00Z`));
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    const describe = (b: CourseBlock) => [
        b.startsOn === b.endsOn ? day(b.startsOn) : `${day(b.startsOn)} – ${day(b.endsOn)}`,
        b.weekdays ? WEEK.filter(d => b.weekdays!.includes(d)).map(d => weekday.format(new Date(Date.UTC(2023, 0, 1 + d)))).join(', ') : null,
        b.fromTime && b.toTime ? `${b.fromTime}–${b.toTime}` : t('blockAllDay'),
    ].filter(Boolean).join(' · ');

    return (
        <section aria-labelledby="sheet-blocks" className="border-t border-g-ink pt-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 id="sheet-blocks" className="font-golf text-2xl font-bold tracking-tight">{t('blocksTitle')}</h2>
                    <p className="mt-1 max-w-xl text-sm text-g-muted">{t('blocksHint')}</p>
                </div>
                {!open && hasTimeZone && (
                    <button type="button" onClick={() => { setFormDate(startDate); setOpen(true); }} className={primaryButton}>{t('addBlock')}</button>
                )}
            </div>

            {open && (
                <div className="mt-6">
                    <BlockForm key={formDate} initialDate={formDate} review={review} onCancel={() => setOpen(false)} />
                </div>
            )}

            {blocks.length === 0 && !open ? (
                <p className="mt-4 text-sm text-g-muted">{t('blocksEmpty')}</p>
            ) : (
                <ul className="mt-4 divide-y divide-g-rule">
                    {blocks.map(b => (
                        <li key={b.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                            <div className="min-w-0">
                                <p className="font-medium tabular-nums text-g-ink">{describe(b)}</p>
                                {b.note && <p className="mt-0.5 text-sm text-g-muted">{b.note}</p>}
                                <p className="mt-0.5 text-xs tabular-nums text-g-muted">{t('blockClosing', { count: b.closedTeeTimes })}</p>
                            </div>
                            <button type="button" onClick={() => void review({ action: 'block_remove', blockId: b.id }, { surface: true })}
                                className={secondaryButton}>
                                {t('blockRemove')}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
