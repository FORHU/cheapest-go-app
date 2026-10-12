'use client';

import { useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import type { Impact } from '@/lib/schemas/golfTeeSheet';
import { primaryButton, secondaryButton } from './shared';

/**
 * What a change will do, shown before it is applied. The numbers come from the server running
 * the same change in a transaction it then rolls back, so they are what Apply will do.
 *
 * The admin's Dialog, as its other confirmations use. It is only mounted while a change is
 * waiting, and it cannot be dismissed while the change is being applied.
 */
export function ImpactConfirm({ impact, busy, error, onApply, onCancel }: {
    impact: Impact;
    busy: boolean;
    error: string | null;
    onApply: () => void;
    onCancel: () => void;
}) {
    const t = useTranslations('golf.staff.sheet');
    // The dialog mounts its content a tick after this component, so focus when the button
    // appears rather than in an effect that would run too early.
    const focusApply = useCallback((node: HTMLButtonElement | null) => { node?.focus(); }, []);

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
        <Dialog open onOpenChange={open => { if (!open && !busy) onCancel(); }}>
            <DialogContent role="dialog" aria-modal="true" aria-labelledby="impact-title" className="p-6 sm:max-w-md">
                <DialogHeader>
                    <DialogTitle id="impact-title">{t('confirmTitle')}</DialogTitle>
                </DialogHeader>

                <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm tabular-nums dark:divide-white/5 dark:border-white/10">
                    {shown.length === 0
                        ? <li className="px-3 py-2 text-slate-500 dark:text-slate-400">{t('impactNothing')}</li>
                        : shown.map(([text]) => <li key={text} className="px-3 py-2 text-slate-900 dark:text-slate-100">{text}</li>)}
                </ul>

                {impact.affectedBookings.length > 0 && (
                    <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        {t('impactBookings', { references: impact.affectedBookings.join(', ') })}
                    </p>
                )}

                {error && <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

                <div className="mt-6 flex justify-end gap-2">
                    <button type="button" onClick={onCancel} disabled={busy} className={secondaryButton}>{t('cancel')}</button>
                    <button ref={focusApply} type="button" onClick={onApply} disabled={busy}
                        className={`${primaryButton} flex items-center gap-2`}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {busy ? t('applying') : t('apply')}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
