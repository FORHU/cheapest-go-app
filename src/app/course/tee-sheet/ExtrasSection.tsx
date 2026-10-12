'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { GOLF_EXTRAS, type ExtraOffer, type GolfExtraCode } from '@/lib/golf/extras';
import { cardClass, headingClass, hintClass, inputClass, primaryButton } from './shared';

/**
 * The extras a course offers and their prices. Saved as a set; they apply to the next customer
 * who starts checkout, and bookings already made keep what they were sold at.
 */
export function ExtrasSection({ extras, currency, courseId, onSaved }: {
    extras: ExtraOffer[];
    currency: string;
    courseId: string;
    onSaved: () => void;
}) {
    const t = useTranslations('golf.staff.sheet');
    const tAmenity = useTranslations('golf.amenities');
    const initial = Object.fromEntries(extras.map(e => [e.code, String(e.price)])) as Record<string, string>;
    const [offered, setOffered] = useState<Record<string, string>>(initial);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    const toggle = (code: GolfExtraCode, on: boolean) => {
        setOffered(current => {
            const { [code]: _drop, ...rest } = current;
            return on ? { ...rest, [code]: current[code] ?? '0' } : rest;
        });
    };

    const save = async () => {
        setBusy(true);
        setMessage(null);
        try {
            const response = await fetch('/api/course/tee-sheet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({
                    courseId, action: 'extras_set',
                    extras: GOLF_EXTRAS.filter(c => c in offered).map(code => ({ code, price: Number(offered[code]) })),
                }),
            });
            const json = await response.json().catch(() => ({}));
            if (response.ok) {
                setMessage({ ok: true, text: t('extrasSaved') });
                onSaved();
            } else {
                setMessage({ ok: false, text: json.error ?? t('error') });
            }
        } catch {
            setMessage({ ok: false, text: t('error') });
        } finally {
            setBusy(false);
        }
    };

    return (
        <section aria-labelledby="sheet-extras" className={cardClass}>
            <h2 id="sheet-extras" className={headingClass}>{t('extrasTitle')}</h2>
            <p className={`${hintClass} mt-0.5`}>{t('extrasHint')}</p>

            <ul className="mt-4 divide-y divide-slate-100 dark:divide-white/5">
                {GOLF_EXTRAS.map(code => {
                    const on = code in offered;
                    return (
                        <li key={code} className="grid grid-cols-[1fr_auto] items-center gap-4 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[1fr_11rem]">
                            <label className="flex items-center gap-3 text-sm text-slate-900 dark:text-slate-100">
                                <input type="checkbox" checked={on} onChange={e => toggle(code, e.target.checked)}
                                    aria-label={`${t('extrasOffered')}: ${tAmenity(code)}`} className="h-4 w-4 accent-blue-600" />
                                {tAmenity(code)}
                            </label>
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                <input type="number" inputMode="decimal" min={0} step="0.01" disabled={!on} value={on ? offered[code] : ''}
                                    aria-label={[tAmenity(code), t('extrasPrice', { currency })].join(': ')}
                                    placeholder={t('extrasPrice', { currency })}
                                    onChange={e => setOffered(current => ({ ...current, [code]: e.target.value }))}
                                    className={`${inputClass} text-right`} />
                                <span aria-hidden>{currency}</span>
                            </div>
                        </li>
                    );
                })}
            </ul>

            <div className="mt-4 flex items-center gap-4">
                <button type="button" onClick={save} disabled={busy} className={`${primaryButton} flex items-center gap-2`}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {t('extrasSave')}
                </button>
                {message && (
                    <p role={message.ok ? 'status' : 'alert'}
                        className={`text-sm ${message.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>
                )}
            </div>
        </section>
    );
}
