import { Suspense } from 'react';
import { fetchTripsData } from '@/lib/trips';
import { TripsContent } from '@/components/trips';
import { Skeleton } from '@/components/shared/Skeleton';

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

export default function TripsPage() {
  return (
    <Suspense fallback={<TripsSkeleton />}>
      <TripsLoader />
    </Suspense>
  );
}
