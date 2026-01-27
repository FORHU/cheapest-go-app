export async function invokeEdgeFunction<T = any>(
    functionName: string,
    body?: any,
    options?: { headers?: Record<string, string>; method?: 'POST' | 'GET' | 'PUT' | 'DELETE' | 'PATCH' }
) {
    let supabase;

    if (typeof window === 'undefined') {
        // Server-side
        const { createClient } = await import('./server');
        supabase = await createClient();
    } else {
        // Client-side
        const { createClient } = await import('./client');
        supabase = createClient();
    }

    const { data, error } = await supabase.functions.invoke<T>(functionName, {
        body,
        headers: options?.headers,
        method: options?.method || 'POST',
    });

    if (error) {
        let responseBody = '';
        try {
            // Check if we can read the response body from the error context or if we need to do it differently
            // The Supabase client might wrap the error.
            // If error is just an object, we serialize it.
            responseBody = JSON.stringify(error);

            // Attempt to inspect if it's a specific HTTP error structure
            if ('context' in error && error.context && 'json' in error.context && typeof error.context.json === 'function') {
                const json = await error.context.json();
                responseBody = JSON.stringify(json);
            }
        } catch (e) {
            responseBody = 'Could not read response body';
        }

        throw new Error(`Error invoking ${functionName}: ${error.message || 'Unknown error'} (Status: ${error.code || 'Unknown'}). details: ${responseBody}`);
    }

    return data;
}

// Specific helper for liteapi-search
export async function searchLiteApi(params: any) {
    return invokeEdgeFunction('liteapi-search', params);
}

// Specific helper for pre-book
export async function preBook(params: any) {
    return invokeEdgeFunction('pre-book', params);
}

// Specific helper for fetching hotel details
export async function getHotelDetails(hotelId: string, options: any = {}) {
    const { checkIn, checkOut, adults, children } = options;
    const result = await searchLiteApi({
        hotelIds: [hotelId],
        checkin: checkIn,  // Edge function expects lowercase
        checkout: checkOut,
        adults,
        children
    });
    const hotel = result?.data?.[0] || null;

    // Attach debugInfo to hotel object for troubleshooting
    if (hotel && result?.debugInfo) {
        hotel._debugInfo = result.debugInfo;
    }

    // CLIENT-SIDE FIX: Re-map room photos to correct edge function errors
    // distinct rooms should not share the same photo unless they are the same room type
    if (hotel && hotel.roomTypes && hotel.detailRooms) {
        try {
            const detailRooms = hotel.detailRooms;

            // Create a pool of ONLY room photos first (avoid lobby/exterior shots for rooms)
            const allRoomPhotos = detailRooms.flatMap((r: any) => r.photos || []).map((p: any) => p.url || p.hd_url || p.urlHd || p).filter(Boolean);
            const fallbackPool = allRoomPhotos.length > 0 ? allRoomPhotos : (hotel.images || []);
            const distinctImages = Array.from(new Set(fallbackPool));

            hotel.roomTypes.forEach((roomType: any, index: number) => {

                // 1. Try Official LiteAPI mappedRoomId Match (Best & Most Accurate)
                let matchedRoom = detailRooms.find((dr: any) => {
                    if (roomType.mappedRoomId) {
                        const drId = dr.id || dr.room_id;
                        return String(roomType.mappedRoomId) === String(drId);
                    }
                    return false;
                });

                // 2. Try Accurate ID Match (Legacy)
                if (!matchedRoom) {
                    matchedRoom = detailRooms.find((dr: any) => {
                        const rtId = roomType.room_id || roomType.id;
                        const drId = dr.id || dr.room_id;
                        return rtId && drId && String(rtId) === String(drId);
                    });
                }

                // 3. Try Name Match (Strict Substring)
                if (!matchedRoom) {
                    const roomTypeName = (roomType.name || '').toLowerCase();
                    matchedRoom = detailRooms.find((dr: any) => {
                        const detailName = (dr.roomName || dr.name || '').toLowerCase();
                        return (roomTypeName.includes(detailName) || detailName.includes(roomTypeName)) &&
                            Math.abs(roomTypeName.length - detailName.length) < 15;
                    });
                }

                // 4. Fallback to Index Match
                if (!matchedRoom && detailRooms[index]) {
                    matchedRoom = detailRooms[index];
                }

                // 5. Apply Match or Fallback to Room Photo Pool
                if (matchedRoom && matchedRoom.photos && matchedRoom.photos.length > 0) {
                    roomType.roomPhotos = matchedRoom.photos.map((p: any) => p.url || p.hd_url || p.urlHd || p).filter(Boolean);
                    if (matchedRoom.description) roomType.roomDescription = matchedRoom.description;
                    if (matchedRoom.bedTypes) roomType.bedTypes = matchedRoom.bedTypes;
                    if (matchedRoom.amenities) roomType.amenities = matchedRoom.amenities;
                    if (matchedRoom.roomAmenities) roomType.amenities = matchedRoom.roomAmenities; // Handle API variations
                } else {
                    // Fallback: Assign a distinct image from the ROOM pool based on index
                    if (distinctImages.length > 0) {
                        roomType.roomPhotos = [distinctImages[index % distinctImages.length]];
                    } else {
                        roomType.roomPhotos = [];
                    }
                }
            });
            console.log("Client-side room photo correction applied (MappedRoomID Strategy).");
        } catch (err) {
            console.error("Error applying room photo fix:", err);
        }
    }

    return hotel;
}
