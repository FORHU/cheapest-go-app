'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function AuthCodeErrorPage() {
    const t = useTranslations('errors.auth');
    return (
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-obsidian">
            <main className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-md text-center">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-white/10 p-8">
                        <div className="size-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                            {t('title')}
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 mb-6">
                            {t('description')}
                        </p>
                        <div className="space-y-3">
                            <Link
                                href="/login"
                                className="block w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors"
                            >
                                {t('signInAgain')}
                            </Link>
                            <Link
                                href="/"
                                className="block w-full py-3 px-4 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white font-medium rounded-full hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                            >
                                {t('goHome')}
                            </Link>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
