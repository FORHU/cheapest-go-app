import React from 'react';
import { getTranslations } from 'next-intl/server';
import { fetchRoomAvailability, resolveStayDates, type PropertyData, type SearchParamsInput } from '@/lib/property/fetchPropertyData';
import RoomList from './RoomList';
import PoliciesSection from './PoliciesSection';
import FAQSection from './FAQSection';

interface Props {
    hotelId: string;
    property: PropertyData;
    searchParams: SearchParamsInput;
}

export default async function RoomsAvailabilitySection({ hotelId, property, searchParams }: Props) {
    const [{ fetchedDetails }, t] = await Promise.all([
        fetchRoomAvailability(hotelId, searchParams),
        getTranslations('property.rooms'),
    ]);

    const isEtgHotel = fetchedDetails?.provider === 'etg';

    // The stay the rates below were actually quoted for. Taken from the same resolver
    // the availability call used, not from the URL — a request that omits the dates, or
    // spells them `checkin`/`checkout`, still gets priced for a default Friday→Sunday
    // stay, and the cards have to divide by those nights rather than assume one.
    const stay = resolveStayDates(searchParams);

    return (
        <>
            {isEtgHotel ? (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-5 my-4">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
                        {t('etgNotice.title')}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                        {t('etgNotice.description')}
                    </p>
                    <RoomList
                        property={property}
                        roomTypes={fetchedDetails?.roomTypes}
                        hotelImages={property.images}
                        searchParams={{
                            checkIn:  stay.checkIn,
                            checkOut: stay.checkOut,
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
                    checkIn:  stay.checkIn,
                    checkOut: stay.checkOut,
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
