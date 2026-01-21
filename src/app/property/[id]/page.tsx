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

// Helper to simulate data fetching
const getProperty = (id: string) => {
    return baguioProperties.find(p => p.id === id);
};

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    // Simulate slow data fetching
    await new Promise(resolve => setTimeout(resolve, 1500));

    const property = getProperty(id);

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

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                        {/* Main Content */}
                        <div className="lg:col-span-2 space-y-8">
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
                                <RoomList property={property} />
                            </FadeInUp>

                            <FadeInUp delay={0.4}>
                                <LocationSection />
                            </FadeInUp>

                            <FadeInUp delay={0.45}>
                                <PoliciesSection />
                            </FadeInUp>

                            <FadeInUp delay={0.5}>
                                <FAQSection propertyName={property.name} />
                            </FadeInUp>
                        </div>

                        {/* Sidebar */}
                        <div className="hidden lg:block">
                            <SlideInFromRight delay={0.3}>
                                <BookingWidget property={property} />
                            </SlideInFromRight>
                        </div>
                    </div>
                </div>
            </main>
            <Footer />
        </>
    );
}
