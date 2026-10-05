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
            className={secondary
                ? 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5'
                : 'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-md transition hover:bg-blue-700'}>
            <MessageCircle className="h-5 w-5" aria-hidden /> {t('askTeeTimes')}
        </button>
    );
}
