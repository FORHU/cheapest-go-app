'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { GOLF_EXTRAS, type ExtraOffer, type GolfExtraCode } from '@/lib/golf/extras';
import { inputClass, primaryButton } from './shared';

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
        <section aria-labelledby="sheet-extras" className="border-t border-g-ink pt-4">
            <h2 id="sheet-extras" className="font-golf text-2xl font-bold tracking-tight">{t('extrasTitle')}</h2>
            <p className="mt-1 text-sm text-g-muted">{t('extrasHint')}</p>

            <ul className="mt-4 divide-y divide-g-rule">
                {GOLF_EXTRAS.map(code => {
                    const on = code in offered;
                    return (
                        <li key={code} className="grid grid-cols-[1fr_auto] items-center gap-4 py-3 sm:grid-cols-[1fr_12rem]">
                            <label className="flex items-center gap-3 text-g-ink">
                                <input type="checkbox" checked={on} onChange={e => toggle(code, e.target.checked)}
                                    aria-label={`${t('extrasOffered')}: ${tAmenity(code)}`} className="h-4 w-4 accent-[var(--g-accent)]" />
                                {tAmenity(code)}
                            </label>
                            <label className="block text-xs text-g-muted">
                                <span className="sr-only">{[tAmenity(code), t('extrasPrice', { currency })].join(': ')}</span>
                                <input type="number" inputMode="decimal" min={0} step="0.01" disabled={!on} value={on ? offered[code] : ''}
                                    placeholder={t('extrasPrice', { currency })}
                                    onChange={e => setOffered(current => ({ ...current, [code]: e.target.value }))}
                                    className={`${inputClass} mt-0 text-right disabled:opacity-40`} />
                            </label>
                        </li>
                    );
                })}
            </ul>

            <div className="mt-4 flex items-center gap-4">
                <button type="button" onClick={save} disabled={busy} className={`${primaryButton} flex items-center gap-2`}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {t('extrasSave')}
                </button>
                {message && (
                    <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-g-muted' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>
                )}
            </div>
        </section>
    );
}
