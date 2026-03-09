import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { fetchTripsData } from '@/lib/trips';
import { TripsContent } from '@/components/trips';
import { Skeleton } from '@/components/shared/Skeleton';
import { getAuthenticatedUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

function TripsSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      {/* Tabs skeleton */}
      <div className="flex gap-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} width={100} height={36} rounded="lg" />
        ))}
      </div>
      {/* Card skeletons */}
      {[1, 2, 3].map(i => (
        <Skeleton key={i} height={160} rounded="xl" />
      ))}
    </div>
  );
}

async function TripsLoader() {
  const initialData = await fetchTripsData();
  return <TripsContent initialData={initialData} />;
}

export default async function TripsPage() {
  const { user } = await getAuthenticatedUser();

  if (!user) {
    redirect('/');
  }

  return (
    <Suspense fallback={<TripsSkeleton />}>
      <TripsLoader />
    </Suspense>
  );
}
