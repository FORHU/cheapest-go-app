'use client';

import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Check, X } from 'lucide-react';
import { PasswordRequirement } from './types';

interface PasswordFieldProps {
    value: string;
    onChange: (value: string) => void;
    error?: string;
    onErrorClear: () => void;
    disabled?: boolean;
    placeholder?: string;
    showRequirements?: boolean;
}

function getPasswordRequirements(password: string): PasswordRequirement[] {
    return [
        { label: '8+ characters', met: password.length >= 8 },
        { label: 'Uppercase', met: /[A-Z]/.test(password) },
        { label: 'Lowercase', met: /[a-z]/.test(password) },
        { label: 'Number', met: /\d/.test(password) },
    ];
}

export function PasswordField({
    value,
    onChange,
    error,
    onErrorClear,
    disabled,
    placeholder = 'Enter your password',
    showRequirements = false,
}: PasswordFieldProps) {
    const [showPassword, setShowPassword] = useState(false);
    const requirements = showRequirements ? getPasswordRequirements(value) : [];

    return (
        <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Password
            </label>
            <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                    type={showPassword ? 'text' : 'password'}
                    value={value}
                    onChange={(e) => { onChange(e.target.value); onErrorClear(); }}
                    placeholder={placeholder}
                    className={`w-full pl-10 pr-12 py-3 border rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${error ? 'border-red-500' : 'border-slate-200 dark:border-white/10'}`}
                    disabled={disabled}
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                    {showPassword ? <EyeOff className="h-5 w-5 text-slate-400" /> : <Eye className="h-5 w-5 text-slate-400" />}
                </button>
            </div>
            {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

            {/* Password Requirements */}
            {showRequirements && value && (
                <div className="mt-2 flex flex-wrap gap-2">
                    {requirements.map((req, i) => (
                        <span key={i} className={`inline-flex items-center gap-1 text-xs ${req.met ? 'text-green-600' : 'text-slate-400'}`}>
                            {req.met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            {req.label}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

export { getPasswordRequirements };
