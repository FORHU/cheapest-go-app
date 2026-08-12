import React from 'react';
import { fetchRoomAvailability, type PropertyData, type SearchParamsInput } from '@/lib/property/fetchPropertyData';
import RoomList from './RoomList';
import PoliciesSection from './PoliciesSection';
import FAQSection from './FAQSection';

interface Props {
    hotelId: string;
    property: PropertyData;
    searchParams: SearchParamsInput;
}

export default async function RoomsAvailabilitySection({ hotelId, property, searchParams }: Props) {
    // Route by provider (ETG hotels can't be served by OTV) instead of always TGX.
    const { fetchedDetails } = await fetchRoomAvailability(hotelId, searchParams);

    const isEtgHotel = fetchedDetails?.provider === 'etg';

    return (
        <>
            {isEtgHotel ? (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-5 my-4">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
                        Online booking not yet available
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                        This property is managed by our partner booking system. Indicative prices are shown below. Please contact us to confirm availability and complete your reservation.
                    </p>
                    <RoomList
                        property={property}
                        roomTypes={fetchedDetails?.roomTypes}
                        hotelImages={property.images}
                        searchParams={{
                            checkIn:  searchParams.checkIn  as string,
                            checkOut: searchParams.checkOut as string,
                            adults:   Number(searchParams.adults   || 2),
                            children: Number(searchParams.children || 0),
                            rooms:    Number(searchParams.rooms    || 1),
                        }}
                        bookingDisabled
                    />
                </div>
            ) : (
            <RoomList
                property={property}
                roomTypes={fetchedDetails?.roomTypes}
                hotelImages={property.images}
                searchParams={{
                    checkIn:  searchParams.checkIn  as string,
                    checkOut: searchParams.checkOut as string,
                    adults:   Number(searchParams.adults   || 2),
                    children: Number(searchParams.children || 0),
                    rooms:    Number(searchParams.rooms    || 1),
                }}
            />
            )}
            <PoliciesSection
                checkInTime={fetchedDetails?.checkInTime}
                checkOutTime={fetchedDetails?.checkOutTime}
                hotelImportantInformation={fetchedDetails?.hotelImportantInformation}
                cancellationPolicies={fetchedDetails?.cancellationPolicies}
            />
            <FAQSection
                propertyName={property.name}
                checkInTime={fetchedDetails?.checkInTime}
                checkOutTime={fetchedDetails?.checkOutTime}
                hotelFacilities={fetchedDetails?.hotelFacilities}
                hotelImportantInformation={fetchedDetails?.hotelImportantInformation}
            />
        </>
    );
}
