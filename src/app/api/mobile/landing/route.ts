import { NextRequest, NextResponse } from 'next/server';
import { getHotelDeals, getLandingData } from '@/lib/server/landing/get-landing-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/landing
 *
 * Public endpoint — no auth required. Returns the same landing data the web
 * landing page renders (flight deals, weekend deals, popular destinations,
 * unique stays, travel styles), sourced through the shared getLandingData()
 * flow so web and mobile stay in sync.
 *
 * Photo URLs from getLandingData() may be relative (/api/hotel-photo?…,
 * /api/destination-photo?…). The mobile <Image> can't resolve relative paths,
 * so we absolutize them — against the ORIGIN the client actually connected to
 * (e.g. the LAN dev IP the phone hit), NOT env.SITE_URL, which is localhost in
 * dev and therefore unreachable from a physical device.
 */
function absolutize(url: string | undefined | null, base: string): string {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
}

function fixImages<T extends { image?: string }>(items: T[], base: string): T[] {
    return items.map(item => ({ ...item, image: absolutize(item.image, base) }));
}

export async function GET(req: NextRequest) {
    // Absolute base = the host the device actually connected to (e.g. the LAN dev IP
    // http://192.168.1.36:3000). Derive it from the Host header, NOT req.url — Next
    // normalizes req.url's host to "localhost" in dev, which a physical device can't
    // reach. x-forwarded-proto carries https behind a prod proxy.
    const host = req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') ?? 'http';
    const origin = host ? `${proto}://${host}` : new URL(req.url).origin;
    try {
        // "Trending near you" uses hotel_deals (real TravelgateX/ETG properties) so
        // its card images resolve through /api/hotel-photo?hotelCode=… rather than the
        // curated weekend_flight_deals rows, which carry no hotel code. Fall back to the
        // curated weekend deals if hotel_deals is empty so the section never goes blank.
        const [data, hotelDeals] = await Promise.all([getLandingData(), getHotelDeals()]);
        const weekendDeals = (hotelDeals.length > 0 ? hotelDeals : data.weekendDeals).map((d: any) => ({
            ...d,
            // Raw provider CDNs (Cloudflare-fronted cdn.worldota.net) block React Native's
            // native image loader even though browsers/curl load them fine. Route hotel
            // photos through our own /api/hotel-photo proxy so the device fetches image
            // bytes from this origin instead of the blocked CDN.
            image: d.hotelCode
                ? `/api/hotel-photo?hotelCode=${encodeURIComponent(d.hotelCode)}`
                : d.image,
        }));
        return NextResponse.json({
            flightDeals: fixImages(data.flightDeals as any, origin),
            weekendDeals: fixImages(weekendDeals as any, origin),
            popularDestinations: fixImages(data.popularDestinations as any, origin),
            uniqueStays: fixImages(data.uniqueStays as any, origin),
            travelStyles: fixImages(data.travelStyles as any, origin),
        });
    } catch (err) {
        console.error('[mobile/landing] error:', (err as Error).message ?? err);
        // Never 500 the landing screen — return an empty payload the app can render around.
        return NextResponse.json({
            flightDeals: [],
            weekendDeals: [],
            popularDestinations: [],
            uniqueStays: [],
            travelStyles: [],
        });
    }
}
