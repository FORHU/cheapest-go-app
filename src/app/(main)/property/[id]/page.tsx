import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { parsePropertySlug, buildPropertySlug } from '@/lib/utils';
import { getTranslations } from 'next-intl/server';
import PropertyGallery from '@/components/property/PropertyGallery';
import PropertyOverview from '@/components/property/PropertyOverview';
import PropertyNav from '@/components/property/PropertyNav';
import PoliciesSection from '@/components/property/PoliciesSection';
import ReviewsSection from '@/components/property/ReviewsSection';
import FAQSection from '@/components/property/FAQSection';
import PropertyMapSidebar from '@/components/property/PropertyMapSidebarDynamic';
import MobilePropertyHeader from '@/components/property/MobilePropertyHeader';
import MobileBookingCTA from '@/components/property/MobileBookingCTA';
import BackButton from '@/components/common/BackButton';
import { FadeInUp, FadeIn } from '@/components/property/AnimatedContent';
import { fetchHotelStatic, fetchPropertyData } from '@/lib/property';
import { bundleSavingPercent } from '@/lib/pricing';
import { fetchHotelReviews } from '@/lib/property/fetchReviews';
import LocationSection from '@/components/property/LocationSectionDynamic';
import RoomsAvailabilitySection from '@/components/property/RoomsAvailabilitySection';
import PropertyDatePicker from '@/components/property/PropertyDatePicker';

function RoomsSkeleton() {
    return (
        <div className="space-y-4 animate-pulse pt-2">
            <div className="h-7 w-52 bg-slate-200 dark:bg-slate-700 rounded mb-6" />
            {[1, 2, 3].map(n => (
                <div key={n} className="h-48 rounded-xl bg-slate-200 dark:bg-slate-700" />
            ))}
        </div>
    );
}

export async function generateMetadata({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
    const { id: rawSlug } = await params;
    const { id } = parsePropertySlug(rawSlug);

    // Fast: DB only — no TGX call in metadata
    const staticData = await fetchHotelStatic(id);
    const property = staticData?.property;
    if (!property) return {};

    const city = staticData?.city || '';
    const country = staticData?.country || '';
    const location = [city, country].filter(Boolean).join(', ');
    const title = `${property.name} – Cheapest Rates | CheapestGo`;
    const description = `Book ${property.name}${location ? ` in ${location}` : ''} at the cheapest price. ${property.rating ? `Rated ${property.rating}/10.` : ''} Best deals on hotels with free cancellation options.`;
    const image = property.images?.[0] || property.image;

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            type: 'website',
            images: image ? [{ url: image, width: 1200, height: 630, alt: property.name }] : [],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: image ? [image] : [],
        },
        alternates: { canonical: `/property/${rawSlug}` },
    };
}

export default async function PropertyPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const { id: rawSlug } = await params;
    const searchParamsResult = await searchParams;
    const { id, nameSlug } = parsePropertySlug(rawSlug);
    const t = await getTranslations('property');

    // Phase 1: fast DB fetch + reviews (~10ms total)
    const [staticData, reviewsData] = await Promise.all([
        fetchHotelStatic(id),
        fetchHotelReviews(id, { limit: 1000 }),
    ]);

    // Fallback for hotels not yet in hotel_content (direct URL, not from search)
    let property = staticData?.property ?? null;
    let city = staticData?.city || '';
    let country = staticData?.country || '';
    let address = staticData?.address || '';

    if (!property) {
        // Rare: hotel not in our DB — fall back to TGX (blocking, but only for unknown hotels)
        const { property: tgxProp, fetchedDetails } = await fetchPropertyData(id, {
            checkIn:     searchParamsResult.checkIn     as string,
            checkOut:    searchParamsResult.checkOut    as string,
            adults:      searchParamsResult.adults      as string,
            children:    searchParamsResult.children    as string,
            rooms:       searchParamsResult.rooms       as string,
            currency:    searchParamsResult.currency    as string,
            nationality: searchParamsResult.nationality as string,
        });
        property = tgxProp;
        city    = fetchedDetails?.city    || fetchedDetails?.details?.city    || '';
        country = fetchedDetails?.country || fetchedDetails?.details?.country || '';
        address = fetchedDetails?.address || '';
    }

    if (!property) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p>{t('propertyNotFound', { id })}</p>
            </div>
        );
    }

    if (!nameSlug) {
        const slug = buildPropertySlug(property.name, id);
        const qs = new URLSearchParams(
            Object.fromEntries(
                Object.entries(searchParamsResult).filter(([, v]) => v !== undefined) as [string, string][]
            )
        ).toString();
        redirect(`/property/${slug}${qs ? `?${qs}` : ''}`);
    }

    const mapProps = {
        hotelDetails: { address: address || property.location, city, country },
        coordinates: property.coordinates,
        propertyName: property.name,
    };

    const currency = (searchParamsResult.currency as string) || 'KRW';
    const bundleFlightId = (searchParamsResult.bundleFlightId as string) || null;
    // Derived from the live markup rates, not a fixed figure — see bundleSavingPercent().
    // Reads server-only env, which is fine here: this is a server component.
    const bundleSaving = bundleSavingPercent();

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cheapestgo.com';
    const propertySlug = buildPropertySlug(property.name, id);

    const breadcrumbJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: t('breadcrumbHome'), item: `${siteUrl}/` },
            ...(city ? [{ '@type': 'ListItem', position: 2, name: t('breadcrumbStaysIn', { city }), item: `${siteUrl}/search?destination=${encodeURIComponent(city)}` }] : []),
            { '@type': 'ListItem', position: city ? 3 : 2, name: property.name, item: `${siteUrl}/property/${propertySlug}` },
        ],
    };

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Hotel',
        name: property.name,
        description: property.description,
        image: property.images?.[0] || property.image,
        address: {
            '@type': 'PostalAddress',
            streetAddress: address || property.location,
            addressLocality: city,
            addressCountry: country,
        },
        ...(property.rating && {
            aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: property.rating,
                bestRating: 10,
                reviewCount: property.reviews || 1,
            },
        }),
        ...(property.coordinates?.lat && {
            geo: {
                '@type': 'GeoCoordinates',
                latitude: property.coordinates.lat,
                longitude: property.coordinates.lng,
            },
        }),
    };

    // Search params forwarded to TGX for room availability
    const roomSearchParams = {
        checkIn:     searchParamsResult.checkIn     as string,
        checkOut:    searchParamsResult.checkOut     as string,
        adults:      searchParamsResult.adults       as string,
        children:    searchParamsResult.children     as string,
        rooms:       searchParamsResult.rooms        as string,
        currency:    searchParamsResult.currency     as string,
        nationality: searchParamsResult.nationality  as string,
    };

    return (
        <main className="min-h-screen pt-0 md:pt-6 pb-24 md:pb-20 px-3 md:px-6">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

            <MobilePropertyHeader propertyName={property.name} />

            <div className="max-w-7xl mx-auto">
                <FadeIn delay={0}>
                    <div className="hidden lg:block">
                        <div className="text-xs text-slate-500 mb-4">
                            {[country, city, property.name].filter(Boolean).join('  ›  ')}
                        </div>
                    </div>
                </FadeIn>

                <div className="relative">
                    <div className="lg:hidden absolute top-3 left-3 z-20">
                        <BackButton
                            label=""
                            className="bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 w-10 h-10 rounded-full flex items-center justify-center shadow-sm p-0"
                            bareIcon={true}
                        />
                    </div>
                    <FadeInUp delay={0.1}>
                        <PropertyGallery images={property.images} />
                    </FadeInUp>
                </div>

                {/* Hidden when the rates leave no gap between the standalone and bundle
                    markup — there is no saving to advertise in that case. */}
                {bundleFlightId && bundleSaving > 0 && (
                    <div className="mt-3 mx-0">
                        <div className="flex items-center gap-3 px-4 py-3 bg-linear-to-r from-violet-600 to-indigo-600 rounded-xl text-white shadow-md shadow-violet-500/20">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20 shrink-0 text-base">✦</div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold leading-tight">{t('bundleActive')}</p>
                                <p className="text-[11px] text-violet-200 leading-tight mt-0.5 truncate">{t('bundleApplied', { percent: bundleSaving })}</p>
                            </div>
                            <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-400 text-amber-900 text-[10px] font-bold">{t('savePercent', { percent: bundleSaving })}</span>
                        </div>
                    </div>
                )}

                <div className="mt-2 md:mt-8">
                    <FadeInUp delay={0.2}><PropertyNav /></FadeInUp>
                </div>

                <div className="mt-3 md:mt-8 flex flex-col lg:flex-row gap-4 md:gap-8 relative items-start w-full">
                    <div className="w-full lg:w-[55%] xl:w-[60%] min-w-0 space-y-4 md:space-y-8">
                        <FadeInUp delay={0.25}>
                            <PropertyOverview property={property} reviewsData={reviewsData} />
                        </FadeInUp>

                        <div className="lg:hidden" id="location-mobile">
                            <FadeInUp delay={0.28}>
                                <div className="w-full"><PropertyMapSidebar {...mapProps} /></div>
                            </FadeInUp>
                        </div>

                        <FadeInUp delay={0.3}>
                            <hr className="border-slate-200 dark:border-white/10" />
                        </FadeInUp>

                        {/* ── Date picker — lets user set/change stay dates ── */}
                        <PropertyDatePicker
                            propertySlug={propertySlug}
                            initialCheckIn={roomSearchParams.checkIn as string | undefined}
                            initialCheckOut={roomSearchParams.checkOut as string | undefined}
                            adults={Number(roomSearchParams.adults || 2)}
                            childrenCount={Number(roomSearchParams.children || 0)}
                            rooms={Number(roomSearchParams.rooms || 1)}
                            currency={roomSearchParams.currency as string | undefined}
                            nationality={roomSearchParams.nationality as string | undefined}
                        />

                        {/* ── Rooms + Policies: streams in after TGX (~18-22s) ── */}
                        <Suspense fallback={<RoomsSkeleton />}>
                            <RoomsAvailabilitySection
                                hotelId={id}
                                property={property}
                                searchParams={roomSearchParams}
                            />
                        </Suspense>

                        {(property.rating > 0 || reviewsData.totalCount > 0) && (
                            <>
                                <FadeInUp delay={0.45}>
                                    <hr className="border-slate-200 dark:border-white/10" />
                                </FadeInUp>
                                <FadeInUp delay={0.5}>
                                    <ReviewsSection
                                        reviews={reviewsData.reviews}
                                        averageRating={reviewsData.averageRating || property.rating || 0}
                                        totalCount={reviewsData.totalCount || property.reviews || 0}
                                    />
                                </FadeInUp>
                            </>
                        )}

                        <FadeInUp delay={0.57}>
                            <LocationSection
                                hotelDetails={{
                                    name: property.name,
                                    address: address || property.location,
                                    city,
                                    country,
                                    image: property.images?.[0],
                                }}
                                coordinates={property.coordinates}
                            />
                        </FadeInUp>
                    </div>

                    <div className="hidden lg:block lg:w-[45%] xl:w-[40%] shrink-0 sticky top-[80px]" id="location">
                        <div className="h-[calc(100vh-120px)] rounded-xl overflow-hidden shadow-sm border border-slate-200/60 dark:border-white/10">
                            <PropertyMapSidebar {...mapProps} />
                        </div>
                    </div>
                </div>
            </div>

            <MobileBookingCTA price={property.price} currency={currency} />
        </main>
    );
}
