import { Suspense } from 'react';
import FlightSearchContent from './FlightSearchContent';

export const dynamic = 'force-dynamic';

export default function FlightSearchPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-500 dark:text-slate-400">Searching flights...</p>
                </div>
            </div>
        }>
            <FlightSearchContent />
        </Suspense>
    );
}
