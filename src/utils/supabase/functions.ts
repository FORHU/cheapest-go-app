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

// Specific helper for fetching hotel reviews
export async function getHotelReviews(
    hotelId: string,
    limit: number = 20,
    offset: number = 0,
    getSentiment: boolean = false
) {
    const result = await invokeEdgeFunction('liteapi-reviews', { hotelId, limit, offset, getSentiment });
    return {
        reviews: result?.data || [],
        sentimentAnalysis: result?.sentimentAnalysis || null,
    };
}

// Specific helper for fetching hotel details
export async function getHotelDetails(hotelId: string, options: any = {}) {
    const { checkIn, checkOut, adults, children, rooms, currency } = options;
    const result = await searchLiteApi({
        hotelIds: [hotelId],
        checkin: checkIn,  // Edge function expects lowercase
        checkout: checkOut,
        adults,
        children,
        rooms: rooms || 1,
        currency
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

            // Collect all room photos with their source room info
            const roomPhotosWithSource: { url: string; roomName: string }[] = [];
            detailRooms.forEach((r: any) => {
                const roomName = r.roomName || r.name || 'unknown';
                (r.photos || []).forEach((p: any) => {
                    const url = p.url || p.hd_url || p.urlHd || (typeof p === 'string' ? p : null);
                    if (url) roomPhotosWithSource.push({ url, roomName });
                });
            });

            // Track used images to prevent duplicates across rooms
            const usedImages = new Set<string>();
            const hotelImages = hotel.images || [];

            hotel.roomTypes.forEach((roomType: any, index: number) => {
                const roomTypeName = (
                    roomType.rates?.[0]?.name ||
                    roomType.name ||
                    roomType.roomName ||
                    ''
                ).toLowerCase().trim();

                // 1. Try Official LiteAPI mappedRoomId Match (Best & Most Accurate)
                let matchedRoom = detailRooms.find((dr: any) => {
                    if (roomType.mappedRoomId) {
                        const drId = dr.id || dr.room_id || dr.roomId;
                        return String(roomType.mappedRoomId) === String(drId);
                    }
                    return false;
                });

                // 2. Try Name Match with improved fuzzy matching
                if (!matchedRoom && roomTypeName) {
                    const stopWords = ['room', 'with', 'and', 'the', 'a', 'an', 'for', 'of', 'only', 'non', 'refundable'];
                    const roomTypeWords = roomTypeName
                        .split(/[\s-]+/)
                        .filter((word: string) => word.length > 2 && !stopWords.includes(word));

                    let bestMatch: any = null;
                    let bestScore = 0;

                    detailRooms.forEach((dr: any) => {
                        const detailName = (dr.roomName || dr.name || '').toLowerCase().trim();
                        if (!detailName) return;

                        const detailWords = detailName.split(/[\s-]+/);

                        let score = 0;
                        roomTypeWords.forEach((word: string) => {
                            if (detailWords.some((dw: string) => dw.includes(word) || word.includes(dw))) {
                                score++;
                            }
                        });

                        if (detailName.includes(roomTypeName) || roomTypeName.includes(detailName)) {
                            score += 2;
                        }

                        if (score > bestScore) {
                            bestScore = score;
                            bestMatch = dr;
                        }
                    });

                    const threshold = roomTypeWords.length <= 2 ? 1 : Math.max(2, roomTypeWords.length * 0.5);
                    if (bestMatch && bestScore >= threshold) {
                        matchedRoom = bestMatch;
                    }
                }

                // 3. Apply Match or Smart Fallback
                if (matchedRoom && matchedRoom.photos && matchedRoom.photos.length > 0) {
                    roomType.roomPhotos = matchedRoom.photos.map((p: any) => p.url || p).filter(Boolean);
                    roomType.roomPhotos.forEach((url: string) => usedImages.add(url));
                    if (matchedRoom.description) roomType.roomDescription = matchedRoom.description;
                    if (matchedRoom.bedTypes) roomType.bedTypes = matchedRoom.bedTypes;
                    if (matchedRoom.amenities) roomType.amenities = matchedRoom.amenities;
                    if (matchedRoom.roomAmenities) roomType.amenities = matchedRoom.roomAmenities;
                } else {
                    // Smart fallback: Try to find unused images that might match the room type
                    const keyWords = roomTypeName.split(/[\s-]+/).filter((w: string) => w.length > 3);
                    let fallbackPhotos: string[] = [];

                    // Try to find photos from rooms with matching keywords
                    if (keyWords.length > 0) {
                        roomPhotosWithSource.forEach(({ url, roomName }) => {
                            if (usedImages.has(url)) return;
                            const rNameLower = roomName.toLowerCase();
                            if (keyWords.some((kw: string) => rNameLower.includes(kw))) {
                                fallbackPhotos.push(url);
                            }
                        });
                    }

                    // If no keyword match, use any unused room photo
                    if (fallbackPhotos.length === 0) {
                        roomPhotosWithSource.forEach(({ url }) => {
                            if (!usedImages.has(url) && fallbackPhotos.length < 3) {
                                fallbackPhotos.push(url);
                            }
                        });
                    }

                    // Final fallback: Use hotel images that haven't been used
                    if (fallbackPhotos.length === 0 && hotelImages.length > 0) {
                        // Skip first few images (usually lobby/exterior) and pick interior shots
                        const startIdx = Math.min(3, Math.floor(hotelImages.length / 2));
                        for (let i = 0; i < hotelImages.length && fallbackPhotos.length === 0; i++) {
                            const imgIdx = (startIdx + index + i) % hotelImages.length;
                            const img = hotelImages[imgIdx];
                            if (img && !usedImages.has(img)) {
                                fallbackPhotos = [img];
                            }
                        }
                        // Last resort: any hotel image
                        if (fallbackPhotos.length === 0) {
                            fallbackPhotos = [hotelImages[index % hotelImages.length]];
                        }
                    }

                    roomType.roomPhotos = fallbackPhotos;
                    fallbackPhotos.forEach((url: string) => usedImages.add(url));
                }
            });
        } catch (err) {
            console.error("Error applying room photo fix:", err);
        }
    }

    return hotel;
}
