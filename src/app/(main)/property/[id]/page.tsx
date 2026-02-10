import React from 'react';
import PropertyGallery from '@/components/property/PropertyGallery';
import PropertyOverview from '@/components/property/PropertyOverview';
import PropertyNav from '@/components/property/PropertyNav';
import RoomList from '@/components/property/RoomList';
import LocationSection from '@/components/property/LocationSection';
import PoliciesSection from '@/components/property/PoliciesSection';
import ReviewsSection from '@/components/property/ReviewsSection';
import FAQSection from '@/components/property/FAQSection';
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

    return (
        <main className="min-h-screen pt-6 pb-20 px-4 md:px-6">
            <div className="max-w-7xl mx-auto">
                <FadeIn delay={0}>
                    <div className="mb-4">
                        <BackButton label="See all properties" />
                    </div>
                    <div className="text-xs text-slate-500 mb-4">
                        Philippines  &gt;  Baguio Properties  &gt;  {property.name}
                    </div>
                </FadeIn>

                <FadeInUp delay={0.1}>
                    <PropertyGallery images={property.images} />
                </FadeInUp>

                <div className="mt-8">
                    <div className="space-y-8">
                        {/* Navigation Tabs */}
                        <FadeInUp delay={0.2}>
                            <PropertyNav />
                        </FadeInUp>

                        <FadeInUp delay={0.25}>
                            <PropertyOverview property={property} reviewsData={reviewsData} />
                        </FadeInUp>

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
                            <LocationSection
                                hotelDetails={{
                                    address: fetchedDetails?.address || property.location,
                                    city: fetchedDetails?.city || fetchedDetails?.details?.city,
                                    country: fetchedDetails?.country || fetchedDetails?.details?.country
                                }}
                                coordinates={property.coordinates}
                            />
                        </FadeInUp>

                        <FadeInUp delay={0.45}>
                            <PoliciesSection
                                checkInTime={fetchedDetails?.checkInTime}
                                checkOutTime={fetchedDetails?.checkOutTime}
                                hotelImportantInformation={fetchedDetails?.hotelImportantInformation}
                                cancellationPolicies={fetchedDetails?.cancellationPolicies}
                            />
                        </FadeInUp>

                        <FadeInUp delay={0.5}>
                            <hr className="border-slate-200 dark:border-white/10" />
                        </FadeInUp>

                        {/* Reviews Section */}
                        <FadeInUp delay={0.55}>
                            <ReviewsSection
                                reviews={reviewsData.reviews}
                                averageRating={reviewsData.averageRating}
                                totalCount={reviewsData.totalCount}
                            />
                        </FadeInUp>

                        <FadeInUp delay={0.6}>
                            <hr className="border-slate-200 dark:border-white/10" />
                        </FadeInUp>

                        <FadeInUp delay={0.65}>
                            <FAQSection
                                propertyName={property.name}
                                checkInTime={fetchedDetails?.checkInTime}
                                checkOutTime={fetchedDetails?.checkOutTime}
                                hotelFacilities={fetchedDetails?.hotelFacilities}
                                hotelImportantInformation={fetchedDetails?.hotelImportantInformation}
                            />
                        </FadeInUp>
                    </div>
                </div>
            </div>
        </main>
    );
}
