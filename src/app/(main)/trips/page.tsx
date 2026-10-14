import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { fetchTripsData, EMPTY_TRIPS } from '@/lib/trips';
import { TripsContent } from '@/components/trips';
import { Skeleton } from '@/components/shared/Skeleton';
import { getAuthenticatedUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('trips');
    return { title: t('title'), robots: { index: false, follow: false } };
}

function TripsSkeleton() {
  return (
    // The page's own frame and rhythm, so nothing jumps when the content arrives.
    <main aria-busy="true" className="min-h-screen px-4 pt-6 pb-24 sm:px-6 sm:pt-10 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 flex items-center gap-3 sm:mb-8">
          <Skeleton width={40} height={40} rounded="xl" />
          <Skeleton width={180} height={32} rounded="lg" />
        </div>
        {/* Tabs skeleton: four, at the 44px a tab is */}
        <div className="mb-6 flex gap-3 border-b border-slate-200 dark:border-white/10 sm:mb-8">
          {[96, 56, 40, 88].map(width => (
            <Skeleton key={width} width={width} height={44} rounded="lg" />
          ))}
        </div>
        {/* Card skeletons: a booking card's height */}
        <div className="space-y-3 sm:space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} height={176} rounded="xl" />
          ))}
        </div>
      </div>
    </main>
  );
}

async function TripsLoader() {
  try {
    const initialData = await fetchTripsData();
    return <TripsContent initialData={initialData} />;
  } catch (err) {
    console.error('[TripsLoader] fetchTripsData threw:', err);
    return <TripsContent initialData={EMPTY_TRIPS} />;
  }
}

export default async function TripsPage() {
  const { user } = await getAuthenticatedUser();

  if (!user) {
    redirect('/login?next=/trips');
  }

  return (
    <Suspense fallback={<TripsSkeleton />}>
      <TripsLoader />
    </Suspense>
  );
}
