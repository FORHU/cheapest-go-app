import { fetchTripsData } from '@/lib/trips';
import { TripsContent } from '@/components/trips';
import { Header, Footer } from '@/components/landing';

export default async function TripsPage() {
  // Auth protection handled by middleware.ts
  // This page is only accessible to authenticated users

  const initialData = await fetchTripsData();

  return (
    <>
      <Header />
      <TripsContent initialData={initialData} />
      <Footer />
    </>
  );
}
