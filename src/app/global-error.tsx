'use client';

import { useEffect } from 'react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[GlobalError]', error.digest ?? error.message);
    }, [error]);

    return (
        <html>
            <body>
                <div className="min-h-screen flex items-center justify-center px-4 bg-white">
                    <div className="max-w-md w-full text-center space-y-6">
                        <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center">
                            <span className="text-2xl text-red-600">!</span>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900">Something went wrong</h2>
                        <p className="text-slate-500">
                            An unexpected error occurred. Please try refreshing the page.
                        </p>
                        <button
                            onClick={reset}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
