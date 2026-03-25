'use client';

import { useEffect } from 'react';

export default function AdminError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[AdminError]', error.digest ?? error.message);
    }, [error]);

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="max-w-md w-full text-center space-y-6">
                <div className="w-16 h-16 mx-auto bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                    <span className="text-2xl text-red-600 dark:text-red-400">!</span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Error</h2>
                <p className="text-slate-500 dark:text-slate-400">
                    An unexpected error occurred in the admin panel.
                </p>
                <button
                    onClick={reset}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors"
                >
                    Try again
                </button>
            </div>
        </div>
    );
}
