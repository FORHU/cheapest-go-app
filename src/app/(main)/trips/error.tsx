'use client';

import { useEffect } from 'react';

export default function TripsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Trips Error]', error);
  }, [error]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-20 text-center space-y-6">
      <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
        Couldn't load your trips
      </h2>
      <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
        There was an error loading your booking history. Please try again.
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
