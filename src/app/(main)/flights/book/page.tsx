import type { Metadata } from 'next';
import { Suspense } from 'react';
import FlightBookContent from './FlightBookContent';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('flights.book');
    return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function FlightBookPage() {
    const t = await getTranslations('flights.book');
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-500 dark:text-slate-400">{t('loading')}</p>
                </div>
            </div>
        }>
            <FlightBookContent />
        </Suspense>
    );
}
