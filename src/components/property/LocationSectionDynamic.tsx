'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import { useTranslations } from 'next-intl';

function LocationSectionSkeleton() {
    const t = useTranslations('property');
    return (
        <div className="py-4 lg:py-8 border-t border-slate-200 dark:border-white/10 scroll-mt-36" id="location">
            <h2 className="text-[14px] lg:text-xl font-bold text-slate-900 dark:text-white mb-4 lg:mb-6">{t('locationTitle')}</h2>
            <div className="w-full h-[440px] lg:h-[520px] rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
        </div>
    );
}

const LocationSectionContent = dynamic(
    () => import('./LocationSection'),
    {
        ssr: false,
        loading: LocationSectionSkeleton,
    }
);

interface LocationSectionProps {
    hotelDetails?: {
        name?: string;
        address?: string;
        city?: string;
        country?: string;
        image?: string;
    };
    coordinates?: { lat: number; lng: number };
}

export default function LocationSection(props: LocationSectionProps) {
    return <LocationSectionContent {...props} />;
}
