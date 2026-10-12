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

    const base = 'rounded-sm px-5 py-2.5 text-sm font-semibold transition duration-200 motion-safe:active:scale-[0.98] disabled:opacity-60';

    return (
        <div className="golf-theme flex flex-col gap-2">
            {confirming ? (
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={cancel} disabled={busy}
                        className={`${base} flex items-center gap-2 bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400`}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {t('cancelConfirm')}
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} disabled={busy}
                        className={`${base} border border-g-rule text-g-ink hover:border-g-accent`}>
                        {t('keep')}
                    </button>
                </div>
            ) : (
                <button type="button" onClick={() => setConfirming(true)}
                    className={`${base} self-start border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-950/30`}>
                    {t('cancel')}
                </button>
            )}
            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
    );
}
