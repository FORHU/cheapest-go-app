import type { Metadata } from 'next';
import { Suspense } from 'react';
import FlightBookContent from './FlightBookContent';

export const metadata: Metadata = {
  title: 'Book Flight | CheapestGo',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function FlightBookPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-500 dark:text-slate-400">Loading booking...</p>
                </div>
            </div>
        }>
            <FlightBookContent />
        </Suspense>
    );
}
