"use client";

import React from 'react';

interface CheckboxItemProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

export const CheckboxItem = ({ label, checked, onChange }: CheckboxItemProps) => (
    <label className="w-full flex items-center gap-2 cursor-pointer group mb-0.5 last:mb-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-1.5 px-1.5 py-1 min-h-[32px] rounded transition-colors">
        <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-[11px] text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors flex-1">
            {label}
        </span>
    </label>
);
