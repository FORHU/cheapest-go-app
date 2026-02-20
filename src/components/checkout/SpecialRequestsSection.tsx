'use client';

import React from 'react';

interface SpecialRequestsSectionProps {
    value: string;
    onChange: (value: string) => void;
}

export function SpecialRequestsSection({ value, onChange }: SpecialRequestsSectionProps) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-lg sm:rounded-xl border border-slate-200 dark:border-white/10 p-3 sm:p-6 shadow-sm">
            <h2 className="text-base sm:text-xl font-bold text-slate-900 dark:text-white mb-2 sm:mb-4">Any special requests?</h2>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full min-w-0 px-2 py-1.5 sm:p-3 text-xs sm:text-sm rounded sm:rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 h-16 sm:h-24 resize-none"
                placeholder="The property will do its best to arrange it."
            />
        </div>
    );
}
