'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { AuthMode } from './types';

interface AuthFooterProps {
    mode: AuthMode;
    onToggleMode: () => void;
}

export function AuthFooter({ mode, onToggleMode }: AuthFooterProps) {
    const t = useTranslations('auth');

    return (
        <>
            {/* Toggle Mode */}
            <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                {mode === 'signin' ? t('emailStep.noAccount') : t('emailStep.hasAccount')}{' '}
                <button
                    onClick={onToggleMode}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                    {mode === 'signin' ? t('actions.createOne') : t('actions.signIn')}
                </button>
            </p>

            {/* Terms acceptance moved into the form as a required checkbox
                (see TermsAcceptanceCheckbox in LoginContent). */}

        </>
    );
}
