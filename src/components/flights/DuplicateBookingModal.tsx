"use client";

import React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { CircleAlert } from 'lucide-react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogTitle,
} from '@/components/ui/AlertDialog';
import { getAirportByCode } from '@/lib/airports';
import { getAirportInfo } from '@/utils/airport-info';

export interface DuplicateBookingData {
    existingBookingId: string;
    route: string;
    departureDate: string;
}

/**
 * `CRK → PUS` as `Clark(CRK) → Busan(PUS)`.
 *
 * The guard answers in IATA codes, but the traveller has to recognise a booking they
 * made days ago — a code alone is not enough to place it. Falls back to the bare code
 * for airports neither table knows.
 */
function labelRoute(route: string): string {
    return route
        .split('→')
        .map((part) => {
            const code = part.trim().toUpperCase();
            if (!/^[A-Z]{3}$/.test(code)) return part.trim();
            const city = getAirportByCode(code)?.city ?? getAirportInfo(code).city;
            return city && city !== code ? `${city}(${code})` : code;
        })
        .join(' → ');
}

/**
 * The duplicate-booking guard's verdict, as a modal rather than a panel beside the form.
 *
 * Retrying the same offer would only trip the same guard, so the two ways forward —
 * cancel the clashing booking, or abandon this one — are the only useful actions on
 * screen, and the modal keeps them from being scrolled past.
 */
export default function DuplicateBookingModal({
    data,
    onDismiss,
}: {
    data: DuplicateBookingData | null;
    onDismiss: () => void;
}) {
    const t = useTranslations('flightBook');
    const router = useRouter();

    // `data` clears the moment the modal starts closing, but the exit animation still
    // renders one last frame — hold the last booking so the copy doesn't blank out.
    const [shown, setShown] = React.useState<DuplicateBookingData | null>(data);
    React.useEffect(() => {
        if (data) setShown(data);
    }, [data]);

    return (
        <AlertDialog open={!!data} onOpenChange={(open) => { if (!open) onDismiss(); }}>
            <AlertDialogContent className="max-w-xl p-6 sm:p-8">
                <div className="flex items-start gap-3">
                    <CircleAlert className="w-5 h-5 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                    <div className="flex-1 min-w-0">
                        <AlertDialogTitle className="text-base sm:text-[17px] font-medium text-red-600 dark:text-red-400">
                            {t('duplicate.title')}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="mt-3 text-sm sm:text-[15px] font-normal leading-relaxed text-justify text-blue-600 dark:text-blue-400">
                            {shown && t('duplicate.description', {
                                route: labelRoute(shown.route),
                                date: shown.departureDate,
                            })}
                        </AlertDialogDescription>
                        <AlertDialogFooter className="mt-5 flex flex-col sm:flex-row sm:justify-stretch gap-3">
                            <AlertDialogAction
                                className="flex-1 h-10 px-4 rounded-md text-sm font-medium bg-red-600 hover:bg-red-700 shadow-none"
                                onClick={() => {
                                    if (shown) router.push(`/trips?highlight=${shown.existingBookingId}`);
                                }}
                            >
                                {t('duplicate.viewExisting')}
                            </AlertDialogAction>
                            <AlertDialogAction
                                className="flex-1 h-10 px-4 rounded-md text-sm font-medium shadow-none"
                                onClick={() => router.push('/')}
                            >
                                {t('duplicate.keepExisting')}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </div>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}
