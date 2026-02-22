'use client';

import React from 'react';

interface SpecialRequestsSectionProps {
    value: string;
    onChange: (value: string) => void;
}

export function SpecialRequestsSection({ value, onChange }: SpecialRequestsSectionProps) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-lg lg:rounded-xl border border-slate-200 dark:border-white/10 p-2.5 lg:p-6 shadow-sm">
            <h2 className="text-[14px] lg:text-xl font-bold text-slate-900 dark:text-white mb-1.5 lg:mb-4">Any special requests?</h2>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full min-w-0 px-2 py-1 lg:p-3 text-[11px] lg:text-sm rounded lg:rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 h-14 lg:h-24 resize-none placeholder:text-[11px] lg:placeholder:text-sm"
                placeholder="The property will do its best to arrange it."
            />
        </div>
    );
}
