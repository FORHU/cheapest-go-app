export async function invokeEdgeFunction<T = any>(
    functionName: string,
    body?: any,
    options?: { headers?: Record<string, string>; method?: 'POST' | 'GET' | 'PUT' | 'DELETE' | 'PATCH' }
) {
    // Use direct HTTP fetch to bypass Supabase client auth issues on server side
    // Edge functions can be called directly with the anon key in the Authorization header
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

    const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;
    const method = options?.method || 'POST';

    console.log(`[invokeEdgeFunction] Calling ${functionUrl}`);

    const response = await fetch(functionUrl, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            ...options?.headers
        },
        body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
        let errorText = '';
        try {
            errorText = await response.text();
        } catch (e) {
            errorText = 'Could not read error response';
        }
        throw new Error(`Error invoking ${functionName}: ${response.statusText || 'Unknown error'} (Status: ${response.status}). details: ${errorText}`);
    }

    const data = await response.json();
    return data as T;
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
                // 3. Try Name Match (Strict Substring)

                // 3. Try Name Match (Strict Substring)
                if (!matchedRoom) {
                    // Robustly resolve the room name from various potential properties
                    const roomTypeName = (
                        roomType.name ||
                        roomType.roomName ||
                        (roomType.rates && roomType.rates[0] && roomType.rates[0].name) ||
                        ''
                    ).toLowerCase();

                    if (roomTypeName) {
                        matchedRoom = detailRooms.find((dr: any) => {
                            const detailName = (dr.roomName || dr.name || '').toLowerCase();
                            // Only match if names are very similar
                            const isMatch = (roomTypeName.includes(detailName) || detailName.includes(roomTypeName)) &&
                                Math.abs(roomTypeName.length - detailName.length) < 10;

                            if (isMatch) console.log(`[PhotoFix] Name match found: '${roomTypeName}' ~= '${detailName}'`);
                            return isMatch;
                        });
                    }
                }

                if (!matchedRoom) {
                    console.log(`[PhotoFix] No match for room: '${roomType.name}' (ID: ${roomType.room_id}, MappedID: ${roomType.mappedRoomId})`);
                    // Log available detail rooms for debugging
                    // console.log("Available detail rooms:", detailRooms.map((dr: any) => `${dr.roomName || dr.name} (${dr.id})`).join(", "));
                }

                // 4. Apply Match
                if (matchedRoom && matchedRoom.photos && matchedRoom.photos.length > 0) {
                    roomType.roomPhotos = matchedRoom.photos.map((p: any) => p.url || p.hd_url || p.urlHd || p).filter(Boolean);
                    if (matchedRoom.description) roomType.roomDescription = matchedRoom.description;
                    if (matchedRoom.bedTypes) roomType.bedTypes = matchedRoom.bedTypes;
                    if (matchedRoom.amenities) roomType.amenities = matchedRoom.amenities;
                    if (matchedRoom.roomAmenities) roomType.amenities = matchedRoom.roomAmenities; // Handle API variations
                } else {
                    // Fallback: If no specific room match, use the HOTEL'S main images 
                    // Do NOT guess by index or pool, as this causes duplicate/wrong images for different room types
                    roomType.roomPhotos = hotel.images || [];
                }
            });
            console.log("Client-side room photo correction applied (Strict MappedRoomID Strategy).");
        } catch (err) {
            console.error("Error applying room photo fix:", err);
        }
    }

    return hotel;
}
