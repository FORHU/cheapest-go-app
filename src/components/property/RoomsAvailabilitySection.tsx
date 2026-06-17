import React from 'react';
import { fetchTGXPropertyData, type PropertyData, type SearchParamsInput } from '@/lib/property/fetchPropertyData';
import RoomList from './RoomList';
import PoliciesSection from './PoliciesSection';
import FAQSection from './FAQSection';

interface Props {
    hotelId: string;
    property: PropertyData;
    searchParams: SearchParamsInput;
}

export default async function RoomsAvailabilitySection({ hotelId, property, searchParams }: Props) {
    const { fetchedDetails } = await fetchTGXPropertyData(hotelId, searchParams);

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
            <hr className="border-slate-200 dark:border-white/10 my-4 md:my-8" />
            <PoliciesSection
                checkInTime={fetchedDetails?.checkInTime}
                checkOutTime={fetchedDetails?.checkOutTime}
                hotelImportantInformation={fetchedDetails?.hotelImportantInformation}
                cancellationPolicies={fetchedDetails?.cancellationPolicies}
            />
            <hr className="border-slate-200 dark:border-white/10 my-4 md:my-8" />
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
