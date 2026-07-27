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

    return (
        <>
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
