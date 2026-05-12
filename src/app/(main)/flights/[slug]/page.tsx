import { redirect, notFound } from 'next/navigation';
import { parseFlightSlug } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function FlightSlugPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const { slug } = await params;
    const sp = await searchParams;

    const route = parseFlightSlug(slug);
    if (!route) notFound();

    const params_ = new URLSearchParams({
        origin: route.origin,
        destination: route.destination,
        ...(sp.departDate ? { departDate: sp.departDate as string } : {}),
        ...(sp.returnDate ? { returnDate: sp.returnDate as string } : {}),
        ...(sp.adults ? { adults: sp.adults as string } : {}),
        ...(sp.cabin ? { cabin: sp.cabin as string } : {}),
    });

    redirect(`/flights/search?${params_.toString()}`);
}
