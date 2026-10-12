'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { GolfPlayersField } from '@/components/golf/GolfPlayersField';
import { GolfSelect } from '@/components/golf/GolfSelect';
import { formatMoney } from '@/components/golf/format';
import type { TeeTimeSchedule } from '@/lib/schemas/golf';
import { inputClass, labelClass, primaryButton, secondaryButton, timeOptions, withValue, type Review } from './shared';

const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** Weekday names in the viewer's language, 0 = Sunday. 1 January 2023 was a Sunday. */
function useWeekdays() {
    const locale = useLocale();
    const format = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    return (day: number) => format.format(new Date(Date.UTC(2023, 0, 1 + day)));
}

function ScheduleForm({ initial, currency, review, onCancel }: {
    initial: TeeTimeSchedule | null;
    currency: string;
    review: Review;
    onCancel: () => void;
}) {
    const t = useTranslations('golf.staff.sheet');
    const weekday = useWeekdays();
    const [name, setName] = useState(initial?.name ?? '');
    const [days, setDays] = useState<number[]>(initial?.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 0]);
    const [firstTee, setFirstTee] = useState(initial?.firstTee ?? '07:00');
    const [lastTee, setLastTee] = useState(initial?.lastTee ?? '14:00');
    const [interval, setIntervalMinutes] = useState(String(initial?.intervalMinutes ?? 10));
    const [spots, setSpots] = useState(initial?.spots ?? 4);
    const [price, setPrice] = useState(initial ? String(initial.pricePerPlayer) : '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});

    const options = timeOptions(5);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        setFieldErrors({});
        const result = await review({
            action: initial ? 'schedule_update' : 'schedule_create',
            ...(initial ? { scheduleId: initial.id } : {}),
            schedule: {
                name, daysOfWeek: days, firstTee, lastTee, intervalMinutes: Number(interval), spots,
                pricePerPlayer: price === '' ? NaN : Number(price),
            },
        });
        setBusy(false);
        if (result.error) setError(result.error);
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
    };
    const err = (field: string) =>
        fieldErrors[field]?.[0] ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors[field]![0]}</p> : null;

    return (
        <form onSubmit={submit} className="grid gap-6 border-t border-g-ink pt-6 sm:grid-cols-2">
            <label className={`${labelClass} sm:col-span-2`}>
                {t('scheduleName')}
                <input className={inputClass} value={name} onChange={e => setName(e.target.value)} required maxLength={80} />
                {err('name')}
            </label>

            <fieldset className="sm:col-span-2">
                <legend className={labelClass}>{t('scheduleDays')}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                    {WEEK.map(d => {
                        const on = days.includes(d);
                        return (
                            <button key={d} type="button" aria-pressed={on}
                                onClick={() => setDays(current => on ? current.filter(x => x !== d) : [...current, d])}
                                className={`rounded-sm border px-3 py-1.5 text-sm transition-colors ${on
                                    ? 'border-g-accent bg-g-accent text-g-accent-ink'
                                    : 'border-g-rule text-g-ink hover:border-g-ink'}`}>
                                {weekday(d)}
                            </button>
                        );
                    })}
                </div>
                {err('daysOfWeek')}
            </fieldset>

            <div>
                <GolfSelect label={t('scheduleFirst')} value={firstTee} onChange={setFirstTee} options={withValue(options, firstTee)} mono />
                {err('firstTee')}
            </div>
            <div>
                <GolfSelect label={t('scheduleLast')} value={lastTee} onChange={setLastTee} options={withValue(options, lastTee)} mono />
                {err('lastTee')}
            </div>

            <label className={labelClass}>
                {t('scheduleInterval')}
                <input type="number" inputMode="numeric" min={5} max={60} className={inputClass} value={interval}
                    onChange={e => setIntervalMinutes(e.target.value)} required />
                {err('intervalMinutes')}
            </label>
            <label className={labelClass}>
                {t('schedulePrice', { currency })}
                <input type="number" inputMode="decimal" min={0} step="0.01" className={inputClass} value={price}
                    onChange={e => setPrice(e.target.value)} required />
                {err('pricePerPlayer')}
            </label>

            <GolfPlayersField label={t('scheduleSpots')} value={spots} onChange={setSpots} />

            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400 sm:col-span-2">{error}</p>}

            <div className="flex gap-3 sm:col-span-2">
                <button type="submit" disabled={busy} className={primaryButton}>{t('review')}</button>
                <button type="button" onClick={onCancel} className={secondaryButton}>{t('cancel')}</button>
            </div>
        </form>
    );
}

export function ScheduleSection({ schedules, currency, hasTimeZone, review }: {
    schedules: TeeTimeSchedule[];
    currency: string;
    hasTimeZone: boolean;
    review: Review;
}) {
    const t = useTranslations('golf.staff.sheet');
    const locale = useLocale();
    const weekday = useWeekdays();
    const [editing, setEditing] = useState<'new' | string | null>(null);

    const summary = (s: TeeTimeSchedule) =>
        t('scheduleSummary', {
            days: WEEK.filter(d => s.daysOfWeek.includes(d)).map(weekday).join(', '),
            first: s.firstTee, last: s.lastTee, interval: s.intervalMinutes, spots: s.spots,
            price: formatMoney(s.pricePerPlayer, currency, locale),
        });

    return (
        <section aria-labelledby="sheet-schedules" className="border-t border-g-ink pt-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 id="sheet-schedules" className="font-golf text-2xl font-bold tracking-tight">{t('schedulesTitle')}</h2>
                    <p className="mt-1 text-sm text-g-muted">{t('schedulesHint')}</p>
                </div>
                {editing === null && hasTimeZone && (
                    <button type="button" onClick={() => setEditing('new')} className={primaryButton}>{t('addSchedule')}</button>
                )}
            </div>

            {!hasTimeZone && <p className="mt-4 border-l-2 border-g-accent bg-g-sunk px-3 py-2 text-sm">{t('noTimeZone')}</p>}

            {editing === 'new' && (
                <div className="mt-6"><ScheduleForm initial={null} currency={currency} review={review} onCancel={() => setEditing(null)} /></div>
            )}

            {schedules.length === 0 && editing !== 'new' ? (
                <p className="mt-4 text-sm text-g-muted">{t('schedulesEmpty')}</p>
            ) : (
                <ul className="mt-4 divide-y divide-g-rule">
                    {schedules.map(s => (
                        <li key={s.id} className="py-4">
                            {editing === s.id ? (
                                <ScheduleForm initial={s} currency={currency} review={review} onCancel={() => setEditing(null)} />
                            ) : (
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-medium text-g-ink">{s.name}</p>
                                        <p className="mt-0.5 text-sm tabular-nums text-g-muted">{summary(s)}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setEditing(s.id)} className={secondaryButton}>{t('edit')}</button>
                                        <button type="button" onClick={() => void review({ action: 'schedule_delete', scheduleId: s.id }, { surface: true })}
                                            className="rounded-sm px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30">
                                            {t('delete')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
