import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Declare Deno to avoid lint errors in this environment
declare const Deno: any;

interface HotelDetails {
  id: string | number;
  name: string;
  hotel_star_rating?: number;
  star_rating?: number;
  main_photo?: string;
  address?: string;
  [key: string]: any;
}

interface Hotel {
  hotelId: string;
  details?: HotelDetails;
  name?: string;
  starRating?: number;
  thumbnailUrl?: string;
  address?: string;
  location?: string;
  description?: string;
  reviewCount?: number;
  reviewRating?: number;
  refundableTag?: string; // "RFN" = refundable, "NRFN" = non-refundable
  boardTypes?: string[]; // Meal plan types: "Breakfast included", "Room only", etc.
  roomTypes?: Array<{
    offerId?: string;
    rates?: Array<{
      refundableTag?: string;
      refundable_tag?: string;
      refundable?: boolean;
      isRefundable?: boolean;
      boardName?: string;
      boardType?: string;
      board?: string;
      mealPlanName?: string;
      meal_plan?: string;
      mealPlan?: string;
      cancellationPolicy?: any;
      cancelPolicyInfos?: Array<{
        cancelTime: string;
        amount: number;
        currency: string;
        type: string;
      }>;
    }>;
  }>;
  [key: string]: any;
}

// Haversine formula to calculate distance between two lat/lng points
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): string {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`;
  }
  return `${distance.toFixed(1)} km`;
}

/**
 * Compute the centroid (average lat/lng) of all hotels that have coordinates.
 * This dynamically determines the "city center" from the actual hotel data,
 * so it works for ANY city without hardcoding coordinates.
 */
function computeCentroid(hotels: Hotel[], detailsMap: Map<string, HotelDetails>): { lat: number; lng: number } | null {
  let sumLat = 0, sumLng = 0, count = 0;
  for (const hotel of hotels) {
    const detail = detailsMap.get(String(hotel.hotelId));
    const lat = detail?.latitude || (detail?.location as any)?.latitude || hotel.latitude;
    const lng = detail?.longitude || (detail?.location as any)?.longitude || hotel.longitude;
    if (lat && lng) {
      sumLat += lat;
      sumLng += lng;
      count++;
    }
  }
  if (count === 0) return null;
  return { lat: sumLat / count, lng: sumLng / count };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const LITEAPI_KEY = Deno.env.get('LITEAPI_KEY');

  try {
    const t0 = Date.now();
    const rawData = await req.text();
    const body = JSON.parse(rawData || "{}");
    console.log("===== SEARCH REQUEST =====", JSON.stringify(body).substring(0, 300));

    // Mapping inputs
    const checkin = body.checkin || body.startDate;
    const checkout = body.checkout || body.endDate;
    const countryCode = body.countryCode || "";
    const currency = body.currency || "USD";
    const guestNationality = body.guestNationality || body.guest_nationality || countryCode || "US";
    const placeId = body.placeId;

    // 1. Fetch Rates

    let locationParams = {};

    let normalizedCityName = body.cityName || "";
    if (normalizedCityName) {
      normalizedCityName = normalizedCityName.replace(/\s+City$/i, '').trim();
    }

    if (body.hotelIds) {
      locationParams = { hotelIds: body.hotelIds };
    } else if (normalizedCityName && countryCode) {
      // Prioritize cityName and countryCode over placeId for better results in smaller regions (like Baguio)
      locationParams = { cityName: normalizedCityName, countryCode: countryCode };
      // Include placeId if it exists to help LiteAPI disambiguate
      if (placeId) {
        (locationParams as any).placeId = placeId;
      }
    } else if (placeId) {
      locationParams = { placeId: placeId };
    } else if (normalizedCityName) {
      // cityName without countryCode — still try (LiteAPI may resolve it)
      locationParams = { cityName: normalizedCityName };
    } else {
      locationParams = { cityName: "Manila", countryCode: "PH" };
    }

    // Build filter parameters from request body
    const filterParams: Record<string, any> = {};
    if (body.hotelName) filterParams.hotelName = body.hotelName;
    if (body.starRating && Array.isArray(body.starRating) && body.starRating.length > 0) {
      filterParams.starRating = body.starRating;
    }
    if (body.minRating && typeof body.minRating === 'number') filterParams.minRating = body.minRating;
    if (body.minReviewsCount && typeof body.minReviewsCount === 'number') filterParams.minReviewsCount = body.minReviewsCount;
    if (body.facilities && Array.isArray(body.facilities) && body.facilities.length > 0) {
      filterParams.facilities = body.facilities;
      if (body.strictFacilityFiltering === true) filterParams.strictFacilityFiltering = true;
    }

    // Build occupancies array based on rooms, adults, and children
    const buildOccupancies = () => {
      const totalAdults = body.adults || 2;
      const totalChildren = body.children || 0; // This is a COUNT
      const totalRooms = body.rooms || 1;

      // Use provided childrenAges if available, otherwise default to age 10
      let childrenAges: number[] = [];
      if (body.childrenAges && Array.isArray(body.childrenAges) && body.childrenAges.length > 0) {
        // Use the provided ages array directly
        childrenAges = body.childrenAges.filter((age: any) => typeof age === 'number' && age >= 0 && age <= 17);
      } else if (typeof totalChildren === 'number' && totalChildren > 0) {
        for (let i = 0; i < totalChildren; i++) {
          childrenAges.push(10);
        }
      }

      // Distribute guests across rooms
      const occupancies = [];
      const adultsPerRoom = Math.ceil(totalAdults / totalRooms);
      const childrenPerRoom = Math.ceil(childrenAges.length / totalRooms);

      let remainingAdults = totalAdults;
      let remainingChildrenAges = [...childrenAges];

      for (let i = 0; i < totalRooms; i++) {
        const roomAdults = Math.min(adultsPerRoom, remainingAdults);
        remainingAdults -= roomAdults;

        const roomChildrenCount = Math.min(childrenPerRoom, remainingChildrenAges.length);
        const roomChildrenAges = remainingChildrenAges.splice(0, roomChildrenCount);

        occupancies.push({
          adults: roomAdults || 1, // At least 1 adult per room
          children: roomChildrenAges
        });
      }

      return occupancies;
    };

    const ratesPayload = JSON.stringify({
      checkin,
      checkout,
      currency,
      guestNationality,
      ...locationParams,
      ...filterParams,
      occupancies: buildOccupancies(),
      roomMapping: true,
      includeHotelData: true,
      timeout: 15
    });

    const t1 = Date.now();
    const ratesResponse = await fetch(`https://api.liteapi.travel/v3.0/hotels/rates`, {
      method: "POST",
      headers: { 'X-API-Key': LITEAPI_KEY, 'Content-Type': 'application/json' },
      body: ratesPayload
    });

    if (!ratesResponse.ok) {
      const errorText = await ratesResponse.text();
      console.error("LiteAPI Error:", errorText);
      throw new Error(`LiteAPI Rates ${ratesResponse.status}: ${errorText}`);
    }

    let ratesData = await ratesResponse.json() as { data: Hotel[], rooms?: any[] };
    const t2 = Date.now();
    console.log(`[Timing] Rates API: ${t2 - t1}ms, hotels: ${ratesData.data?.length || 0}`);

    let hotels = ratesData.data || [];

    if (hotels.length === 0) {
      return new Response(JSON.stringify({ data: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // 2. Fetch Hotel Details
    // Single hotel = individual endpoint (full details for property page)
    // Multiple hotels = batch endpoint (faster for search results)
    const hotelIds = hotels.slice(0, 20).map((h) => h.hotelId);
    let detailsData: { data: HotelDetails[] } = { data: [] };

    if (hotelIds.length === 1) {
      // Single hotel - full details including images, rooms, facilities
      const detailsResponse = await fetch(`https://api.liteapi.travel/v3.0/data/hotel?hotelId=${hotelIds[0]}`, {
        method: "GET",
        headers: { 'X-API-Key': LITEAPI_KEY, 'Content-Type': 'application/json' }
      });
      if (detailsResponse.ok) {
        const singleDetail = await detailsResponse.json();
        detailsData = { data: singleDetail.data ? [singleDetail.data] : [] };
      }
    } else {
      // Multiple hotels - use batch endpoint (1 call instead of 20)
      const hotelIdsParam = hotelIds.join(',');
      console.log(`[Details] Batch fetching ${hotelIds.length} hotels`);
      try {
        const batchUrl = countryCode
          ? `https://api.liteapi.travel/v3.0/data/hotels?hotelIds=${hotelIdsParam}&countryCode=${countryCode}`
          : `https://api.liteapi.travel/v3.0/data/hotels?hotelIds=${hotelIdsParam}`;
        const batchResponse = await fetch(batchUrl, {
          method: "GET",
          headers: { 'X-API-Key': LITEAPI_KEY, 'Content-Type': 'application/json' }
        });
        if (batchResponse.ok) {
          const batchData = await batchResponse.json();
          detailsData = { data: batchData.data || [] };
        } else {
          console.error(`[Details] Batch fetch failed: ${batchResponse.status}, falling back to individual`);
          // Fallback: fetch individually but limit to 10 for speed
          const limitedIds = hotelIds.slice(0, 10);
          const detailPromises = limitedIds.map(async (hotelId) => {
            try {
              const resp = await fetch(`https://api.liteapi.travel/v3.0/data/hotel?hotelId=${hotelId}`, {
                method: "GET",
                headers: { 'X-API-Key': LITEAPI_KEY, 'Content-Type': 'application/json' }
              });
              if (resp.ok) {
                const json = await resp.json();
                return json.data || null;
              }
              return null;
            } catch { return null; }
          });
          const allDetails = await Promise.all(detailPromises);
          detailsData = { data: allDetails.filter(Boolean) };
        }
      } catch (e) {
        console.error("[Details] Batch error:", e);
      }
    }
    const t3 = Date.now();
    console.log(`[Timing] Hotel details: ${t3 - t2}ms, fetched: ${detailsData.data.length}`);

    // Process the details data (whether from single or batch fetch)
    const detailsMap = new Map((detailsData.data || []).map((d) => [String(d.id), d]));

    // Compute dynamic city center from hotel coordinates (works for any city)
    const cityCenter = computeCentroid(hotels, detailsMap);

    // 4. Merge Details into Hotels
    hotels.forEach((hotel: Hotel) => {
      // Extract refundableTag and board/meal plan from roomTypes/rates (LiteAPI rates response)
      // Check if any room has a refundable rate - if so, mark hotel as refundable
      // Also extract board type (meal plan) info
      const boardTypes = new Set<string>();

      if (hotel.roomTypes && Array.isArray(hotel.roomTypes)) {
        for (const roomType of hotel.roomTypes) {
          const rt = roomType as any;

          // Check cancellationPolicies at roomType/offer level (per LiteAPI docs)
          if (rt.cancellationPolicies?.refundableTag === 'RFN') {
            hotel.refundableTag = 'RFN';
          } else if (rt.cancellationPolicies?.refundableTag === 'NRFN' && !hotel.refundableTag) {
            hotel.refundableTag = 'NRFN';
          }

          // Legacy: check refundableTag directly on roomType
          if (rt.refundableTag === 'RFN') hotel.refundableTag = 'RFN';
          else if (rt.refundableTag === 'NRFN' && !hotel.refundableTag) hotel.refundableTag = 'NRFN';

          if (roomType.rates && Array.isArray(roomType.rates)) {
            for (const rate of roomType.rates) {
              const r = rate as any;

              // refundableTag is INSIDE cancellationPolicies (per LiteAPI docs)
              const cancellationPolicies = r.cancellationPolicies;
              let refundTag = cancellationPolicies?.refundableTag || r.refundableTag;

              // Check cancelPolicyInfos for free cancellation
              let hasFreeCancellation = false;
              const cancelPolicyInfos = cancellationPolicies?.cancelPolicyInfos || r.cancelPolicyInfos;
              if (cancelPolicyInfos?.length > 0) {
                const sorted = [...cancelPolicyInfos].sort(
                  (a: any, b: any) => new Date(a.cancelTime).getTime() - new Date(b.cancelTime).getTime()
                );
                if (sorted[0].amount === 0) hasFreeCancellation = true;
              }

              if (refundTag === 'RFN' || r.refundable === true || hasFreeCancellation) {
                hotel.refundableTag = 'RFN';
              }
              if ((refundTag === 'NRFN' || r.refundable === false) && !hotel.refundableTag) {
                hotel.refundableTag = 'NRFN';
              }

              // Extract board/meal plan info
              const boardName = r.boardName || r.boardType || r.board || r.mealPlanName;
              if (boardName) boardTypes.add(boardName);
            }
          }
        }
      }
      hotel.boardTypes = Array.from(boardTypes);

      const detail = detailsMap.get(String(hotel.hotelId));
      if (detail) {
        hotel.details = detail;
        hotel.name = detail.name;
        hotel.starRating = detail.hotel_star_rating || detail.star_rating;
        hotel.thumbnailUrl = detail.main_photo;
        hotel.address = detail.address;
        hotel.location = detail.address;

        // Calculate distance from city centre using hotel coordinates
        const hotelLat = detail.latitude || detail.location?.latitude;
        const hotelLng = detail.longitude || detail.location?.longitude;
        if (hotelLat && hotelLng && cityCenter) {
          hotel.distance = calculateDistance(cityCenter.lat, cityCenter.lng, hotelLat, hotelLng);
        }

        // Map Description - Try various field names that LiteAPI may use
        const descriptionText = detail.description || detail.hotel_description || detail.short_description ||
          detail.hotelDescription || detail.propertyDescription ||
          detail.longDescription || detail.overviewText || detail.summary || "";
        if (descriptionText) {
          hotel.description = descriptionText;
        }
        // Map Reviews - Try various field names that LiteAPI may use
        hotel.reviewCount = detail.review_count || detail.cnt_reviews || detail.number_of_reviews ||
          detail.reviews_count || detail.hotelReviewCount || detail.reviewsCount ||
          (detail.reviews?.length) || 0;
        hotel.reviewRating = detail.review_score || detail.rating_average || detail.reviews_rating ||
          detail.hotelReviewRating || detail.reviewsRating || detail.rating ||
          hotel.starRating || 0;

        // Map Images - LiteAPI /data/hotel returns hotelImages array with url/urlHd
        const hotelImages = detail.hotelImages || detail.images || detail.hotel_photos || [];
        if (Array.isArray(hotelImages) && hotelImages.length > 0) {
          // Extract URLs, preferring HD versions
          hotel.images = hotelImages.map((img: any) => img.urlHd || img.url || img).filter(Boolean);
        } else if (detail.main_photo) {
          // Fallback to main_photo if no images array
          hotel.images = [detail.main_photo];
        }

        const detailRooms = detail.rooms || [];
        if (Array.isArray(detailRooms) && detailRooms.length > 0) {
          // Normalize room data structure for client-side matching
          hotel.detailRooms = detailRooms.map((room: any) => {
            // Extract photos from various possible LiteAPI structures
            const rawPhotos = room.photos || room.roomPhotos || room.images || room.roomImages || [];
            const normalizedPhotos = rawPhotos.map((p: any) => {
              if (typeof p === 'string') return { url: p };
              return {
                url: p.url || p.urlHd || p.hd_url || p.hdUrl || p.thumbnail || p
              };
            }).filter((p: any) => p.url);

            return {
              ...room,
              // Normalize ID field
              id: room.id || room.roomId || room.room_id,
              // Normalize name field
              roomName: room.roomName || room.name || room.room_name,
              // Normalize photos to consistent structure
              photos: normalizedPhotos
            };
          });
        }

        // Map Check-in/Check-out times
        if (detail.checkinCheckoutTimes) {
          hotel.checkInTime = detail.checkinCheckoutTimes.checkin || detail.checkinCheckoutTimes.checkinStart;
          hotel.checkOutTime = detail.checkinCheckoutTimes.checkout;
        }

        // Map Hotel Important Information (may contain policies like pet/child info)
        hotel.hotelImportantInformation = detail.hotelImportantInformation || detail.importantInformation || null;

        // Map Cancellation Policies
        if (detail.cancellationPolicies) {
          hotel.cancellationPolicies = detail.cancellationPolicies;
        }

        // Map Hotel Facilities (array of strings)
        hotel.hotelFacilities = detail.hotelFacilities || [];
        // Also try 'facilities' field (array of objects with name/facilityId)
        if (hotel.hotelFacilities.length === 0 && detail.facilities && Array.isArray(detail.facilities)) {
          hotel.hotelFacilities = detail.facilities.map((f: any) => f.name || f).filter(Boolean);
        }

        // Map Coordinates
        hotel.latitude = detail.latitude;
        hotel.longitude = detail.longitude;

        // Map City/Country
        hotel.city = detail.city;
        hotel.country = detail.country;
        hotel.countryCode = detail.countryCode;
      }
    });

    console.log(`[Timing] TOTAL: ${Date.now() - t0}ms (rates: ${t2 - t1}ms, details: ${t3 - t2}ms, merge: ${Date.now() - t3}ms) — ${hotels.length} hotels`);

    return new Response(JSON.stringify({
      data: hotels
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error: any) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({
      error: "Search Failed",
      details: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});
