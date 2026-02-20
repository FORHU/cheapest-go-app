'use client';

import React from 'react';
import { User } from 'lucide-react';

interface NameFieldsProps {
    firstName: string;
    lastName: string;
    onFirstNameChange: (value: string) => void;
    onLastNameChange: (value: string) => void;
    firstNameError?: string;
    lastNameError?: string;
    onFirstNameErrorClear: () => void;
    onLastNameErrorClear: () => void;
    disabled?: boolean;
}

export function NameFields({
    firstName,
    lastName,
    onFirstNameChange,
    onLastNameChange,
    firstNameError,
    lastNameError,
    onFirstNameErrorClear,
    onLastNameErrorClear,
    disabled,
}: NameFieldsProps) {
    return (
        <div className="grid grid-cols-2 gap-3">
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    First name
                </label>
                <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input
                        type="text"
                        value={firstName}
                        onChange={(e) => { onFirstNameChange(e.target.value); onFirstNameErrorClear(); }}
                        placeholder="First"
                        className={`w-full pl-10 pr-4 py-3 border rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${firstNameError ? 'border-red-500' : 'border-slate-200 dark:border-white/10'}`}
                        disabled={disabled}
                    />
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Last name
                </label>
                <input
                    type="text"
                    value={lastName}
                    onChange={(e) => { onLastNameChange(e.target.value); onLastNameErrorClear(); }}
                    placeholder="Last"
                    className={`w-full px-4 py-3 border rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${lastNameError ? 'border-red-500' : 'border-slate-200 dark:border-white/10'}`}
                    disabled={disabled}
                />
            </div>
        </div>
    );
}
