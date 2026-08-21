'use client';

import { useMemo } from 'react';
import {
    RoomType,
    GroupedRoom,
    groupRoomsByName,
    findRateByOfferId,
    getRoomImage,
} from '@/lib/room';

export interface UseRoomGroupingOptions {
    /** Room types from API */
    roomTypes?: RoomType[];
    /** Hotel images to use as fallbacks */
    hotelImages?: string[];
}

export interface UseRoomGroupingReturn {
    /** Grouped rooms with rate options */
    groupedRooms: GroupedRoom[];
    /** Whether there are any rooms to display */
    hasRooms: boolean;
    /** Get image for a room at index */
    getImage: (groupedRoom: GroupedRoom, index: number) => string | undefined;
    /** Find rate by offer ID */
    findRate: (groupedRoom: GroupedRoom, offerId?: string) => ReturnType<typeof findRateByOfferId>;
}

/**
 * Hook to manage room grouping and data transformation.
 * Groups room types by physical room name and provides utility functions.
 *
 * @example
 * const { groupedRooms, hasRooms, getImage } = useRoomGrouping({
 *   roomTypes: property.roomTypes,
 *   hotelImages: property.images,
 * });
 */
export function useRoomGrouping({
    roomTypes,
    hotelImages = [],
}: UseRoomGroupingOptions): UseRoomGroupingReturn {
    const groupedRooms = useMemo(
        () => groupRoomsByName(roomTypes || []),
        [roomTypes]
    );

    const getImage = useMemo(
        () => (groupedRoom: GroupedRoom, index: number) =>
            getRoomImage(groupedRoom, index, hotelImages),
        [hotelImages]
    );

    const findRate = useMemo(
        () => (groupedRoom: GroupedRoom, offerId?: string) =>
            findRateByOfferId(groupedRoom, offerId),
        []
    );

    return {
        groupedRooms,
        hasRooms: groupedRooms.length > 0,
        getImage,
        findRate,
    };
}
