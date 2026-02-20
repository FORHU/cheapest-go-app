'use client';

import React from 'react';
import { Mail } from 'lucide-react';

interface EmailFieldProps {
    value: string;
    onChange: (value: string) => void;
    error?: string;
    onErrorClear: () => void;
    disabled?: boolean;
}

export function EmailField({ value, onChange, error, onErrorClear, disabled }: EmailFieldProps) {
    return (
        <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email
            </label>
            <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                    type="email"
                    value={value}
                    onChange={(e) => { onChange(e.target.value); onErrorClear(); }}
                    placeholder="Enter your email"
                    className={`w-full pl-10 pr-4 py-3 border rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${error ? 'border-red-500' : 'border-slate-200 dark:border-white/10'}`}
                    disabled={disabled}
                />
            </div>
            {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>
    );
}
