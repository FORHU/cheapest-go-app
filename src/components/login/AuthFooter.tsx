'use client';

import React from 'react';
import Link from 'next/link';
import { PlaneTakeoff } from 'lucide-react';
import { AuthMode } from './types';

interface AuthFooterProps {
    mode: AuthMode;
    onToggleMode: () => void;
}

export function AuthFooter({ mode, onToggleMode }: AuthFooterProps) {
    return (
        <>
            {/* Toggle Mode */}
            <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <button
                    onClick={onToggleMode}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                    {mode === 'signin' ? 'Create one' : 'Sign in'}
                </button>
            </p>

            {/* Terms — open in a new tab so a half-filled signup form isn't lost */}
            <p className="mt-4 text-xs text-center text-slate-500 dark:text-slate-400">
                By continuing, you agree to our{' '}
                <Link
                    href="/terms-of-service"
                    target="_blank"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                    Terms &amp; Conditions
                </Link>
                {' '}and{' '}
                <Link
                    href="/privacy-policy"
                    target="_blank"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                    Privacy Statement
                </Link>
            </p>

            {/* Partner Logos */}
            <div className="mt-6 flex items-center justify-center gap-4 text-sm text-slate-400 dark:text-slate-500">
                <span className="flex items-center gap-1.5">
                    <PlaneTakeoff className="h-4 w-4" />
                    CheapestGo
                </span>
                <span>•</span>
                <span>Hotels.com</span>
                <span>•</span>
                <span>Vrbo</span>
            </div>
        </>
    );
}
