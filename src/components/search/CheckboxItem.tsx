"use client";

import React from 'react';

interface CheckboxItemProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

export const CheckboxItem = ({ label, checked, onChange }: CheckboxItemProps) => (
    <label className="flex items-center gap-3 cursor-pointer group mb-1 last:mb-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-2 px-2 py-2.5 min-h-[44px] rounded transition-colors">
        <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors flex-1">
            {label}
        </span>
    </label>
);
