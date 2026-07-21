"use client";

import React from 'react';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface PasswordRequirementsProps {
    password: string;
}

export const PasswordRequirements: React.FC<PasswordRequirementsProps> = ({ password }) => {
    const t = useTranslations('auth');
    const requirements = [
        { label: t('passwordRequirements.minLength'), met: password.length >= 8 },
        { label: t('passwordRequirements.uppercase'), met: /[A-Z]/.test(password) },
        { label: t('passwordRequirements.lowercase'), met: /[a-z]/.test(password) },
        { label: t('passwordRequirements.number'), met: /\d/.test(password) },
    ];

    if (!password) return null;

    return (
        <div className="mt-3 grid grid-cols-2 gap-2">
            {requirements.map((req, index) => (
                <div key={index} className="flex items-center gap-1.5">
                    {req.met ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                        <X className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                    )}
                    <span className={`text-xs ${req.met ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {req.label}
                    </span>
                </div>
            ))}
        </div>
    );
};
