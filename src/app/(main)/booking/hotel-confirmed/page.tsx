import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { HotelConfirmedContent } from '@/components/booking/hotel-confirmed/HotelConfirmedContent';
import { getTranslations } from 'next-intl/server';

export default async function HotelConfirmedPage() {
    const t = await getTranslations('trips.hotelConfirmed');
    return (
        <Suspense fallback={
            <div className="min-h-screen flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-sm text-slate-500">{t('loading')}</p>
            </div>
        }>
            <HotelConfirmedContent />
        </Suspense>
    );
}
