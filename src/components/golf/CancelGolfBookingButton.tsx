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
                        className={`${base} flex items-center gap-2 bg-[#8c2f1f] text-white hover:bg-[#742518] dark:bg-[#d4806f] dark:text-[#1c0f0b] dark:hover:bg-[#e29a8b]`}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {t('cancelConfirm')}
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} disabled={busy}
                        className={`${base} border border-g-rule text-g-ink hover:border-g-accent`}>
                        {t('keep')}
                    </button>
                </div>
            ) : (
                <button type="button" onClick={() => setConfirming(true)}
                    className={`${base} self-start border border-[#8c2f1f]/40 text-[#8c2f1f] hover:bg-[#8c2f1f]/5 dark:border-[#d4806f]/50 dark:text-[#d4806f]`}>
                    {t('cancel')}
                </button>
            )}
            {error && <p role="alert" className="text-sm text-[#8c2f1f] dark:text-[#d4806f]">{error}</p>}
        </div>
    );
}
