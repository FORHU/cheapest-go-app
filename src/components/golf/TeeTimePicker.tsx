'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { TeeTime } from '@/lib/schemas/golf';
import { addDays } from '@/lib/golf/time';
import { formatMoney } from './format';

const fieldClass = 'mt-1 w-full rounded-none border-0 border-b border-g-rule bg-transparent px-0 py-1.5 text-base tabular-nums text-g-ink transition-colors focus:border-g-accent focus:outline-none focus-visible:outline-none';

/**
 * Picks a tee time on the course page. Times are on the course's clock, the one the customer
 * will play by; `today` is the course-local date, worked out on the server. Tomorrow is the
 * first date offered because the team needs a day to confirm with the course.
 */
export function TeeTimePicker({ slug, today, windowDays }: { slug: string; today: string; windowDays: number }) {
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
        fetch(`/api/golf/courses/${encodeURIComponent(slug)}/tee-times?date=${date}&players=${players}`)
            .then(response => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
            .then(json => { if (!cancelled) setTeeTimes(json.data.teeTimes); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [slug, date, players]);

    // A different day is a different list; a different party size keeps the chosen time.
    useEffect(() => { setSelected(null); }, [date]);

    const chosen = teeTimes?.find(tt => tt.id === selected && tt.spotsLeft >= players);

    return (
        <div className="flex flex-col gap-4">
            <h2 className="font-golf text-2xl font-medium tracking-tight text-g-ink">{t('panelTitle')}</h2>
            <div className="grid grid-cols-[1fr_4.5rem] gap-5">
                <label className="text-xs font-medium text-g-muted">
                    {t('date')}
                    <input id="golf-date" type="date" value={date} min={first} max={addDays(today, windowDays)}
                        onChange={e => { if (e.target.value) setDate(e.target.value); }} className={fieldClass} />
                </label>
                <label className="text-xs font-medium text-g-muted">
                    {t('players')}
                    <select id="golf-players" value={players} onChange={e => setPlayers(Number(e.target.value))} className={fieldClass}>
                        {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </label>
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
            {failed && <p role="alert" className="text-sm text-[#8c2f1f] dark:text-[#d4806f]">{t('loadError')}</p>}
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
                                        {t('spotsLeft', { count: tt.spotsLeft })} · {formatMoney(tt.allInPerPlayer ?? tt.pricePerPlayer, tt.currency, locale)}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {chosen ? (
                <Link href={`/golf/${slug}/book?teeTime=${chosen.id}&players=${players}`}
                    className="rounded-sm bg-g-accent px-6 py-3 text-center font-semibold text-g-accent-ink transition duration-200 hover:bg-g-accent-hover motion-safe:active:scale-[0.98]">
                    {t('continue')}
                </Link>
            ) : (
                <p className="text-xs leading-relaxed text-g-muted">{t('hint')}</p>
            )}
        </div>
    );
}
