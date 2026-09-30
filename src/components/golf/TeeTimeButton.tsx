'use client';

import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSupportWidgetStore } from '@/stores/supportWidgetStore';

/**
 * The booking channel for golf in v1 (CONTEXT.md, "Golf Course"): the support chat. The
 * widget is mounted by the storefront layout; this only opens it.
 */
export function TeeTimeButton() {
    const t = useTranslations('golf');
    const open = useSupportWidgetStore(s => s.open);
    return (
        <button type="button" onClick={open}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-md transition hover:bg-blue-700">
            <MessageCircle className="h-5 w-5" aria-hidden /> {t('askTeeTimes')}
        </button>
    );
}
