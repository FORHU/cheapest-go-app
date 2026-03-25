'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function AuthError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[AuthError]', error.digest ?? error.message);
    }, [error]);

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="max-w-md w-full text-center space-y-6">
                <div className="w-16 h-16 mx-auto bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                    <span className="text-2xl text-red-600 dark:text-red-400">!</span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Authentication Error</h2>
                <p className="text-slate-500 dark:text-slate-400">
                    Something went wrong during authentication. Please try again.
                </p>
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={reset}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors"
                    >
                        Try again
                    </button>
                    <Link
                        href="/"
                        className="px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-white font-medium rounded-full transition-colors"
                    >
                        Go home
                    </Link>
                </div>
            </div>
        </div>
    );
}
