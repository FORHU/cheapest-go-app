'use client';

import React from 'react';

interface SpecialRequestsSectionProps {
    value: string;
    onChange: (value: string) => void;
}

export function SpecialRequestsSection({ value, onChange }: SpecialRequestsSectionProps) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Any special requests?</h2>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 h-24"
                placeholder="The property will do its best to arrange it."
            />
        </div>
    );
}
