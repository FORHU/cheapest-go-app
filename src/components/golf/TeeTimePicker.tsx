'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { TeeTime } from '@/lib/schemas/golf';
import { addDays } from '@/lib/golf/time';
import { HORIZON_DAYS } from '@/lib/golf/rules';
import { formatMoney } from './format';

const fieldClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-100';

/**
 * Picks a tee time on the course page. Times are on the course's clock, the one the customer
 * will play by; `today` is the course-local date, worked out on the server. Tomorrow is the
 * first date offered because the team needs a day to confirm with the course.
 */
export function TeeTimePicker({ slug, today }: { slug: string; today: string }) {
    const t = useTranslations('golf.booking');
    const locale = useLocale();
    const first = addDays(today, 1);
    const [date, setDate] = useState(first);
    const [players, setPlayers] = useState(2);
    const [teeTimes, setTeeTimes] = useState<TeeTime[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setTeeTimes(null);
        setFailed(false);
        setSelected(null);
        fetch(`/api/golf/courses/${encodeURIComponent(slug)}/tee-times?date=${date}`)
            .then(response => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
            .then(json => { if (!cancelled) setTeeTimes(json.data.teeTimes); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [slug, date]);

    const chosen = teeTimes?.find(tt => tt.id === selected && tt.spotsLeft >= players);

    return (
        <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('panelTitle')}</h2>
            <div className="grid grid-cols-[1fr_5rem] gap-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t('date')}
                    <input id="golf-date" type="date" value={date} min={first} max={addDays(today, HORIZON_DAYS)}
                        onChange={e => { if (e.target.value) setDate(e.target.value); }} className={fieldClass} />
                </label>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t('players')}
                    <select id="golf-players" value={players} onChange={e => setPlayers(Number(e.target.value))} className={fieldClass}>
                        {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </label>
            </div>

            {teeTimes === null && !failed && (
                <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t('loading')}
                </p>
            )}
            {failed && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t('loadError')}</p>}
            {teeTimes?.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">{t('none')}</p>}

            {teeTimes && teeTimes.length > 0 && (
                <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1" aria-label={t('pickTime')}>
                    {teeTimes.map(tt => {
                        const active = selected === tt.id;
                        return (
                            <li key={tt.id}>
                                <button type="button" disabled={tt.spotsLeft < players} aria-pressed={active}
                                    onClick={() => setSelected(tt.id)}
                                    className={`w-full rounded-lg border px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${active
                                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40'
                                        : 'border-slate-200 hover:border-blue-400 dark:border-white/10'}`}>
                                    <span className="block font-semibold tabular-nums text-slate-900 dark:text-slate-100">{tt.localTime}</span>
                                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                                        {t('spotsLeft', { count: tt.spotsLeft })} · {formatMoney(tt.pricePerPlayer, tt.currency, locale)}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {chosen ? (
                <Link href={`/golf/${slug}/book?teeTime=${chosen.id}&players=${players}`}
                    className="rounded-xl bg-blue-600 px-6 py-3 text-center font-semibold text-white shadow-md transition hover:bg-blue-700">
                    {t('continue')}
                </Link>
            ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('hint')}</p>
            )}
        </div>
    );
}
