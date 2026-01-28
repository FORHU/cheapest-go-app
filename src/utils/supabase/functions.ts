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

            console.log("[PhotoFix] DEBUG - Starting room photo matching");
            console.log("[PhotoFix] Number of roomTypes:", hotel.roomTypes.length);
            console.log("[PhotoFix] Number of detailRooms:", detailRooms.length);

            // Log first roomType structure for debugging
            if (hotel.roomTypes[0]) {
                console.log("[PhotoFix] Sample roomType keys:", Object.keys(hotel.roomTypes[0]));
                console.log("[PhotoFix] Sample roomType.mappedRoomId:", hotel.roomTypes[0].mappedRoomId);
                console.log("[PhotoFix] Sample roomType.rates[0]?.name:", hotel.roomTypes[0].rates?.[0]?.name);
            }

            // Log first detailRoom structure for debugging
            if (detailRooms[0]) {
                console.log("[PhotoFix] Sample detailRoom keys:", Object.keys(detailRooms[0]));
                console.log("[PhotoFix] Sample detailRoom.id:", detailRooms[0].id);
                console.log("[PhotoFix] Sample detailRoom.name:", detailRooms[0].name || detailRooms[0].roomName);
                console.log("[PhotoFix] Sample detailRoom photos count:", detailRooms[0].photos?.length || 0);
            }

            // Create a pool of ONLY room photos first (avoid lobby/exterior shots for rooms)
            const allRoomPhotos = detailRooms.flatMap((r: any) => r.photos || []).map((p: any) => p.url || p.hd_url || p.urlHd || p).filter(Boolean);
            const fallbackPool = allRoomPhotos.length > 0 ? allRoomPhotos : (hotel.images || []);
            const distinctImages = Array.from(new Set(fallbackPool));

            console.log("[PhotoFix] Total room photos available:", allRoomPhotos.length);
            console.log("[PhotoFix] Distinct images in pool:", distinctImages.length);

            hotel.roomTypes.forEach((roomType: any, index: number) => {

                // 1. Try Official LiteAPI mappedRoomId Match (Best & Most Accurate)
                // Note: mappedRoomId is returned when roomMapping: true is set in the rates request
                let matchedRoom = detailRooms.find((dr: any) => {
                    if (roomType.mappedRoomId) {
                        const drId = dr.id || dr.room_id || dr.roomId;
                        return String(roomType.mappedRoomId) === String(drId);
                    }
                    return false;
                });

                // 2. Try Name Match (from rates array) with improved fuzzy matching
                if (!matchedRoom) {
                    // Get room name from the rates array (where LiteAPI stores it)
                    const roomTypeName = (
                        roomType.rates?.[0]?.name ||
                        roomType.name ||
                        roomType.roomName ||
                        ''
                    ).toLowerCase().trim();

                    if (roomTypeName) {
                        // Extract key words from room type name (ignore common words)
                        const stopWords = ['room', 'with', 'and', 'the', 'a', 'an', 'for', 'of'];
                        const roomTypeWords = roomTypeName
                            .split(/[\s-]+/)
                            .filter(word => word.length > 2 && !stopWords.includes(word));

                        // Try fuzzy matching based on key words
                        let bestMatch: any = null;
                        let bestScore = 0;

                        detailRooms.forEach((dr: any) => {
                            const detailName = (dr.roomName || dr.name || '').toLowerCase().trim();
                            if (!detailName) return;

                            const detailWords = detailName.split(/[\s-]+/);

                            // Count how many key words from roomType appear in detailName
                            let score = 0;
                            roomTypeWords.forEach(word => {
                                if (detailWords.some(dw => dw.includes(word) || word.includes(dw))) {
                                    score++;
                                }
                            });

                            // Also check if roomTypeName is contained in detailName
                            if (detailName.includes(roomTypeName)) {
                                score += 2; // Bonus for substring match
                            }

                            if (score > bestScore) {
                                bestScore = score;
                                bestMatch = dr;
                            }
                        });

                        // Accept match if at least 50% of key words matched
                        // For 1-2 key words, require at least 1 match. For 3+, require 50% or score >= 2
                        const threshold = roomTypeWords.length <= 2 ? 1 : Math.max(2, roomTypeWords.length * 0.5);
                        if (bestMatch && bestScore >= threshold) {
                            matchedRoom = bestMatch;
                            console.log(`[PhotoFix] ✓ Fuzzy match found: '${roomTypeName}' matched with '${matchedRoom.roomName || matchedRoom.name}' (score: ${bestScore}/${roomTypeWords.length}, threshold: ${threshold})`);
                        }
                    } else {
                        console.log(`[PhotoFix] No room name found for roomType at index ${index}`);
                    }
                }

                if (!matchedRoom) {
                    const roomName = roomType.rates?.[0]?.name || roomType.name || 'undefined';
                    console.log(`[PhotoFix] ✗ No match for room: '${roomName}' (MappedID: ${roomType.mappedRoomId || 'none'})`);
                }

                // 3. Apply Match
                if (matchedRoom && matchedRoom.photos && matchedRoom.photos.length > 0) {
                    roomType.roomPhotos = matchedRoom.photos.map((p: any) => p.url || p.hd_url || p.urlHd || p).filter(Boolean);
                    console.log(`[PhotoFix] ✓ Assigned ${roomType.roomPhotos.length} photos to room`);
                    if (matchedRoom.description) roomType.roomDescription = matchedRoom.description;
                    if (matchedRoom.bedTypes) roomType.bedTypes = matchedRoom.bedTypes;
                    if (matchedRoom.amenities) roomType.amenities = matchedRoom.amenities;
                    if (matchedRoom.roomAmenities) roomType.amenities = matchedRoom.roomAmenities; // Handle API variations
                } else {
                    // Fallback: Use unique images from distinct pool to avoid duplicates
                    if (distinctImages.length > 0) {
                        // Use modulo to cycle through distinct images
                        roomType.roomPhotos = [distinctImages[index % distinctImages.length]];
                        console.log(`[PhotoFix] ⚠ Using fallback image ${index % distinctImages.length + 1}/${distinctImages.length}`);
                    } else if (hotel.images && hotel.images.length > 0) {
                        roomType.roomPhotos = [hotel.images[0]];
                        console.log(`[PhotoFix] ⚠ Using hotel main image as fallback`);
                    } else {
                        roomType.roomPhotos = [];
                        console.log(`[PhotoFix] ✗ No images available`);
                    }
                }
            });
            console.log("Client-side room photo correction applied.");
        } catch (err) {
            console.error("Error applying room photo fix:", err);
        }
    }

    return hotel;
}
