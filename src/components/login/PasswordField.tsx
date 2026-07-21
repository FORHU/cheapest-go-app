'use client';

import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PasswordRequirement } from './types';

interface PasswordFieldProps {
    value: string;
    onChange: (value: string) => void;
    error?: string;
    onErrorClear: () => void;
    disabled?: boolean;
    placeholder?: string;
    showRequirements?: boolean;
    label?: string;
}

/**
 * `label` is a translation key under `auth.passwordRequirements` rather than
 * display text, so callers stay locale-agnostic and the copy is resolved at
 * render time.
 */
function getPasswordRequirements(password: string): PasswordRequirement[] {
    return [
        { label: 'minLength', met: password.length >= 8 },
        { label: 'uppercase', met: /[A-Z]/.test(password) },
        { label: 'lowercase', met: /[a-z]/.test(password) },
        { label: 'number', met: /\d/.test(password) },
    ];
}

export function PasswordField({
    value,
    onChange,
    error,
    onErrorClear,
    disabled,
    placeholder,
    showRequirements = false,
    label,
}: PasswordFieldProps) {
    const t = useTranslations('auth');
    const [showPassword, setShowPassword] = useState(false);
    const requirements = showRequirements ? getPasswordRequirements(value) : [];

    // Defaults resolve here rather than in the signature — `t` isn't available
    // in default parameter position.
    const resolvedLabel = label ?? t('labels.password');
    const resolvedPlaceholder = placeholder ?? t('labels.passwordPlaceholderSignIn');

    return (
        <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {resolvedLabel}
            </label>
            <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                    type={showPassword ? 'text' : 'password'}
                    value={value}
                    onChange={(e) => { onChange(e.target.value); onErrorClear(); }}
                    placeholder={resolvedPlaceholder}
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
                            {t(`passwordRequirements.${req.label}`)}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

export { getPasswordRequirements };
