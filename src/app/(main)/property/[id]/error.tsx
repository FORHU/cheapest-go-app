'use client';

import { useEffect } from 'react';
import BackButton from '@/components/common/BackButton';
import { useTranslations } from 'next-intl';

export default function PropertyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    console.error('[Property Error]', error);
  }, [error]);

  return (
    <main className="min-h-screen pt-6 pb-20 px-4 md:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <BackButton label={t('actions.backToSearch')} />
        </div>
        <div className="mt-20 text-center space-y-6">
          <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
            {t('property.title')}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {t('property.description')}
          </p>
          <button
            onClick={reset}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors"
          >
            {t('actions.tryAgain')}
          </button>
        </div>
      </div>
    </main>
  );
}
