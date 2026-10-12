'use client';

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Impact } from '@/lib/schemas/golfTeeSheet';

/**
 * What a change will do, shown before it is applied. The numbers come from the server running
 * the same change in a transaction it then rolls back, so they are what Apply will do.
 */
export function ImpactConfirm({ impact, busy, error, onApply, onCancel }: {
    impact: Impact;
    busy: boolean;
    error: string | null;
    onApply: () => void;
    onCancel: () => void;
}) {
    const t = useTranslations('golf.staff.sheet');
    const apply = useRef<HTMLButtonElement>(null);
    useEffect(() => { apply.current?.focus(); }, []);

    const lines: [string, number][] = [
        [t('impactCreated', { count: impact.created }), impact.created],
        [t('impactUpdated', { count: impact.updated }), impact.updated],
        [t('impactClosed', { count: impact.closed }), impact.closed],
        [t('impactDeleted', { count: impact.deleted }), impact.deleted],
        [t('impactReopened', { count: impact.reopened }), impact.reopened],
        [t('impactLeftAlone', { count: impact.leftAlone }), impact.leftAlone],
    ];
    const shown = lines.filter(([, n]) => n > 0);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="impact-title"
                className="golf-theme w-full max-w-md border-t-4 border-g-accent bg-g-surface p-6 text-g-ink shadow-2xl">
                <h2 id="impact-title" className="font-golf text-2xl font-bold tracking-tight">{t('confirmTitle')}</h2>

                <ul className="mt-4 divide-y divide-g-rule text-sm tabular-nums">
                    {shown.length === 0
                        ? <li className="py-2 text-g-muted">{t('impactNothing')}</li>
                        : shown.map(([text]) => <li key={text} className="py-2">{text}</li>)}
                </ul>

                {impact.affectedBookings.length > 0 && (
                    <p className="mt-4 border-l-2 border-g-accent bg-g-sunk px-3 py-2 text-sm leading-relaxed text-g-ink">
                        {t('impactBookings', { references: impact.affectedBookings.join(', ') })}
                    </p>
                )}

                {error && <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={onCancel} disabled={busy}
                        className="rounded-sm border border-g-rule px-5 py-2 text-sm font-semibold transition hover:border-g-ink disabled:opacity-60">
                        {t('cancel')}
                    </button>
                    <button ref={apply} type="button" onClick={onApply} disabled={busy}
                        className="flex items-center gap-2 rounded-sm bg-g-accent px-5 py-2 text-sm font-semibold text-g-accent-ink transition hover:bg-g-accent-hover disabled:opacity-60">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {busy ? t('applying') : t('apply')}
                    </button>
                </div>
            </div>
        </div>
    );
}
