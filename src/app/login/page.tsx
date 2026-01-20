"use client";

import React from 'react';
import Link from 'next/link';
import { PlaneTakeoff, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import EmailStep from '@/components/auth/EmailStep';
import PasswordStep from '@/components/auth/PasswordStep';
import RegisterStep from '@/components/auth/RegisterStep';

export default function LoginPage() {
    const { authStep } = useAuth();

    const renderStep = () => {
        switch (authStep) {
            case 'password':
                return <PasswordStep />;
            case 'register':
                return <RegisterStep />;
            case 'forgot-password':
                return (
                    <div className="text-center py-8">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                            Reset your password
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400">
                            Password reset functionality coming soon.
                        </p>
                    </div>
                );
            default:
                return <EmailStep />;
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-obsidian">
            {/* Simple Header */}
            <header className="w-full py-6 px-8">
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to home
                </Link>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                    {/* Logo */}
                    <div className="flex justify-center mb-8">
                        <Link href="/" className="flex items-center gap-3">
                            <div className="size-12 flex items-center justify-center bg-slate-900 dark:bg-white/5 rounded-xl shadow-sm border border-transparent dark:border-white/10">
                                <PlaneTakeoff className="text-white dark:text-obsidian-accent w-7 h-7" />
                            </div>
                            <h1 className="text-slate-900 dark:text-white font-display font-bold text-2xl tracking-tight">
                                AeroVantage<span className="text-alabaster-accent dark:text-obsidian-accent">.Pro</span>
                            </h1>
                        </Link>
                    </div>

                    {/* Auth Card */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-white/10 p-8">
                        {renderStep()}
                    </div>

                    {/* Partner Info */}
                    <p className="mt-6 text-xs text-center text-slate-400 dark:text-slate-500">
                        Your account works across AeroVantage and all partner sites
                    </p>
                </div>
            </main>

            {/* Footer */}
            <footer className="py-6 px-8 text-center">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                    © 2026 AeroVantage Pro. All rights reserved.
                </p>
            </footer>
        </div>
    );
}
