'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Two steps, so a stray tap never cancels a tee time. */
export function CancelGolfBookingButton({ reference }: { reference: string }) {
    const t = useTranslations('golf.booking');
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cancel = async () => {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch(`/api/golf/bookings/${encodeURIComponent(reference)}/cancel`, {
                method: 'POST',
                headers: { 'X-Requested-By': 'cheapestgo-client' },
            });
            if (response.ok) router.refresh();
            else setError(t('cancelFailed'));
        } catch {
            setError(t('cancelFailed'));
        } finally {
            setBusy(false);
            setConfirming(false);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            {confirming ? (
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={cancel} disabled={busy}
                        className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {t('cancelConfirm')}
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} disabled={busy}
                        className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5">
                        {t('keep')}
                    </button>
                </div>
            ) : (
                <button type="button" onClick={() => setConfirming(true)}
                    className="self-start rounded-xl border border-red-300 px-5 py-2.5 font-semibold text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-950/30">
                    {t('cancel')}
                </button>
            )}
            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
    );
}
