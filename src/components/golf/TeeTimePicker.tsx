'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { TeeTime } from '@/lib/schemas/golf';
import { addDays } from '@/lib/golf/time';
import { formatMoney } from './format';
import { GolfDatePicker } from './GolfDatePicker';
import { GolfPlayersField } from './GolfPlayersField';

/**
 * Picks a tee time on the course page. Times are on the course's clock, the one the customer
 * will play by; `today` is the course-local date, worked out on the server. Tomorrow is the
 * first date offered because the team needs a day to confirm with the course.
 *
 * `currency` is the viewer's Charge Currency (ADR-0051), resolved by the page. It is sent to the
 * prices request and on to checkout, so both quote in the same currency.
 */
export function TeeTimePicker({ slug, today, windowDays, currency }: {
    slug: string;
    today: string;
    windowDays: number;
    currency?: string;
}) {
    const t = useTranslations('golf.booking');
    const locale = useLocale();
    const first = addDays(today, 1);
    const [date, setDate] = useState(first);
    const [players, setPlayers] = useState(2);
    const [teeTimes, setTeeTimes] = useState<TeeTime[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);

    const currencyParam = currency ? `&currency=${encodeURIComponent(currency)}` : '';

    useEffect(() => {
        let cancelled = false;
        setTeeTimes(null);
        setFailed(false);
        fetch(`/api/golf/courses/${encodeURIComponent(slug)}/tee-times?date=${date}&players=${players}${currencyParam}`)
            .then(response => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
            .then(json => { if (!cancelled) setTeeTimes(json.data.teeTimes); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [slug, date, players, currencyParam]);

    // A different day is a different list; a different party size keeps the chosen time.
    useEffect(() => { setSelected(null); }, [date]);

    const chosen = teeTimes?.find(tt => tt.id === selected && tt.spotsLeft >= players);

    return (
        <div className="flex flex-col gap-4">
            <h2 className="font-golf text-2xl font-bold tracking-tight text-g-ink">{t('panelTitle')}</h2>
            <div className="grid gap-5">
                <GolfDatePicker label={t('date')} value={date} onChange={next => { if (next) setDate(next); }}
                    min={first} max={addDays(today, windowDays)} today={today} />
                <GolfPlayersField label={t('players')} value={players} onChange={setPlayers} />
            </div>

            {teeTimes === null && !failed && (
                <div>
                    <p className="flex items-center gap-2 text-sm text-g-muted">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t('loading')}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2" aria-hidden>
                        {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[3.25rem] animate-pulse rounded-sm bg-g-sunk" />)}
                    </div>
                </div>
            )}
            {failed && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t('loadError')}</p>}
            {teeTimes?.length === 0 && <p className="text-sm text-g-muted">{t('none')}</p>}

            {teeTimes && teeTimes.length > 0 && (
                <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1" aria-label={t('pickTime')}>
                    {teeTimes.map(tt => {
                        const active = selected === tt.id;
                        return (
                            <li key={tt.id}>
                                <button type="button" disabled={tt.spotsLeft < players} aria-pressed={active}
                                    onClick={() => setSelected(tt.id)}
                                    className={`w-full rounded-sm border px-3 py-2 text-left transition duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${active
                                        ? 'border-g-accent bg-g-accent text-g-accent-ink'
                                        : 'border-g-rule text-g-ink hover:border-g-accent hover:bg-g-sunk'}`}>
                                    <span className="block font-mono text-base font-medium tabular-nums">{tt.localTime}</span>
                                    <span className={`block text-xs tabular-nums ${active ? 'text-g-accent-ink/80' : 'text-g-muted'}`}>
                                        {t('spotsLeft', { count: tt.spotsLeft })} · {formatMoney(tt.allInPerPlayer ?? tt.pricePerPlayer, tt.allInPerPlayer != null ? (tt.allInCurrency ?? tt.currency) : tt.currency, locale)}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {chosen ? (
                <Link href={`/golf/${slug}/book?teeTime=${chosen.id}&players=${players}${currencyParam}`}
                    className="rounded-sm bg-g-accent px-6 py-3 text-center font-semibold text-g-accent-ink transition duration-200 hover:bg-g-accent-hover motion-safe:active:scale-[0.98]">
                    {t('continue')}
                </Link>
            ) : (
                <p className="text-xs leading-relaxed text-g-muted">{t('hint')}</p>
            )}
        </div>
    );
}
