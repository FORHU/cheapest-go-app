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

// Helper to simulate data fetching
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
            <main className="min-h-screen pt-9 pb-20 px-4 md:px-6">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-4">
                        <BackButton label="See all properties" />
                    </div>

                    {/* Navigation Breadcrumbs (Mock) */}
                    <div className="text-xs text-slate-500 mb-4">
                        Philippines  &gt;  Baguio Properties  &gt;  {property.name}
                    </div>

                    <PropertyGallery images={property.images} />

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                        {/* Main Content */}
                        <div className="lg:col-span-2 space-y-8">
                            {/* Navigation Tabs (Sticky) */}
                            <div className="sticky top-[80px] bg-white dark:bg-slate-900 z-30 flex gap-6 overflow-x-auto py-4 border-b border-slate-200 dark:border-white/10 no-scrollbar">
                                {['Overview', 'Rooms', 'Location', 'Amenities', 'Policies', 'Reviews'].map(tab => (
                                    <button key={tab} className="text-sm font-bold text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-white whitespace-nowrap">
                                        {tab}
                                    </button>
                                ))}
                            </div>

                            <PropertyOverview property={property} />

                            <hr className="border-slate-200 dark:border-white/10" />

                            <RoomList />

                            <LocationSection />

                            <PoliciesSection />

                            <FAQSection propertyName={property.name} />
                        </div>

                        {/* Sidebar */}
                        <div className="hidden lg:block">
                            <BookingWidget property={property} />
                        </div>
                    </div>
                </div>
            </main>
            <Footer />
        </>
    );
}
