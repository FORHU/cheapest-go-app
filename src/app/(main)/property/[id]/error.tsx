'use client';

import { useEffect } from 'react';
import BackButton from '@/components/common/BackButton';

export default function PropertyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Property Error]', error);
  }, [error]);

  return (
    <main className="min-h-screen pt-6 pb-20 px-4 md:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <BackButton label="Back to search" />
        </div>
        <div className="mt-20 text-center space-y-6">
          <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
            Property unavailable
          </h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            We couldn't load this property. It may no longer be available or there was a connection issue.
          </p>
          <button
            onClick={reset}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
