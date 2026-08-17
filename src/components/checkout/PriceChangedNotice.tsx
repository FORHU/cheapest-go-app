"use client";

import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSearchStore } from '@/stores/searchStore';
import { getCurrencySymbol } from '@/lib/currency';
import { useCheckoutStore } from '@/stores/checkoutStore';

interface PriceChangedNoticeProps {
    oldPrice: number;
    newPrice: number;
}

export function PriceChangedNotice({ oldPrice, newPrice }: PriceChangedNoticeProps) {
    const router = useRouter();
    const t = useTranslations('checkout.priceChanged');
    const currency = useCheckoutStore((s) => s.selectedCurrency);
    const symbol = getCurrencySymbol(currency);
    const setIsSearching = useSearchStore((s) => s.setIsSearching);

    function handleBackToSearch() {
        setIsSearching(true);
        router.back();
    }

    return (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 md:p-6 space-y-4">
            <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                    <h3 className="font-semibold text-amber-900 dark:text-amber-200 text-sm md:text-base">
                        {t('title')}
                    </h3>
                    <p className="text-amber-800 dark:text-amber-300 text-xs md:text-sm mt-1">
                        {t('description')}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-4 text-sm pl-8">
                <div>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mb-0.5">{t('originalPrice')}</p>
                    <p className="font-medium text-amber-900 dark:text-amber-200 line-through">
                        {symbol}{oldPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                </div>
                <div className="text-amber-400">→</div>
                <div>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mb-0.5">{t('newPrice')}</p>
                    <p className="font-bold text-amber-900 dark:text-amber-200">
                        {symbol}{newPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                </div>
            </div>

            <p className="text-xs text-amber-700 dark:text-amber-400 pl-8">
                {t('refundNotice', { amount: `${symbol}${oldPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` })}
            </p>

            <div className="pl-8">
                <button
                    onClick={handleBackToSearch}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                    {t('backToSearch')}
                </button>
            </div>
        </div>
    );
}
