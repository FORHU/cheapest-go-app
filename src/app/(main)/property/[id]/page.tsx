import React from 'react';
import PropertyGallery from '@/components/property/PropertyGallery';
import PropertyOverview from '@/components/property/PropertyOverview';
import PropertyNav from '@/components/property/PropertyNav';
import RoomList from '@/components/property/RoomList';
import PoliciesSection from '@/components/property/PoliciesSection';
import ReviewsSection from '@/components/property/ReviewsSection';
import FAQSection from '@/components/property/FAQSection';
import PropertyMapSidebar from '@/components/property/PropertyMapSidebar';
import MobilePropertyHeader from '@/components/property/MobilePropertyHeader';
import MobileBookingCTA from '@/components/property/MobileBookingCTA';
import BackButton from '@/components/common/BackButton';
import { FadeInUp, FadeIn } from '@/components/property/AnimatedContent';
import { fetchPropertyData } from '@/lib/property';
import { fetchHotelReviews } from '@/lib/property/fetchReviews';

export default async function PropertyPage({
    params,
    searchParams
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const { id } = await params;
    const searchParamsResult = await searchParams;

    // Parallel fetch: property data + reviews
    const [{ property, fetchedDetails }, reviewsData] = await Promise.all([
        fetchPropertyData(id, {
            offerId: searchParamsResult.offerId as string,
            checkIn: searchParamsResult.checkIn as string,
            checkOut: searchParamsResult.checkOut as string,
            adults: searchParamsResult.adults as string,
            children: searchParamsResult.children as string,
            rooms: searchParamsResult.rooms as string,
            currency: searchParamsResult.currency as string,
        }),
        fetchHotelReviews(id, { limit: 1000 }),
    ]);

    if (!property) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p>Property not found. (ID: {id})</p>
            </div>
        );
    }

    const mapProps = {
        hotelDetails: {
            address: fetchedDetails?.address || property.location,
            city: fetchedDetails?.city || fetchedDetails?.details?.city,
            country: fetchedDetails?.country || fetchedDetails?.details?.country
        },
        coordinates: property.coordinates,
        propertyName: property.name,
    };

    const currency = (searchParamsResult.currency as string) || 'PHP';

    return (
        <main className="min-h-screen pt-3 md:pt-6 pb-24 md:pb-20 px-3 md:px-6">
            {/* Mobile floating header — appears on scroll */}
            <MobilePropertyHeader propertyName={property.name} />

            <div className="max-w-7xl mx-auto">
                {/* Breadcrumb + Back — desktop only */}
                <FadeIn delay={0}>
                    <div className="hidden md:block">
                        <div className="mb-4">
                            <BackButton label="See all properties" />
                        </div>
                        <div className="text-xs text-slate-500 mb-4">
                            Philippines  &gt;  Baguio Properties  &gt;  {property.name}
                        </div>
                    </div>
                </FadeIn>

                {/* Gallery — full width */}
                <FadeInUp delay={0.1}>
                    <PropertyGallery images={property.images} />
                </FadeInUp>

                {/* Navigation Tabs — full width */}
                <div className="mt-4 md:mt-8">
                    <FadeInUp delay={0.2}>
                        <PropertyNav />
                    </FadeInUp>
                </div>

                {/* ═══ Split layout: Description LEFT | Map RIGHT ═══ */}
                <div className="mt-4 md:mt-8 flex flex-col lg:flex-row gap-4 md:gap-8 items-stretch">

                    {/* LEFT — Description / content */}
                    <div className="flex-1 min-w-0 space-y-4 md:space-y-8">

                        <FadeInUp delay={0.25}>
                            <PropertyOverview property={property} reviewsData={reviewsData} />
                        </FadeInUp>

                        {/* Mobile map — shown below PropertyOverview strictly on small screens */}
                        <div className="lg:hidden" id="location-mobile">
                            <FadeInUp delay={0.28}>
                                <div className="h-[280px] md:h-[350px]">
                                    <PropertyMapSidebar {...mapProps} />
                                </div>
                            </FadeInUp>
                        </div>

                        <FadeInUp delay={0.3}>
                            <hr className="border-slate-200 dark:border-white/10" />
                        </FadeInUp>

                        <FadeInUp delay={0.35}>
                            <RoomList
                                property={property}
                                roomTypes={fetchedDetails?.roomTypes}
                                hotelImages={property.images}
                                searchParams={{
                                    checkIn: searchParamsResult.checkIn as string,
                                    checkOut: searchParamsResult.checkOut as string,
                                    adults: Number(searchParamsResult.adults || 2),
                                    children: Number(searchParamsResult.children || 0),
                                    rooms: Number(searchParamsResult.rooms || 1)
                                }}
                            />
                        </FadeInUp>

                        <FadeInUp delay={0.4}>
                            <PoliciesSection
                                checkInTime={fetchedDetails?.checkInTime}
                                checkOutTime={fetchedDetails?.checkOutTime}
                                hotelImportantInformation={fetchedDetails?.hotelImportantInformation}
                                cancellationPolicies={fetchedDetails?.cancellationPolicies}
                            />
                        </FadeInUp>

                        <FadeInUp delay={0.45}>
                            <hr className="border-slate-200 dark:border-white/10" />
                        </FadeInUp>

                        <FadeInUp delay={0.5}>
                            <ReviewsSection
                                reviews={reviewsData.reviews}
                                averageRating={reviewsData.averageRating}
                                totalCount={reviewsData.totalCount}
                            />
                        </FadeInUp>

                        <FadeInUp delay={0.55}>
                            <hr className="border-slate-200 dark:border-white/10" />
                        </FadeInUp>

                        <FadeInUp delay={0.6}>
                            <FAQSection
                                propertyName={property.name}
                                checkInTime={fetchedDetails?.checkInTime}
                                checkOutTime={fetchedDetails?.checkOutTime}
                                hotelFacilities={fetchedDetails?.hotelFacilities}
                                hotelImportantInformation={fetchedDetails?.hotelImportantInformation}
                            />
                        </FadeInUp>
                    </div>

                    {/* RIGHT — Map (sticky, ~50% width on desktop) */}
                    <div className="hidden lg:block lg:w-[45%] xl:w-[40%] flex-shrink-0" id="location">
                        <div className="sticky top-[100px] h-[calc(100vh-140px)]">
                            <PropertyMapSidebar {...mapProps} />
                        </div>
                    </div>
                </div>

            </div>

            {/* Mobile floating booking CTA */}
            <MobileBookingCTA price={property.price} currency={currency} />
        </main>
    );
}
