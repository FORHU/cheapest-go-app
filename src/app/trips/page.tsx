import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { fetchTripsData } from '@/lib/trips';
import { TripsContent } from '@/components/trips';
import { Header, Footer } from '@/components/landing';

export default async function TripsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnTo=/trips');
  }

  const initialData = await fetchTripsData();

  return (
    <>
      <Header />
      <TripsContent initialData={initialData} />
      <Footer />
    </>
  );
}
