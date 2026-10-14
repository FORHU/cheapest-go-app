'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function TripsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    console.error('[Trips Error]', error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-5xl space-y-6 px-4 py-20 text-center">
      <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        {t('trips.title')}
      </h2>
      <p className="mx-auto max-w-md leading-relaxed text-slate-600 dark:text-slate-400">
        {t('trips.description')}
      </p>
      <button
        type="button"
        onClick={reset}
        className="min-h-11 rounded-xl bg-blue-600 px-6 font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
      >
        {t('actions.retry')}
      </button>
    </div>
  );
}
