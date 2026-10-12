'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** The one press that accepts an invitation. Nothing else on the page changes anything. */
export function AcceptInvitation({ token, courseName }: { token: string; courseName: string }) {
    const t = useTranslations('golf.staff');
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const accept = async () => {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch('/api/course/invitations/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({ token }),
            });
            if (response.ok) {
                router.push('/course');
                router.refresh();
                return;
            }
            const json = await response.json().catch(() => ({}));
            setError(json.error ?? t('portal.actionError'));
        } catch {
            setError(t('portal.actionError'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <div>
                <button type="button" onClick={accept} disabled={busy}
                    className="flex items-center gap-2 rounded-sm bg-g-accent px-6 py-3 text-base font-semibold text-g-accent-ink transition duration-200 hover:bg-g-accent-hover disabled:opacity-60 motion-safe:active:scale-[0.98]">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {t('join.accept', { course: courseName })}
                </button>
            </div>
            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
    );
}
