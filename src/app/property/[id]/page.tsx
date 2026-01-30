import React from 'react';
import { baguioProperties } from '@/data/mockProperties';
import { Header, Footer } from '@/components/landing';
import PropertyGallery from '@/components/property/PropertyGallery';
import PropertyOverview from '@/components/property/PropertyOverview';
import BookingWidget from '@/components/property/BookingWidget';
import RoomList from '@/components/property/RoomList';
import LocationSection from '@/components/property/LocationSection';
import PoliciesSection from '@/components/property/PoliciesSection';
import FAQSection from '@/components/property/FAQSection';
import BackButton from '@/components/common/BackButton';
import { FadeInUp, FadeIn, SlideInFromRight } from '@/components/property/AnimatedContent';

import { preBook, getHotelDetails } from '@/utils/supabase/functions';

// Helper to simulate data fetching
const getProperty = (id: string) => {
    return baguioProperties.find(p => p.id === id);
};

export default async function PropertyPage({
    params,
    searchParams
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const { id } = await params;
    const searchParamsResult = await searchParams;
    const { offerId } = searchParamsResult;

    let preBookResult = null;
    let fetchedPropertyDetails = null;

    // Invoke pre-book if offerId is present
    if (offerId) {
        try {
            console.log(`Checking pre-book for offerId: ${offerId}...`);
            preBookResult = await preBook({ offerId });
            console.log('Pre-book successful:', preBookResult);
        } catch (error) {
            console.error('Pre-book check failed:', error);
        }
    }

    if (!getProperty(id)) {
        try {
            // If pre-book result has hotelId, use that. Otherwise try the page ID.
            const targetHotelId = preBookResult?.data?.hotelId || id;
            console.log(`Fetching real details for hotelId: ${targetHotelId}...`);

            // Calculate default dates if missing (Tomorrow -> +2 days)
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            const dayAfter = new Date(tomorrow);
            dayAfter.setDate(tomorrow.getDate() + 2);

            const formatDate = (date: Date) => date.toISOString().split('T')[0];

            // Sanitize dates from URL (may be ISO strings like 2026-01-29T16:00:00.000Z)
            const sanitizeDate = (dateStr: string | undefined): string | undefined => {
                if (!dateStr) return undefined;
                try {
                    return new Date(decodeURIComponent(dateStr)).toISOString().split('T')[0];
                } catch {
                    return undefined;
                }
            };

            const checkInParam = sanitizeDate(searchParamsResult.checkIn as string) || formatDate(tomorrow);
            const checkOutParam = sanitizeDate(searchParamsResult.checkOut as string) || formatDate(dayAfter);

            // Pass search params to getHotelDetails to ensure we get availability for the correct dates
            fetchedPropertyDetails = await getHotelDetails(targetHotelId, {
                checkIn: checkInParam,
                checkOut: checkOutParam,
                adults: Number(searchParamsResult.adults || 2),
                children: Number(searchParamsResult.children || 0),
                rooms: Number(searchParamsResult.rooms || 1)
            });
        } catch (error) {
            console.error('Failed to fetch property details:', error);
        }
    }

    // Simulate slow data fetching
    await new Promise(resolve => setTimeout(resolve, 1500));


    let property = getProperty(id);

    // Collect room images from roomTypes to supplement hotel images
    const roomImages: string[] = [];
    if (fetchedPropertyDetails?.roomTypes) {
        fetchedPropertyDetails.roomTypes.forEach((room: any) => {
            if (room.roomPhotos && Array.isArray(room.roomPhotos)) {
                roomImages.push(...room.roomPhotos);
            }
        });
    }

    // fallback: use fetched details if available
    if (!property && fetchedPropertyDetails) {
        // Combine hotel images with room images, removing duplicates
        const hotelImages = fetchedPropertyDetails.images || [];
        const thumbnailUrl = fetchedPropertyDetails.thumbnailUrl;
        const allImages = [
            ...(thumbnailUrl ? [thumbnailUrl] : []),
            ...hotelImages,
            ...roomImages
        ].filter((img, index, arr) => img && arr.indexOf(img) === index); // Remove duplicates

        property = {
            id: fetchedPropertyDetails.hotelId || id,
            name: fetchedPropertyDetails.name || "Unknown Property",
            location: fetchedPropertyDetails.location || fetchedPropertyDetails.address || "Unknown Location",
            description: fetchedPropertyDetails.description || "No description available",
            rating: fetchedPropertyDetails.reviewRating || fetchedPropertyDetails.starRating || 0,
            reviews: fetchedPropertyDetails.reviewCount || 0,
            price: preBookResult?.price?.amount || fetchedPropertyDetails.rates?.[0]?.price?.amount || 0,
            originalPrice: undefined,
            image: allImages[0] || '',
            images: allImages.length > 0 ? allImages : [],
            amenities: fetchedPropertyDetails.hotelFacilities || fetchedPropertyDetails.details?.amenities || [],
            badges: [],
            type: 'hotel',
            coordinates: {
                lat: fetchedPropertyDetails.latitude || 0,
                lng: fetchedPropertyDetails.longitude || 0
            }
        };
    } else if (!property && (preBookResult || offerId)) {
        // Fallback for when even fetch fails but we have pre-book
        property = {
            id: id,
            name: preBookResult?.data?.name || "Property Details Unavailable",
            location: preBookResult?.data?.address || "Unknown Location",
            description: "Property details could not be fetched.",
            rating: 0,
            reviews: 0,
            price: preBookResult?.price?.amount || 0,
            image: '',
            images: [],
            amenities: [],
            badges: [],
            type: 'hotel',
            coordinates: { lat: 0, lng: 0 }
        } as any; /* eslint-disable-line @typescript-eslint/no-explicit-any */
    }

    if (!property) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p>Property not found. (ID: {id})</p>
            </div>
        );
    }

    return (
        <>
            <Header />
            <main className="min-h-screen pt-6 pb-20 px-4 md:px-6">
                <div className="max-w-7xl mx-auto">
                    <FadeIn delay={0}>
                        <div className="mb-4">
                            <BackButton label="See all properties" />
                        </div>

                        {/* Navigation Breadcrumbs (Mock) */}
                        <div className="text-xs text-slate-500 mb-4">
                            Philippines  &gt;  Baguio Properties  &gt;  {property.name}
                        </div>
                    </FadeIn>

                    <FadeInUp delay={0.1}>
                        <PropertyGallery images={property.images} />
                    </FadeInUp>

                    <div className="mt-8">
                        {/* Main Content - Full Width */}
                        <div className="space-y-8">
                            {/* Navigation Tabs (Sticky) */}
                            <FadeInUp delay={0.2}>
                                <div className="sticky top-[80px] bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg z-30 py-3 border-b border-slate-200 dark:border-white/10 -mx-4 px-4 md:-mx-6 md:px-6">
                                    <div className="flex gap-2 overflow-x-auto no-scrollbar">
                                        {['Overview', 'Rooms', 'Location', 'Amenities', 'Policies', 'Reviews'].map((tab, index) => (
                                            <button
                                                key={tab}
                                                className={`px-4 py-2 text-sm font-semibold rounded-full transition-all whitespace-nowrap ${index === 0
                                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                                                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'
                                                    }`}
                                            >
                                                {tab}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </FadeInUp>

                            <FadeInUp delay={0.25}>
                                <PropertyOverview property={property} />
                            </FadeInUp>

                            <FadeInUp delay={0.3}>
                                <hr className="border-slate-200 dark:border-white/10" />
                            </FadeInUp>

                            <FadeInUp delay={0.35}>
                                <RoomList
                                    property={property}
                                    roomTypes={fetchedPropertyDetails?.roomTypes}
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
                                        address: fetchedPropertyDetails?.address || property.location,
                                        city: fetchedPropertyDetails?.city || fetchedPropertyDetails?.details?.city,
                                        country: fetchedPropertyDetails?.country || fetchedPropertyDetails?.details?.country
                                    }}
                                    coordinates={property.coordinates}
                                />
                            </FadeInUp>

                            <FadeInUp delay={0.45}>
                                <PoliciesSection
                                    checkInTime={fetchedPropertyDetails?.checkInTime}
                                    checkOutTime={fetchedPropertyDetails?.checkOutTime}
                                    petPolicy={fetchedPropertyDetails?.details?.petPolicy}
                                    childPolicy={fetchedPropertyDetails?.details?.childPolicy}
                                />
                            </FadeInUp>

                            <FadeInUp delay={0.5}>
                                <FAQSection
                                    propertyName={property.name}
                                    checkInTime={fetchedPropertyDetails?.checkInTime}
                                    checkOutTime={fetchedPropertyDetails?.checkOutTime}
                                    petPolicy={fetchedPropertyDetails?.details?.petPolicy}
                                />
                            </FadeInUp>
                        </div>
                    </div>



                </div>
            </main>
            <Footer />
        </>
    );
}
