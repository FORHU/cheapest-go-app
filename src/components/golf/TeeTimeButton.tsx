'use client';

import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSupportWidgetStore } from '@/stores/supportWidgetStore';

/**
 * Opens the support chat to ask about tee times (CONTEXT.md, "Golf Course"). The widget is
 * mounted by the storefront layout; this only opens it. `secondary` when it sits under the
 * tee-time picker rather than standing in for it.
 */
export function TeeTimeButton({ secondary = false }: { secondary?: boolean }) {
    const t = useTranslations('golf');
    const open = useSupportWidgetStore(s => s.open);
    return (
        <button type="button" onClick={open}
            className={`golf-theme inline-flex items-center justify-center gap-2 rounded-sm px-5 py-2.5 text-sm font-semibold transition duration-200 motion-safe:active:scale-[0.98] ${secondary
                ? 'border border-g-rule text-g-ink hover:border-g-accent hover:text-g-accent'
                : 'bg-g-accent text-g-accent-ink hover:bg-g-accent-hover'}`}>
            <MessageCircle className="h-4 w-4" aria-hidden /> {t('askTeeTimes')}
        </button>
    );
}
