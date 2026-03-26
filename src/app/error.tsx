'use client';

import { useEffect } from 'react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Root Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
        Something went wrong
      </h2>
      <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
        An unexpected error occurred. Please try again.
      </p>
      <button
        onClick={reset}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
